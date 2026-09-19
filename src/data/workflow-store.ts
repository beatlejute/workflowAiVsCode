/**
 * WorkflowStore - Central in-memory reactive data store
 *
 * Provides a single source of truth for all UI components.
 * Implements event-driven architecture with batched events on refresh.
 *
 * ADR-002: Files are source of truth, in-memory cache for performance
 * ADR-005: Event-driven architecture for reactive UI updates
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';
import { getTicketsDir, getReportsDir } from '../utils/path-utils';
import {
  Ticket,
  Plan,
  Report,
  ReviewEntry,
  WorkflowConfig,
  PipelineConfig,
  TicketStatus,
  PlanTemplate
} from './types';
import { parse as parseFrontmatter } from './frontmatter-parser';
import { ConfigManager } from './config-manager';
import { IStore } from '../interfaces/IStore';

/**
 * The `## Ревью` / `## Review` section.
 *
 * Anchored to the start of a line and required to end there: tickets routinely
 * mention the section by name in prose (`вставить запись в таблицу `## Ревью``),
 * and an unanchored match latches onto that mention instead — then reads to the
 * next heading and finds no rows at all. Fourteen real tickets lost every badge
 * that way.
 *
 * No `m` flag: `\s*$` in the lookahead must mean end of input, not end of line.
 */
const REVIEW_SECTION_RE = /(?:^|\n)##[ \t]+(?:Ревью|Review)[ \t\r]*(?=\n)([\s\S]*?)(?=\n## |\n---|\s*$)/g;

/**
 * A date at the start of a review row: `YYYY-MM-DD`, optionally a time after a
 * space or `T`, optionally seconds, optionally `Z` or a `+HH:MM` offset.
 * Anything after that (`(attempt 6)` and friends) is ignored.
 */
const REVIEW_DATE_RE = /^(\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\s*Z|\s*[+-]\d{2}:?\d{2})?)?)/;

/**
 * A verdict cell that opens with a symbol: `✅ passed`, `❌ failed`,
 * `⏳ in review`, `✅ passed (attempt 2)`. Captures the symbol run and the rest.
 *
 * Restricted to pictographic symbols rather than "any non-letter". A blanket
 * class also matches a backtick, an asterisk, a dash or a bracket, so a summary
 * like `` `config.yaml` обновлён `` or an agent name in backticks would be read
 * as a verdict when it comes before the real one.
 */
const REVIEW_VERDICT_RE = /^([\p{So}\p{Extended_Pictographic}‍️]+)\s*(.*)$/u;

/**
 * Verdicts written without a symbol. Kept deliberately short — a bare word is
 * only treated as a verdict when it is one of these, otherwise an agent name
 * like `claude-sonnet` in the same position would be mistaken for one.
 */
const BARE_VERDICTS = new Set([
  'passed', 'failed', 'fixed', 'pass', 'fail', 'ok', 'approved', 'rejected', 'skipped', 'blocked'
]);

/** Table separator: `|---|---|` and its `:---:` variants. */
const TABLE_SEPARATOR_RE = /^\|[\s:|-]+\|?$/;

/** Sort key for review dates: `T` → space so that times order correctly. */
function reviewSortKey(date: string): string {
  return date.replace('T', ' ');
}

/**
 * Splits a markdown table row into trimmed cells, dropping the outer pipes.
 */
function splitRowCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim());
}

/**
 * Parses one row of a review table, or returns null when the line is not one
 * (separator, header, prose, a row without a date or without a verdict).
 */
function parseReviewRow(line: string): ReviewEntry | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || TABLE_SEPARATOR_RE.test(trimmed)) { return null; }

  const cells = splitRowCells(trimmed);
  if (cells.length < 2) { return null; }

  // Столбец 1 — дата. Заголовок («Дата»/«Date») отсеивается здесь же.
  const dateMatch = cells[0].match(REVIEW_DATE_RE);
  if (!dateMatch) { return null; }

  // Вердикт ищем по содержимому: позиция столбца в реальных тикетах плавает.
  for (let i = 1; i < cells.length; i++) {
    const verdict = parseVerdictCell(cells[i]);
    if (!verdict) { continue; }
    return {
      date: dateMatch[1],
      icon: verdict.icon,
      status: verdict.status,
      summary: (cells[i + 1] ?? '').trim()
    };
  }

  return null;
}

/**
 * Recognises a verdict cell. Returns null for anything else — an agent name, a
 * summary, an empty cell.
 */
function parseVerdictCell(cell: string): { icon: string; status: string } | null {
  if (!cell) { return null; }

  const symbolMatch = cell.match(REVIEW_VERDICT_RE);
  if (symbolMatch && symbolMatch[2]) {
    return { icon: symbolMatch[1], status: symbolMatch[2].trim() };
  }

  // Без значка вердиктом считается только слово из короткого списка.
  const firstWord = cell.split(/\s+/)[0].toLowerCase();
  if (BARE_VERDICTS.has(firstWord)) {
    return { icon: '', status: cell };
  }

  return null;
}

/**
 * Event types that can be emitted by the store
 */
export type StoreEventType = 'ticket' | 'plan' | 'report' | 'config' | 'plan-template';

/**
 * Operation types for store changes
 */
export type StoreOperationType = 'add' | 'update' | 'delete' | 'refresh';

/**
 * Event emitted when store data changes
 */
export interface StoreChangeEvent {
  type: StoreEventType;
  id?: string;
  operation: StoreOperationType;
}

/**
 * WorkflowStore - Central reactive data store
 *
 * Provides unified access to tickets, plans, reports, and configuration.
 * Supports both full refresh and incremental updates with event notifications.
 */
export class WorkflowStore implements IStore {
  // Data storage
  private tickets: Map<string, Ticket> = new Map();
  private plans: Map<string, Plan> = new Map();
  private reports: Report[] = [];
  private config: WorkflowConfig | undefined;
  private pipeline: PipelineConfig | undefined;
  private planTemplates: Map<string, PlanTemplate> = new Map();

  // Event handling
  private readonly eventEmitter: EventEmitter = new EventEmitter();
  private configManager: ConfigManager;
  private workflowRoot: string | null = null;

  /**
   * Event listener registration
   * Subscribe to store changes for reactive UI updates - returns unsubscribe function
   */
  public readonly onDidChange: (listener: (event: StoreChangeEvent) => void) => () => void;

  constructor() {
    this.configManager = new ConfigManager();
    this.onDidChange = (listener: (event: StoreChangeEvent) => void) => {
      this.eventEmitter.on('change', listener);
      return () => this.eventEmitter.removeListener('change', listener);
    };
  }

  /**
   * Set the workflow root directory without performing a full scan.
   * Used by tests and lightweight init paths that need the path stored
   * but not the cost of refresh().
   */
  setWorkflowRoot(workflowRoot: string | null): void {
    this.workflowRoot = workflowRoot;
  }

  /**
   * Refresh all data from disk
   * Scans all ticket folders, plans, reports, and configuration
   * Emits a single 'refresh' event when complete (batching)
   *
   * @param workflowRoot - Root directory of the workflow project
   */
  async refresh(workflowRoot: string): Promise<void> {
    this.workflowRoot = workflowRoot;

    // Clear existing data
    this.tickets.clear();
    this.plans.clear();
    this.reports = [];
    this.planTemplates.clear();

    // Load configuration first
    try {
      this.config = await this.configManager.loadConfig(workflowRoot);
      this.pipeline = await this.configManager.loadPipeline(workflowRoot);
    } catch (error) {
      // Configuration is optional for store to function
      // Log error but continue with ticket/plan/report loading
      console.error('Failed to load configuration:', error);
    }

    // Scan all ticket status folders
    const ticketStatuses: TicketStatus[] = [
      TicketStatus.Backlog,
      TicketStatus.Ready,
      TicketStatus.InProgress,
      TicketStatus.Blocked,
      TicketStatus.Review,
      TicketStatus.Done
    ];

    for (const status of ticketStatuses) {
      await this.scanTicketsForStatus(workflowRoot, status);
    }

    // Scan plans (current and archive)
    await this.scanPlans(workflowRoot);

    // Scan reports
    await this.scanReports(workflowRoot);

    // Scan plan templates
    await this.scanPlanTemplates(workflowRoot);

    // Emit single batched refresh event
    this.emitEvent({ type: 'ticket', operation: 'refresh' });
    this.emitEvent({ type: 'plan', operation: 'refresh' });
    this.emitEvent({ type: 'report', operation: 'refresh' });
    this.emitEvent({ type: 'plan-template', operation: 'refresh' });
    if (this.config || this.pipeline) {
      this.emitEvent({ type: 'config', operation: 'refresh' });
    }
  }

  /**
   * Scan tickets for a specific status folder
   */
  private async scanTicketsForStatus(workflowRoot: string, status: TicketStatus): Promise<void> {
    const statusDir = getTicketsDir(workflowRoot, status);

    try {
      const entries = await fs.readdir(statusDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('.')) {
          const filePath = path.join(statusDir, entry.name);
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const { frontmatter, body } = parseFrontmatter<Ticket>(content);
            if (!frontmatter.id) { continue; }

            // Parse review entries from body
            const reviews = WorkflowStore.parseReviews(body);

            // Ensure the ticket has the correct status from the folder
            const ticket: Ticket = { ...frontmatter, status, ...(reviews.length > 0 ? { reviews } : {}) };
            this.tickets.set(ticket.id, ticket);
          } catch (error) {
            console.error(`Failed to parse ticket ${filePath}:`, error);
          }
        }
      }
    } catch (error) {
      // Folder may not exist - skip silently
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`Failed to scan tickets for status ${status}:`, error);
      }
    }
  }

  /**
   * Parse review entries from ticket markdown body.
   *
   * Rows live in a table under `## Ревью` / `## Review`, but their shape is not
   * fixed. Real tickets carry at least these layouts, sometimes inside one and
   * the same table:
   *
   *   | 2026-04-30 | ✅ passed | summary |                    3 columns
   *   | 2026-05-01 10:50 | ✅ passed | summary | human |      agent last (header order)
   *   | 2026-05-02 | claude-sonnet | ✅ passed | summary |    agent second (rows that ignore the header)
   *
   * Dates appear as `YYYY-MM-DD`, with a time after a space or a `T`, with or
   * without seconds and a `Z`/offset, and occasionally with a trailing note
   * such as `(attempt 6)`. Verdicts are not a closed set either: `✅ passed`,
   * `❌ failed`, `✅ passed (attempt 2)`, `⏳ in review`, `✅ PASS`, plain `fixed`.
   *
   * So the columns are identified by content rather than by position: the first
   * cell is the date, the verdict is the first cell after it that looks like a
   * verdict, and the summary is whatever follows the verdict.
   */
  static parseReviews(body: string): ReviewEntry[] {
    // Секций бывает несколько: pipeline-fallback дописывает новую вместо
    // строки в существующую, и таких тикетов в проектах полтора десятка.
    const reviews: ReviewEntry[] = [];
    for (const section of body.matchAll(REVIEW_SECTION_RE)) {
      for (const line of section[1].split('\n')) {
        const entry = parseReviewRow(line);
        if (entry) { reviews.push(entry); }
      }
    }
    if (reviews.length === 0) { return []; }

    // Сортируем по дате (хронологически), чтобы порядок строк в таблице не влиял.
    // `T` приводится к пробелу, иначе «2026-05-01T09:00» встало бы после
    // «2026-05-01 23:00» (код 'T' больше кода пробела).
    reviews.sort((a, b) => reviewSortKey(a.date).localeCompare(reviewSortKey(b.date)));

    return reviews;
  }

  /**
   * Scan plans from current and archive folders
   */
  private async scanPlans(workflowRoot: string): Promise<void> {
    const planDirs = [
      path.join(workflowRoot, 'plans', 'current'),
      path.join(workflowRoot, 'plans', 'archive')
    ];

    for (const planDir of planDirs) {
      const folder = planDir.endsWith('current') ? 'current' as const : 'archive' as const;
      try {
        const entries = await fs.readdir(planDir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('.')) {
            const filePath = path.join(planDir, entry.name);
            try {
              const content = await fs.readFile(filePath, 'utf-8');
              const { frontmatter } = parseFrontmatter<Plan>(content);
              if (!frontmatter.id) { continue; }
              this.plans.set(frontmatter.id, { ...frontmatter, folder });
            } catch (error) {
              console.error(`Failed to parse plan ${filePath}:`, error);
            }
          }
        }
      } catch (error) {
        // Folder may not exist - skip silently
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.error(`Failed to scan plans in ${planDir}:`, error);
        }
      }
    }
  }

  /**
   * Scan reports from reports folder
   */
  private async scanReports(workflowRoot: string): Promise<void> {
    const reportsDir = getReportsDir(workflowRoot);

    try {
      const entries = await fs.readdir(reportsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('.')) {
          const filePath = path.join(reportsDir, entry.name);
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const { frontmatter } = parseFrontmatter<Report>(content);
            if (!frontmatter.id) { continue; }
            this.reports.push(frontmatter);
          } catch (error) {
            console.error(`Failed to parse report ${filePath}:`, error);
          }
        }
      }
    } catch (error) {
      // Folder may not exist - skip silently
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.error(`Failed to scan reports:`, error);
      }
    }
  }

  /**
   * Scan plan templates from plans/templates folder
   */
  private async scanPlanTemplates(workflowRoot: string): Promise<void> {
    const templatesDir = path.join(workflowRoot, 'plans', 'templates');

    try {
      const entries = await fs.readdir(templatesDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('.')) {
          const filePath = path.join(templatesDir, entry.name);
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const { frontmatter } = parseFrontmatter<PlanTemplate>(content);
            if (!frontmatter.id) { continue; }
            this.planTemplates.set(frontmatter.id, frontmatter);
          } catch (error) {
            console.error(`Failed to parse plan template ${filePath}:`, error);
          }
        }
      }
    } catch (error) {
      // Folder may not exist - skip silently
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`Failed to scan plan templates:`, error);
      }
    }
  }

  /**
   * Emit a store change event
   */
  private emitEvent(event: StoreChangeEvent): void {
    console.log(`[WorkflowStore] emitEvent: type=${event.type} id=${event.id || 'none'} operation=${event.operation || 'none'}`);
    this.eventEmitter.emit('change', event);
  }

  // ==================== Incremental Update Methods ====================

  /**
   * Parse a file and return the parsed entity (ticket, plan, report, or plan-template)
   * Used by updateFile() for incremental updates
   */
  private async parseFile(filePath: string): Promise<{ type: 'ticket' | 'plan' | 'report' | 'plan-template'; data: Ticket | Plan | Report | PlanTemplate; status?: TicketStatus } | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const relativePath = path.relative(this.workflowRoot ?? '', filePath);
      const pathParts = relativePath.split(path.sep);

      // Check for tickets: tickets/{status}/{ID}.md
      if (pathParts[0] === 'tickets' && pathParts.length >= 3) {
        const status = pathParts[1] as TicketStatus;
        const { frontmatter, body } = parseFrontmatter<Ticket>(content);
        if (!frontmatter.id) { return null; }
        const reviews = WorkflowStore.parseReviews(body);
        return { type: 'ticket', data: { ...frontmatter, status, ...(reviews.length > 0 ? { reviews } : {}) }, status };
      }

      // Plan templates: plans/templates/{ID}.md — must check BEFORE general plans/ branch
      if (pathParts[0] === 'plans' && pathParts[1] === 'templates' && pathParts.length >= 3) {
        const { frontmatter } = parseFrontmatter<PlanTemplate>(content);
        if (!frontmatter.id) { return null; }
        return { type: 'plan-template', data: frontmatter };
      }

      // Check for plans: plans/current/{ID}.md or plans/archive/{ID}.md
      // Explicitly check for 'current' or 'archive' — do NOT treat templates as current
      if (pathParts[0] === 'plans' && pathParts.length >= 3) {
        if (pathParts[1] !== 'current' && pathParts[1] !== 'archive') {
          return null; // Unknown plans subfolder (e.g. templates) — skip
        }
        const folder = pathParts[1] as 'current' | 'archive';
        const { frontmatter } = parseFrontmatter<Plan>(content);
        if (!frontmatter.id) { return null; }
        return { type: 'plan', data: { ...frontmatter, folder } };
      }

      // Check for reports: reports/{ID}.md
      if (pathParts[0] === 'reports' && pathParts.length >= 2) {
        const { frontmatter } = parseFrontmatter<Report>(content);
        if (!frontmatter.id) { return null; }
        return { type: 'report', data: frontmatter };
      }

      return null;
    } catch (error) {
      console.error(`Failed to parse file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Update cache with a parsed entity
   * Emits appropriate add/update event
   */
  private updateCache(filePath: string, entity: { type: 'ticket' | 'plan' | 'report' | 'plan-template'; data: Ticket | Plan | Report | PlanTemplate; status?: TicketStatus }): void {
    if (entity.type === 'ticket') {
      const ticket = entity.data as Ticket;
      const isNew = !this.tickets.has(ticket.id);
      this.tickets.set(ticket.id, ticket);
      this.emitEvent({
        type: 'ticket',
        id: ticket.id,
        operation: isNew ? 'add' : 'update'
      });
    } else if (entity.type === 'plan') {
      const plan = entity.data as Plan;
      const isNew = !this.plans.has(plan.id);
      this.plans.set(plan.id, plan);
      this.emitEvent({
        type: 'plan',
        id: plan.id,
        operation: isNew ? 'add' : 'update'
      });
    } else if (entity.type === 'report') {
      const report = entity.data as Report;
      const index = this.reports.findIndex(r => r.id === report.id);
      if (index === -1) {
        this.reports.push(report);
      } else {
        this.reports[index] = report;
      }
      this.emitEvent({
        type: 'report',
        id: report.id,
        operation: 'add'
      });
    } else if (entity.type === 'plan-template') {
      const template = entity.data as PlanTemplate;
      const isNew = !this.planTemplates.has(template.id);
      this.planTemplates.set(template.id, template);
      this.emitEvent({
        type: 'plan-template',
        id: template.id,
        operation: isNew ? 'add' : 'update'
      });
    }
  }

  /**
   * Remove an entity from cache based on file path
   * Emits appropriate delete event
   */
  private removeFromCache(filePath: string): void {
    const relativePath = path.relative(this.workflowRoot ?? '', filePath);
    const pathParts = relativePath.split(path.sep);

    // Check for tickets: tickets/{status}/{ID}.md
    if (pathParts[0] === 'tickets' && pathParts.length >= 3) {
      const fileName = pathParts[2];
      const id = fileName.replace('.md', '');
      if (this.tickets.has(id)) {
        this.tickets.delete(id);
        this.emitEvent({ type: 'ticket', id, operation: 'delete' });
      }
    }

    // Plan templates: plans/templates/{ID}.md — must check BEFORE general plans/ branch
    if (pathParts[0] === 'plans' && pathParts[1] === 'templates' && pathParts.length >= 3) {
      const fileName = pathParts[2];
      const id = fileName.replace('.md', '');
      if (this.planTemplates.has(id)) {
        this.planTemplates.delete(id);
        this.emitEvent({ type: 'plan-template', id, operation: 'delete' });
      }
      return; // Don't fall through to general plans branch
    }

    // Check for plans: plans/{current|archive}/{ID}.md
    if (pathParts[0] === 'plans' && pathParts.length >= 3) {
      const fileName = pathParts[2];
      const id = fileName.replace('.md', '');
      if (this.plans.has(id)) {
        this.plans.delete(id);
        this.emitEvent({ type: 'plan', id, operation: 'delete' });
      }
    }

    // Check for reports: reports/{ID}.md
    if (pathParts[0] === 'reports' && pathParts.length >= 2) {
      const fileName = pathParts[1];
      const id = fileName.replace('.md', '');
      const index = this.reports.findIndex(r => r.id === id);
      if (index !== -1) {
        this.reports.splice(index, 1);
        this.emitEvent({ type: 'report', id, operation: 'delete' });
      }
    }
  }

  /**
   * Incremental update for a single file change
   * Parses only the changed file and updates cache without full refresh
   *
   * @param filePath - Path to the changed file
   * @param changeType - Type of change: 'create', 'change', or 'delete'
   */
  async updateFile(filePath: string, changeType: 'create' | 'change' | 'delete'): Promise<void> {
    if (changeType === 'delete') {
      this.removeFromCache(filePath);
    } else {
      const entity = await this.parseFile(filePath);
      if (entity) {
        this.updateCache(filePath, entity);
      }
    }
    this.emitEvent({ type: 'ticket', operation: 'refresh' });
    this.emitEvent({ type: 'plan', operation: 'refresh' });
    this.emitEvent({ type: 'report', operation: 'refresh' });
    this.emitEvent({ type: 'plan-template', operation: 'refresh' });
  }

  /**
   * Add a new ticket to the store
   * Emits an 'add' event for the ticket
   */
  addTicket(ticket: Ticket): void {
    const isNew = !this.tickets.has(ticket.id);
    this.tickets.set(ticket.id, ticket);
    this.emitEvent({
      type: 'ticket',
      id: ticket.id,
      operation: isNew ? 'add' : 'update'
    });
  }

  /**
   * Update an existing ticket
   * Emits an 'update' event for the ticket
   */
  updateTicket(id: string, ticket: Ticket): void {
    if (!this.tickets.has(id)) {
      throw new Error(`Ticket ${id} not found for update`);
    }
    this.tickets.set(id, ticket);
    this.emitEvent({ type: 'ticket', id, operation: 'update' });
  }

  /**
   * Remove a ticket from the store
   * Emits a 'delete' event for the ticket
   */
  removeTicket(id: string): void {
    if (!this.tickets.has(id)) {
      throw new Error(`Ticket ${id} not found for removal`);
    }
    this.tickets.delete(id);
    this.emitEvent({ type: 'ticket', id, operation: 'delete' });
  }

  /**
   * Add a new plan to the store
   * Emits an 'add' event for the plan
   */
  addPlan(plan: Plan): void {
    const isNew = !this.plans.has(plan.id);
    this.plans.set(plan.id, plan);
    this.emitEvent({
      type: 'plan',
      id: plan.id,
      operation: isNew ? 'add' : 'update'
    });
  }

  /**
   * Update an existing plan
   * Emits an 'update' event for the plan
   */
  updatePlan(id: string, plan: Plan): void {
    if (!this.plans.has(id)) {
      throw new Error(`Plan ${id} not found for update`);
    }
    this.plans.set(id, plan);
    this.emitEvent({ type: 'plan', id, operation: 'update' });
  }

  /**
   * Remove a plan from the store
   * Emits a 'delete' event for the plan
   */
  removePlan(id: string): void {
    if (!this.plans.has(id)) {
      throw new Error(`Plan ${id} not found for removal`);
    }
    this.plans.delete(id);
    this.emitEvent({ type: 'plan', id, operation: 'delete' });
  }

  /**
   * Add a new report to the store
   * Emits an 'add' event for the report
   */
  addReport(report: Report): void {
    this.reports.push(report);
    this.emitEvent({
      type: 'report',
      id: report.id,
      operation: 'add'
    });
  }

  /**
   * Update an existing report
   * Emits an 'update' event for the report
   */
  updateReport(id: string, report: Report): void {
    const index = this.reports.findIndex(r => r.id === id);
    if (index === -1) {
      throw new Error(`Report ${id} not found for update`);
    }
    this.reports[index] = report;
    this.emitEvent({ type: 'report', id, operation: 'update' });
  }

  /**
   * Remove a report from the store
   * Emits a 'delete' event for the report
   */
  removeReport(id: string): void {
    const index = this.reports.findIndex(r => r.id === id);
    if (index === -1) {
      throw new Error(`Report ${id} not found for removal`);
    }
    this.reports.splice(index, 1);
    this.emitEvent({ type: 'report', id, operation: 'delete' });
  }

  /**
   * Update configuration
   * Emits a 'config' event
   */
  setConfig(config: WorkflowConfig | undefined): void {
    this.config = config;
    this.emitEvent({ type: 'config', operation: 'update' });
  }

  /**
   * Update pipeline configuration
   * Emits a 'config' event
   */
  setPipeline(pipeline: PipelineConfig | undefined): void {
    this.pipeline = pipeline;
    this.emitEvent({ type: 'config', operation: 'update' });
  }

  // ==================== Query Methods ====================

  /**
   * Get all tickets
   */
  getTickets(): Ticket[] {
    return Array.from(this.tickets.values());
  }

  /**
   * Get a ticket by ID
   */
  getTicketById(id: string): Ticket | undefined {
    return this.tickets.get(id);
  }

  /**
   * Get tickets filtered by status
   */
  getTicketsByStatus(status: TicketStatus): Ticket[] {
    return Array.from(this.tickets.values()).filter(t => t.status === status);
  }

  /**
   * Get tickets filtered by priority
   */
  getTicketsByPriority(priority: number): Ticket[] {
    return Array.from(this.tickets.values()).filter(t => t.priority === priority);
  }

  /**
   * Get tickets that depend on a specific ticket
   */
  getTicketsWithDependency(dependencyId: string): Ticket[] {
    return Array.from(this.tickets.values()).filter(t =>
      t.dependencies.includes(dependencyId)
    );
  }

  /**
   * Get all plans
   */
  getPlans(): Plan[] {
    return Array.from(this.plans.values());
  }

  /**
   * Get a plan by ID
   */
  getPlanById(id: string): Plan | undefined {
    return this.plans.get(id);
  }

  /**
   * Get plans from current folder only
   */
  getCurrentPlans(): Plan[] {
    return Array.from(this.plans.values()).filter(p => p.folder === 'current');
  }

  /**
   * Get archived plans only
   */
  getArchivedPlans(): Plan[] {
    return Array.from(this.plans.values()).filter(p => p.folder === 'archive');
  }

  /**
   * Get all plan templates
   */
  getPlanTemplates(): PlanTemplate[] {
    return Array.from(this.planTemplates.values());
  }

  /**
   * Get a plan template by ID
   */
  getPlanTemplateById(id: string): PlanTemplate | undefined {
    return this.planTemplates.get(id);
  }

  /**
   * Update a plan template in the store
   */
  updatePlanTemplate(id: string, template: PlanTemplate): void {
    if (!this.planTemplates.has(id)) {
      throw new Error(`Plan template ${id} not found for update`);
    }
    this.planTemplates.set(id, template);
    this.emitEvent({ type: 'plan-template', id, operation: 'update' });
  }

  /**
   * Add a new plan template to the store
   */
  addPlanTemplate(template: PlanTemplate): void {
    const isNew = !this.planTemplates.has(template.id);
    this.planTemplates.set(template.id, template);
    this.emitEvent({
      type: 'plan-template',
      id: template.id,
      operation: isNew ? 'add' : 'update'
    });
  }

  /**
   * Remove a plan template from the store
   */
  removePlanTemplate(id: string): void {
    if (!this.planTemplates.has(id)) {
      throw new Error(`Plan template ${id} not found for removal`);
    }
    this.planTemplates.delete(id);
    this.emitEvent({ type: 'plan-template', id, operation: 'delete' });
  }

  /**
   * Get all reports
   */
  getReports(): Report[] {
    return this.reports;
  }

  /**
   * Get a report by ID
   */
  getReportById(id: string): Report | undefined {
    return this.reports.find(r => r.id === id);
  }

  /**
   * Get workflow configuration
   */
  getConfig(): WorkflowConfig | undefined {
    return this.config;
  }

  /**
   * Get pipeline configuration
   */
  getPipeline(): PipelineConfig | undefined {
    return this.pipeline;
  }

  /**
   * Get the workflow root directory
   */
  getWorkflowRoot(): string | null {
    return this.workflowRoot;
  }

  /**
   * Clear all data from the store
   */
  clear(): void {
    this.tickets.clear();
    this.plans.clear();
    this.reports = [];
    this.planTemplates.clear();
    this.config = undefined;
    this.pipeline = undefined;
    this.workflowRoot = null;
  }

  /**
   * Dispose of the store and clean up resources
   * Removes all event listeners to prevent memory leaks
   */
  dispose(): void {
    this.eventEmitter.removeAllListeners();
    this.configManager.dispose();
  }

  /**
   * Get store statistics
   */
  getStats(): {
    ticketCount: number;
    planCount: number;
    reportCount: number;
    hasConfig: boolean;
    hasPipeline: boolean;
  } {
    return {
      ticketCount: this.tickets.size,
      planCount: this.plans.size,
      reportCount: this.reports.length,
      hasConfig: !!this.config,
      hasPipeline: !!this.pipeline
    };
  }
}
