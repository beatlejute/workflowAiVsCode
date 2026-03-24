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
  TicketStatus
} from './types';
import { parse as parseFrontmatter } from './frontmatter-parser';
import { ConfigManager } from './config-manager';
import { IStore } from '../interfaces/IStore';

/**
 * Event types that can be emitted by the store
 */
export type StoreEventType = 'ticket' | 'plan' | 'report' | 'config';

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

  // Event handling
  private readonly eventEmitter: EventEmitter = new EventEmitter();
  private configManager: ConfigManager;
  private workflowRoot: string | null = null;

  /**
   * Event listener registration
   * Subscribe to store changes for reactive UI updates
   */
  public readonly onDidChange: (listener: (event: StoreChangeEvent) => void) => void;

  constructor() {
    this.configManager = new ConfigManager();
    this.onDidChange = (listener: (event: StoreChangeEvent) => void) => {
      this.eventEmitter.on('change', listener);
    };
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

    // Emit single batched refresh event
    this.emitEvent({ type: 'ticket', operation: 'refresh' });
    this.emitEvent({ type: 'plan', operation: 'refresh' });
    this.emitEvent({ type: 'report', operation: 'refresh' });
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
   * Expects a table under ## Ревью or ## Review with rows like:
   * | date | ✅ passed / ❌ failed | summary |
   */
  static parseReviews(body: string): ReviewEntry[] {
    const sectionMatch = body.match(/## (?:Ревью|Review)([\s\S]*?)(?=\n## |\n---|\s*$)/);
    if (!sectionMatch) { return []; }

    const section = sectionMatch[1];
    const reviews: ReviewEntry[] = [];
    const rowRegex = /\|\s*(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?)\s*\|\s*(\S+)\s+(\w+)\s*\|\s*([^|\n]*)\|?/g;
    let match: RegExpExecArray | null;

    while ((match = rowRegex.exec(section)) !== null) {
      reviews.push({
        date: match[1],
        icon: match[2],
        status: match[3],
        summary: match[4].trim()
      });
    }

    // Сортируем по дате (хронологически), чтобы порядок строк в таблице не влиял
    reviews.sort((a, b) => a.date.localeCompare(b.date));

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
   * Emit a store change event
   */
  private emitEvent(event: StoreChangeEvent): void {
    this.eventEmitter.emit('change', event);
  }

  // ==================== Incremental Update Methods ====================

  /**
   * Parse a file and return the parsed entity (ticket, plan, or report)
   * Used by updateFile() for incremental updates
   */
  private async parseFile(filePath: string): Promise<{ type: 'ticket' | 'plan' | 'report'; data: Ticket | Plan | Report; status?: TicketStatus } | null> {
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

      // Check for plans: plans/current/{ID}.md or plans/archive/{ID}.md
      if (pathParts[0] === 'plans' && pathParts.length >= 3) {
        const folder = pathParts[1] === 'archive' ? 'archive' as const : 'current' as const;
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
  private updateCache(filePath: string, entity: { type: 'ticket' | 'plan' | 'report'; data: Ticket | Plan | Report; status?: TicketStatus }): void {
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

    // Check for plans: plans/{folder}/{ID}.md
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
   * Get plans from archive folder only
   */
  getArchivedPlans(): Plan[] {
    return Array.from(this.plans.values()).filter(p => p.folder === 'archive');
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
