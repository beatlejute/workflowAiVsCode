/**
 * PlanService - CRUD operations for workflow plans
 *
 * Provides plan management with support for:
 * - CRUD operations (Create, Read, Update, Delete)
 * - Plan-ticket relationships
 * - Progress tracking
 * - Archival of completed plans
 *
 * ADR-002: Files are source of truth, WorkflowStore provides in-memory cache
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { WorkflowStore } from '../data/workflow-store';
import { Plan, Ticket, TicketStatus } from '../data/types';
import { parse as parseFrontmatter } from '../data/frontmatter-parser';
import { safeDump } from '../utils/yaml-utils';

/**
 * Plan progress information
 */
export interface PlanProgress {
  total: number;
  done: number;
  percentage: number;
}

/**
 * PlanService - Service layer for plan management
 */
export class PlanService {
  private readonly store: WorkflowStore;
  private readonly workflowRoot: string;

  constructor(store: WorkflowStore, workflowRoot: string) {
    this.store = store;
    this.workflowRoot = workflowRoot;
  }

  // ==================== Read Operations ====================

  /**
   * Get all plans from the store
   */
  getAll(): Plan[] {
    return this.store.getPlans();
  }

  /**
   * Get only non-archived plans (status != 'archived')
   */
  getCurrent(): Plan[] {
    return this.store.getCurrentPlans();
  }

  /**
   * Get only archived plans (status == 'archived')
   */
  getArchived(): Plan[] {
    return this.store.getArchivedPlans();
  }

  /**
   * Get a plan by ID
   * @param id - Plan ID to retrieve
   * @returns Plan or undefined if not found
   */
  getById(id: string): Plan | undefined {
    return this.store.getPlanById(id);
  }

  // ==================== Create Operation ====================

  /**
   * Create a new plan
   *
   * - Generates ID: PLAN-{NNN} - max number + 1
   * - Reads template from .workflow/templates/plan-template.md
   * - Fills frontmatter (id, title, status='draft', created_at, author)
   * - Saves to plans/current/
   *
   * @param title - Plan title
   * @param fields - Optional partial plan fields
   * @returns Created plan
   */
  async create(title: string, fields?: Partial<Plan>): Promise<Plan> {
    const now = new Date().toISOString();

    // Generate next plan ID
    const nextId = await this.generateNextPlanId();

    // Read template
    const templatePath = path.join(this.workflowRoot, 'templates', 'plan-template.md');
    let templateContent: string;

    try {
      templateContent = await fs.readFile(templatePath, 'utf-8');
    } catch {
      // Use default template if file not found
      templateContent = this.getDefaultTemplate();
    }

    // Parse template frontmatter
    const { frontmatter: templateFrontmatter, body } = parseFrontmatter<Plan>(templateContent);

    // Fill frontmatter
    const newPlan: Plan = {
      ...templateFrontmatter,
      id: nextId,
      title,
      status: 'draft',
      author: fields?.author || 'unknown',
      created_at: now,
      updated_at: now,
      completed_at: '',
      previous_plan: fields?.previous_plan || '',
      related_reports: fields?.related_reports || [],
      ...fields
    };

    // Generate file content
    const fileContent = this.generatePlanFileContent(newPlan, body);

    // Save to plans/current/
    const plansDir = path.join(this.workflowRoot, 'plans', 'current');
    const filePath = path.join(plansDir, nextId + '.md');

    // Ensure directory exists
    await fs.mkdir(plansDir, { recursive: true });

    // Write file
    await fs.writeFile(filePath, fileContent, 'utf-8');

    // Update store
    this.store.addPlan(newPlan);

    return newPlan;
  }

  /**
   * Generate next plan ID (PLAN-{NNN})
   */
  private async generateNextPlanId(): Promise<string> {
    const allPlans = this.getAll();

    if (allPlans.length === 0) {
      return 'PLAN-001';
    }

    // Extract numbers from existing plan IDs
    const planNumbers = allPlans
      .map(plan => plan.id)
      .filter(id => id.startsWith('PLAN-'))
      .map(id => parseInt(id.replace('PLAN-', ''), 10))
      .filter(num => !isNaN(num));

    const maxNumber = Math.max(...planNumbers, 0);
    const nextNumber = maxNumber + 1;

    return 'PLAN-' + String(nextNumber).padStart(3, '0');
  }

  /**
   * Create a new plan from a template file
   *
   * - Reads template from plans/templates/
   * - Generates next PLAN-{NNN} id
   * - Replaces frontmatter fields (id, status, created_at, updated_at, completed_at)
   * - Writes to plans/current/ with flag 'wx' (fail-if-exists)
   * - Returns the created plan and file path
   *
   * @param templatePath - Absolute path to the template .md file
   * @returns Object with created plan and file path
   */
  async createFromTemplate(templatePath: string): Promise<{ plan: Plan; filePath: string }> {
    // Read template content
    const content = await fs.readFile(templatePath, 'utf-8');
    const { frontmatter: templateFm, body } = parseFrontmatter<Record<string, unknown>>(content);

    // Generate next plan ID
    const nextId = await this.generateNextPlanId();
    const now = new Date().toISOString();

    // Build new plan frontmatter: merge template fields with overrides
    const newPlanFrontmatter: Record<string, unknown> = {
      ...templateFm,
      id: nextId,
      status: 'draft',
      created_at: now,
      updated_at: now,
      completed_at: ''
    };

    // Build Plan object for store
    const newPlan: Plan = {
      id: nextId,
      title: (newPlanFrontmatter.title as string) || 'Untitled Plan',
      status: 'draft',
      author: (newPlanFrontmatter.author as string) || 'unknown',
      created_at: now,
      updated_at: now,
      completed_at: '',
      previous_plan: (newPlanFrontmatter.previous_plan as string) || '',
      related_reports: (newPlanFrontmatter.related_reports as string[]) || []
    };

    // Generate file content
    const frontmatterYaml = this.generateFrontmatterYamlFromObject(newPlanFrontmatter);
    const fileContent = `---\n${frontmatterYaml}---\n${body}`;

    // Save to plans/current/ with wx flag (fail-if-exists)
    const plansDir = path.join(this.workflowRoot, 'plans', 'current');
    const filePath = path.join(plansDir, nextId + '.md');

    // Ensure directory exists
    await fs.mkdir(plansDir, { recursive: true });

    // Write file with wx flag (atomic fail-if-exists)
    await fs.writeFile(filePath, fileContent, { encoding: 'utf-8', flag: 'wx' });

    // Update store
    this.store.addPlan(newPlan);

    return { plan: newPlan, filePath };
  }

  /**
   * Generate plan file content from frontmatter and body
   */
  private generatePlanFileContent(plan: Plan, body: string): string {
    const frontmatterYaml = this.generateFrontmatterYaml(plan);
    return '---\n' + frontmatterYaml + '---\n' + body;
  }

  /**
   * Generate YAML frontmatter from a generic object (for template-based plans)
   */
  private generateFrontmatterYamlFromObject(frontmatter: Record<string, unknown>): string {
    const lines: string[] = [];

    for (const [key, value] of Object.entries(frontmatter)) {
      if (Array.isArray(value)) {
        if (value.length === 0) {
          lines.push(key + ': []');
        } else {
          lines.push(key + ':');
          for (const item of value) {
            lines.push('  - ' + item);
          }
        }
      } else if (typeof value === 'string') {
        lines.push(key + ': "' + value + '"');
      } else if (typeof value === 'object' && value !== null) {
        // Nested objects — use safeDump
        const nested = safeDump(value, { indent: 2 }).trimEnd();
        lines.push(key + ':');
        for (const line of nested.split('\n')) {
          lines.push('  ' + line);
        }
      } else if (value === undefined || value === null) {
        lines.push(key + ': ""');
      } else {
        lines.push(key + ': ' + value);
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Generate YAML frontmatter from plan object
   */
  private generateFrontmatterYaml(plan: Plan): string {
    const lines: string[] = [];

    lines.push('id: "' + plan.id + '"');
    lines.push('title: "' + plan.title + '"');
    lines.push('status: ' + plan.status);
    lines.push('author: ' + plan.author);
    lines.push('');
    lines.push('created_at: "' + plan.created_at + '"');
    lines.push('updated_at: "' + plan.updated_at + '"');
    lines.push('completed_at: "' + plan.completed_at + '"');
    lines.push('');
    lines.push('previous_plan: "' + plan.previous_plan + '"');

    // Handle related_reports array
    if (plan.related_reports && plan.related_reports.length > 0) {
      lines.push('related_reports:');
      for (const report of plan.related_reports) {
        lines.push('  - ' + report);
      }
    } else {
      lines.push('related_reports: []');
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Default template when file is not found
   */
  private getDefaultTemplate(): string {
    const lines: string[] = [];
    lines.push('---');
    lines.push('id: "PLAN-{NNN}"');
    lines.push('title: "Plan Title"');
    lines.push('status: draft');
    lines.push('author: unknown');
    lines.push('');
    lines.push('created_at: ""');
    lines.push('updated_at: ""');
    lines.push('completed_at: ""');
    lines.push('');
    lines.push('previous_plan: ""');
    lines.push('related_reports: []');
    lines.push('---');
    lines.push('');
    lines.push('# Plan: {Title}');
    lines.push('');
    lines.push('## Goal');
    lines.push('');
    lines.push('<!-- Describe the goal here -->');
    lines.push('');
    lines.push('## Context');
    lines.push('');
    lines.push('<!-- Why this is important -->');
    lines.push('');
    lines.push('## Scope');
    lines.push('');
    lines.push('### In Scope');
    lines.push('');
    lines.push('- Item 1');
    lines.push('');
    lines.push('### Out of Scope');
    lines.push('');
    lines.push('- Item 1');
    lines.push('');
    lines.push('## High-Level Tasks');
    lines.push('');
    lines.push('### 1. Task 1');
    lines.push('');
    lines.push('**Priority:** High');
    lines.push('**Dependencies:** None');
    lines.push('**Description:** What needs to be done');
    lines.push('');
    lines.push('## Technical Decisions');
    lines.push('');
    lines.push('<!-- Key architectural decisions -->');
    lines.push('');
    lines.push('## Risks and Dependencies');
    lines.push('');
    lines.push('| Risk | Probability | Impact | Mitigation |');
    lines.push('|------|-------------|--------|------------|');
    lines.push('| Risk 1 | High | High | How to prevent/solve |');
    lines.push('');
    lines.push('## External Dependencies');
    lines.push('');
    lines.push('<!-- Dependencies on external systems, teams, resources -->');
    lines.push('');
    lines.push('## Success Criteria');
    lines.push('');
    lines.push('<!-- How we know the plan is successful -->');
    lines.push('');
    lines.push('- [ ] Criteria 1');
    lines.push('');
    lines.push('## Metrics');
    lines.push('');
    lines.push('<!-- What we measure for success -->');
    lines.push('');
    lines.push('| Metric | Current | Target |');
    lines.push('|--------|---------|--------|');
    lines.push('| Metric 1 | X | Y |');
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## Change History');
    lines.push('');
    lines.push('| Date | Author | Change |');
    lines.push('|------|--------|--------|');
    lines.push('| YYYY-MM-DD | unknown | Plan created |');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Get the workflow root directory
   */
  getWorkflowRoot(): string {
    return this.workflowRoot;
  }

  // ==================== Plan-Ticket Relationships ====================

  /**
   * Get all tickets for a specific plan
   * Filters tickets by parent_plan == planId from Store
   *
   * @param planId - Plan ID to get tickets for
   * @returns Array of tickets belonging to the plan
   */
  getTicketsForPlan(planId: string): Ticket[] {
    const allTickets = this.store.getTickets();
    return allTickets.filter(ticket => ticket.parent_plan === planId);
  }

  /**
   * Get plan progress
   *
   * Counts tickets with status='done' / total * 100
   *
   * @param planId - Plan ID to get progress for
   * @returns PlanProgress with total, done, and percentage
   */
  getPlanProgress(planId: string): PlanProgress {
    const tickets = this.getTicketsForPlan(planId);

    const total = tickets.length;
    const done = tickets.filter(
      ticket => ticket.status === TicketStatus.Done
    ).length;

    const percentage = total === 0 ? 0 : Math.round((done / total) * 100);

    return { total, done, percentage };
  }

  /**
   * Approve a plan (change status from draft to approved)
   *
   * - Validates current status is 'draft'
   - Updates status to 'approved' and updated_at to now
   - Preserves unknown frontmatter fields (merge)
   - Atomic write: temp file + fs.rename
   *
   * @param id - Plan ID to approve
   * @returns Approved plan
   * @throws Error if plan not found or not in draft status
   */
  async approve(id: string): Promise<Plan> {
    const plan = this.getById(id);

    if (!plan) {
      throw new Error('Plan ' + id + ' not found');
    }

    if (plan.status !== 'draft') {
      throw new Error('Plan ' + id + ' is not in draft status. Current status: ' + plan.status);
    }

    const now = new Date().toISOString();

    const planFolder = plan.folder || 'current';

    // Read current file to get body and preserve unknown frontmatter fields
    const planPath = path.join(this.workflowRoot, 'plans', planFolder, id + '.md');
    let body = '';
    const unknownFields: Record<string, unknown> = {};

    try {
      const content = await fs.readFile(planPath, 'utf-8');
      const { frontmatter, body: parsedBody } = parseFrontmatter<Record<string, unknown>>(content);
      body = parsedBody;

      // Extract unknown fields (not in Plan interface)
      const knownFields = new Set([
        'id', 'title', 'status', 'author', 'created_at', 'updated_at',
        'completed_at', 'previous_plan', 'related_reports', 'folder'
      ]);

      for (const [key, value] of Object.entries(frontmatter)) {
        if (!knownFields.has(key)) {
          unknownFields[key] = value;
        }
      }
    } catch {
      // If file not found, use empty body
      body = '';
    }

    // Update plan in memory
    const approvedPlan: Plan = {
      ...plan,
      status: 'approved',
      updated_at: now
    };

    // Generate new content with updated frontmatter
    const newContent = this.generatePlanFileContentWithUnknownFields(approvedPlan, body, unknownFields);

    // Atomic write: temp file + rename
    const tempPath = planPath + '.tmp';
    await fs.writeFile(tempPath, newContent, 'utf-8');
    await fs.rename(tempPath, planPath);

    // Update store
    this.store.updatePlan(id, approvedPlan);

    return approvedPlan;
  }

  /**
   * Generate plan file content with additional unknown fields preserved
   */
  private generatePlanFileContentWithUnknownFields(
    plan: Plan,
    body: string,
    unknownFields: Record<string, unknown>
  ): string {
    const frontmatterYaml = this.generateFrontmatterYamlWithUnknownFields(plan, unknownFields);
    return '---\n' + frontmatterYaml + '---\n' + body;
  }

  /**
   * Generate YAML frontmatter with unknown fields preserved
   */
  private generateFrontmatterYamlWithUnknownFields(
    plan: Plan,
    unknownFields: Record<string, unknown>
  ): string {
    const lines: string[] = [];

    // Add unknown fields first (preserve order)
    for (const [key, value] of Object.entries(unknownFields)) {
      if (Array.isArray(value)) {
        if (value.length === 0) {
          lines.push(key + ': []');
        } else {
          lines.push(key + ':');
          for (const item of value) {
            lines.push('  - ' + item);
          }
        }
      } else if (typeof value === 'string') {
        lines.push(key + ': "' + value + '"');
      } else if (typeof value === 'object' && value !== null) {
        const nested = safeDump(value, { indent: 2 }).trimEnd();
        lines.push(key + ':');
        for (const line of nested.split('\n')) {
          lines.push('  ' + line);
        }
      } else if (value === undefined || value === null) {
        lines.push(key + ': ""');
      } else {
        lines.push(key + ': ' + value);
      }
    }

    // Add known plan fields
    lines.push('id: "' + plan.id + '"');
    lines.push('title: "' + plan.title + '"');
    lines.push('status: ' + plan.status);
    lines.push('author: ' + plan.author);
    lines.push('');
    lines.push('created_at: "' + plan.created_at + '"');
    lines.push('updated_at: "' + plan.updated_at + '"');
    lines.push('completed_at: "' + plan.completed_at + '"');
    lines.push('');
    lines.push('previous_plan: "' + plan.previous_plan + '"');

    if (plan.related_reports && plan.related_reports.length > 0) {
      lines.push('related_reports:');
      for (const report of plan.related_reports) {
        lines.push('  - ' + report);
      }
    } else {
      lines.push('related_reports: []');
    }

    return lines.join('\n') + '\n';
  }

  // ==================== Archive Operation ====================

  /**
   * Archive a plan
   *
   * - Moves file from plans/current/ to plans/archive/
   * - Updates frontmatter: status='archived', completed_at=now
   * - Uses fs.rename (atomic operation)
   *
   * @param id - Plan ID to archive
   */
  async archive(id: string): Promise<void> {
    const plan = this.getById(id);

    if (!plan) {
      throw new Error('Plan ' + id + ' not found');
    }

    const now = new Date().toISOString();

    // Update plan in memory
    const archivedPlan: Plan = {
      ...plan,
      status: 'archived',
      completed_at: now,
      updated_at: now,
      folder: 'archive'
    };

    // File paths
    const currentDir = path.join(this.workflowRoot, 'plans', 'current');
    const archiveDir = path.join(this.workflowRoot, 'plans', 'archive');
    const currentPath = path.join(currentDir, id + '.md');
    const archivePath = path.join(archiveDir, id + '.md');

    // Read current file to preserve body
    let body = '';
    try {
      const content = await fs.readFile(currentPath, 'utf-8');
      const { body: parsedBody } = parseFrontmatter<Plan>(content);
      body = parsedBody;
    } catch {
      // If file not found, use empty body
      body = '';
    }

    // Generate new content with updated frontmatter
    const newContent = this.generatePlanFileContent(archivedPlan, body);

    // Ensure archive directory exists
    await fs.mkdir(archiveDir, { recursive: true });

    // Write to archive location
    await fs.writeFile(archivePath, newContent, 'utf-8');

    // Remove from current location (atomic rename not possible across operations)
    try {
      await fs.unlink(currentPath);
    } catch (_error) {
      // Ignore if file doesn't exist
      console.error('Failed to remove current plan file ' + currentPath + ':', _error);
    }

    // Update store
    this.store.updatePlan(id, archivedPlan);
  }
}
