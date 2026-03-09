/**
 * TicketService - CRUD operations for workflow tickets
 *
 * Provides full CRUD for tickets: read from Store, create from templates,
 * move via wf CLI, and update frontmatter.
 *
 * ADR-003: Mutations via wf CLI (child_process.spawn)
 * ADR-005: Event-driven architecture for reactive UI updates
 */

import * as vscode from 'vscode';
import { t } from '../i18n';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { WorkflowStore } from '../data/workflow-store';
import { Ticket, TicketStatus, FrontmatterResult } from '../data/types';
import { parse as parseFrontmatter, serialize, updateFrontmatter } from '../data/frontmatter-parser';

/**
 * Spawn function type for dependency injection (testing)
 */
export type SpawnFunction = (
  command: string,
  args: readonly string[],
  options?: any
) => ChildProcess;

/**
 * Valid state machine transitions for tickets
 * Aligned with CLI move-ticket.js transitions
 */
const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.Backlog]: [TicketStatus.Ready],
  [TicketStatus.Ready]: [TicketStatus.InProgress, TicketStatus.Review, TicketStatus.Backlog],
  [TicketStatus.InProgress]: [TicketStatus.Review, TicketStatus.Blocked, TicketStatus.Done, TicketStatus.Backlog],
  [TicketStatus.Review]: [TicketStatus.Done, TicketStatus.InProgress, TicketStatus.Ready, TicketStatus.Blocked, TicketStatus.Backlog],
  [TicketStatus.Blocked]: [TicketStatus.Ready, TicketStatus.Backlog],
  [TicketStatus.Done]: [TicketStatus.Backlog]
};

/**
 * TicketService - Service layer for ticket management
 *
 * Provides CRUD operations, state machine transitions, and wf CLI integration.
 */
export class TicketService {
  private readonly store: WorkflowStore;
  private readonly workflowRoot: string;
  private readonly spawnFn: SpawnFunction;

  /**
   * Create TicketService
   * @param store - WorkflowStore for data access
   * @param workflowRoot - Root directory of the workflow project
   * @param spawnFn - Optional spawn function for testing (defaults to child_process.spawn)
   */
  constructor(store: WorkflowStore, workflowRoot: string, spawnFn?: SpawnFunction) {
    this.store = store;
    this.workflowRoot = workflowRoot;
    this.spawnFn = spawnFn || spawn;
  }

  // ==================== Read Operations ====================

  /**
   * Get all tickets from the store
   */
  getAll(): Ticket[] {
    return this.store.getTickets();
  }

  /**
   * Get tickets filtered by status
   */
  getByStatus(status: TicketStatus): Ticket[] {
    return this.store.getTicketsByStatus(status);
  }

  /**
   * Get ticket by ID
   */
  getById(id: string): Ticket | undefined {
    return this.store.getTicketById(id);
  }

  /**
   * Get tickets filtered by parent plan
   */
  getByPlan(planId: string): Ticket[] {
    return this.getAll().filter(t => t.parent_plan === planId);
  }

  /**
   * Get tickets filtered by type
   */
  getByType(type: string): Ticket[] {
    return this.getAll().filter(t => t.type === type);
  }

  // ==================== State Machine ====================

  /**
   * Get valid transitions for a given status
   */
  getValidTransitions(currentStatus: TicketStatus): TicketStatus[] {
    return VALID_TRANSITIONS[currentStatus] || [];
  }

  /**
   * Validate if a transition is allowed
   */
  isValidTransition(from: TicketStatus, to: TicketStatus): boolean {
    const validTransitions = this.getValidTransitions(from);
    return validTransitions.includes(to);
  }

  // ==================== Create Operation ====================

  /**
   * Create a new ticket
   *
   * @param type - Ticket type (e.g., 'IMPL', 'FIX', 'ARCH')
   * @param title - Ticket title
   * @param fields - Optional fields to override
   * @returns Created ticket
   */
  async create(type: string, title: string, fields?: Partial<Ticket>): Promise<Ticket> {
    // Generate ID: {TYPE}-{NNN}
    const id = await this.generateTicketId(type);

    // Read template
    const templatePath = path.join(this.workflowRoot, 'templates', 'ticket-template.md');
    let templateContent: string;
    try {
      templateContent = await fs.readFile(templatePath, 'utf-8');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(t('Failed to read ticket template: {0}', errorMessage));
    }

    // Parse template
    const { frontmatter: templateFrontmatter, body } = parseFrontmatter<Record<string, unknown>>(templateContent);

    // Build frontmatter
    const now = new Date().toISOString();
    const frontmatter: Record<string, unknown> = {
      id,
      title,
      status: 'backlog',
      priority: 3,
      type: type.toLowerCase(),
      required_capabilities: [],
      created_at: now,
      updated_at: now,
      completed_at: '',
      parent_plan: '',
      parent_task: '',
      dependencies: [],
      conditions: [],
      context: {
        files: [],
        references: [],
        notes: ''
      },
      complexity: 'medium',
      tags: [],
      // Override with provided fields (these take precedence)
      ...fields
    };

    // Serialize to markdown
    const content = serialize(frontmatter, body);

    // Write to backlog folder
    const backlogDir = path.join(this.workflowRoot, 'tickets', 'backlog');
    const filePath = path.join(backlogDir, `${id}.md`);

    // Ensure backlog directory exists
    await fs.mkdir(backlogDir, { recursive: true });

    // Write file with own-write flag to prevent file watcher trigger
    await this.withOwnWrite(async () => {
      await fs.writeFile(filePath, content, 'utf-8');
    });

    // Create ticket object and add to store
    const ticket: Ticket = {
      id,
      title,
      status: TicketStatus.Backlog,
      priority: frontmatter.priority as number || 3,
      type: frontmatter.type as string || type.toLowerCase(),
      dependencies: frontmatter.dependencies as string[] || [],
      conditions: frontmatter.conditions as any[] || [],
      context: frontmatter.context as any || {},
      tags: frontmatter.tags as string[] || [],
      complexity: frontmatter.complexity as string || 'medium',
      parent_plan: frontmatter.parent_plan as string || '',
      parent_task: frontmatter.parent_task as string || '',
      created_at: now,
      updated_at: now,
      completed_at: ''
    };

    this.store.addTicket(ticket);

    return ticket;
  }

  /**
   * Generate next sequential ticket ID for a given type
   */
  private async generateTicketId(type: string): Promise<string> {
    const allTickets = this.getAll();
    const typePrefix = type.toUpperCase();

    // Find max number for this type
    let maxNum = 0;
    for (const ticket of allTickets) {
      const match = ticket.id.match(/^([A-Z]+)-(\d+)$/);
      if (match && match[1] === typePrefix) {
        const num = parseInt(match[2], 10);
        if (num > maxNum) {
          maxNum = num;
        }
      }
    }

    // Generate next ID
    const nextNum = maxNum + 1;
    return `${typePrefix}-${String(nextNum).padStart(3, '0')}`;
  }

  // ==================== Move Operation ====================

  /**
   * Move a ticket to a new status
   *
   * @param id - Ticket ID to move
   * @param targetStatus - Target status
   * @throws Error if transition is invalid or file operation fails
   */
  async move(id: string, targetStatus: TicketStatus): Promise<void> {
    // Get current ticket
    const ticket = this.getById(id);
    if (!ticket) {
      throw new Error(t('Ticket {0} not found', id));
    }

    // Validate transition
    if (!this.isValidTransition(ticket.status, targetStatus)) {
      throw new Error(
        t('Invalid transition from {0} to {1}. Valid transitions: {2}', ticket.status, targetStatus, this.getValidTransitions(ticket.status).join(', '))
      );
    }

    // Move ticket via direct file system operations
    await this.moveTicketDirect(id, ticket.status, targetStatus);

    // Update ticket in store (file watcher will also update, but this ensures immediate consistency)
    const updatedTicket: Ticket = {
      ...ticket,
      status: targetStatus,
      updated_at: new Date().toISOString(),
      completed_at: targetStatus === TicketStatus.Done ? new Date().toISOString() : ''
    };
    this.store.updateTicket(id, updatedTicket);
  }

  /**
   * Move a ticket directly via file system operations
   *
   * Reads the ticket file, updates frontmatter (status, updated_at),
   * and moves it to the target status directory.
   *
   * @param id - Ticket ID
   * @param currentStatus - Current ticket status
   * @param targetStatus - Target ticket status
   */
  private async moveTicketDirect(id: string, currentStatus: TicketStatus, targetStatus: TicketStatus): Promise<void> {
    // Build file paths
    const sourcePath = path.join(this.workflowRoot, 'tickets', currentStatus, `${id}.md`);
    const targetDir = path.join(this.workflowRoot, 'tickets', targetStatus);
    const targetPath = path.join(targetDir, `${id}.md`);

    // Read ticket file
    let content: string;
    try {
      content = await fs.readFile(sourcePath, 'utf-8');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(t('Failed to read ticket file: {0}', errorMessage));
    }

    // Parse frontmatter
    const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(content);

    // Update frontmatter fields
    const updatedFrontmatter: Record<string, unknown> = {
      ...frontmatter,
      status: targetStatus,
      updated_at: new Date().toISOString()
    };

    // Set completed_at if moving to Done
    if (targetStatus === TicketStatus.Done) {
      updatedFrontmatter.completed_at = new Date().toISOString();
    }

    // Serialize back to markdown
    const updatedContent = serialize(updatedFrontmatter, body);

    // Ensure target directory exists
    await fs.mkdir(targetDir, { recursive: true });

    // Write to target location with own-write flag
    await this.withOwnWrite(async () => {
      await fs.writeFile(targetPath, updatedContent, 'utf-8');
    });

    // Remove source file
    await this.withOwnWrite(async () => {
      await fs.unlink(sourcePath);
    });
  }

  // Flag to prevent file watcher from triggering on our own writes
  private isOwnWrite = false;

  /**
   * Execute a write operation with isOwnWrite flag set
   */
  private async withOwnWrite<T>(operation: () => Promise<T>): Promise<T> {
    this.isOwnWrite = true;
    try {
      return await operation();
    } finally {
      // Small delay to ensure file system events are processed
      setTimeout(() => {
        this.isOwnWrite = false;
      }, 200);
    }
  }

  /**
   * Get the workflow root directory
   */
  getWorkflowRoot(): string {
    return this.workflowRoot;
  }

  // ==================== Update Operation ====================

  /**
   * Update ticket fields
   *
   * @param id - Ticket ID to update
   * @param fields - Fields to update
   */
  async update(id: string, fields: Partial<Ticket>): Promise<void> {
    // Get current ticket
    const ticket = this.getById(id);
    if (!ticket) {
      throw new Error(t('Ticket {0} not found', id));
    }

    // Read file content
    const filePath = path.join(
      this.workflowRoot,
      'tickets',
      ticket.status,
      `${id}.md`
    );

    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(t('Failed to read ticket file: {0}', errorMessage));
    }

    // Parse frontmatter
    const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(content);

    // Merge fields
    const updatedFields: Record<string, unknown> = {
      ...frontmatter,
      ...fields,
      updated_at: new Date().toISOString()
    };

    // Serialize back to markdown
    const updatedContent = serialize(updatedFields, body);

    // Write file with own-write flag
    await this.withOwnWrite(async () => {
      await fs.writeFile(filePath, updatedContent, 'utf-8');
    });

    // Update in store
    const updatedTicket: Ticket = {
      ...ticket,
      ...fields,
      updated_at: updatedFields.updated_at as string
    };
    this.store.updateTicket(id, updatedTicket);
  }
}
