/**
 * IStore - Interface for workflow data store
 *
 * Provides unified access to tickets, plans, reports, and configuration.
 * Supports both full refresh and incremental updates with event notifications.
 *
 * @see WorkflowStore - Implementation of this interface
 */

import { Ticket, Plan, Report, WorkflowConfig, PipelineConfig, TicketStatus, PlanTemplate } from '../data/types';
import { StoreChangeEvent } from '../data/workflow-store';

/**
 * Event listener function type for store change events
 */
export type StoreChangeListener = (event: StoreChangeEvent) => void;

/**
 * IStore - Central reactive data store interface
 *
 * Provides unified access to tickets, plans, reports, and configuration.
 * Supports event-driven architecture for reactive UI updates.
 */
export interface IStore {
  // ==================== Event Handling ====================

  /**
   * Register a listener for store change events
   * @param listener - Function to call when store changes
   * @returns Unsubscribe function
   */
  onDidChange(listener: StoreChangeListener): void;

  // ==================== Refresh Operations ====================

  /**
   * Refresh all data from disk
   * Scans all ticket folders, plans, reports, and configuration
   * Emits a single 'refresh' event when complete (batching)
   *
   * @param workflowRoot - Root directory of the workflow project
   */
  refresh(workflowRoot: string): Promise<void>;

  // ==================== Ticket Operations ====================

  /**
   * Add a new ticket to the store
   * Emits an 'add' event for the ticket
   */
  addTicket(ticket: Ticket): void;

  /**
   * Update an existing ticket
   * Emits an 'update' event for the ticket
   */
  updateTicket(id: string, ticket: Ticket): void;

  /**
   * Remove a ticket from the store
   * Emits a 'delete' event for the ticket
   */
  removeTicket(id: string): void;

  /**
   * Get all tickets
   */
  getTickets(): Ticket[];

  /**
   * Get a ticket by ID
   */
  getTicketById(id: string): Ticket | undefined;

  /**
   * Get tickets filtered by status
   */
  getTicketsByStatus(status: TicketStatus): Ticket[];

  /**
   * Get tickets filtered by priority
   */
  getTicketsByPriority(priority: number): Ticket[];

  /**
   * Get tickets that depend on a specific ticket
   */
  getTicketsWithDependency(dependencyId: string): Ticket[];

  // ==================== Plan Operations ====================

  /**
   * Add a new plan to the store
   * Emits an 'add' event for the plan
   */
  addPlan(plan: Plan): void;

  /**
   * Update an existing plan
   * Emits an 'update' event for the plan
   */
  updatePlan(id: string, plan: Plan): void;

  /**
   * Remove a plan from the store
   * Emits a 'delete' event for the plan
   */
  removePlan(id: string): void;

  /**
   * Get all plans
   */
  getPlans(): Plan[];

  /**
   * Get a plan by ID
   */
  getPlanById(id: string): Plan | undefined;

  /**
   * Get plans from current folder only
   */
  getCurrentPlans(): Plan[];

  /**
   * Get plans from archive folder only
   */
  getArchivedPlans(): Plan[];

  // ==================== Plan Template Operations ====================

  /**
   * Add a new plan template to the store
   * Emits an 'add' event for the template
   */
  addPlanTemplate(template: PlanTemplate): void;

  /**
   * Update an existing plan template
   * Emits an 'update' event for the template
   */
  updatePlanTemplate(id: string, template: PlanTemplate): void;

  /**
   * Remove a plan template from the store
   * Emits a 'delete' event for the template
   */
  removePlanTemplate(id: string): void;

  /**
   * Get all plan templates
   */
  getPlanTemplates(): PlanTemplate[];

  /**
   * Get a plan template by ID
   */
  getPlanTemplateById(id: string): PlanTemplate | undefined;

  // ==================== Report Operations ====================

  /**
   * Add a new report to the store
   * Emits an 'add' event for the report
   */
  addReport(report: Report): void;

  /**
   * Update an existing report
   * Emits an 'update' event for the report
   */
  updateReport(id: string, report: Report): void;

  /**
   * Remove a report from the store
   * Emits a 'delete' event for the report
   */
  removeReport(id: string): void;

  /**
   * Get all reports
   */
  getReports(): Report[];

  /**
   * Get a report by ID
   */
  getReportById(id: string): Report | undefined;

  // ==================== Configuration Operations ====================

  /**
   * Update workflow configuration
   * Emits a 'config' event
   */
  setConfig(config: WorkflowConfig | undefined): void;

  /**
   * Update pipeline configuration
   * Emits a 'config' event
   */
  setPipeline(pipeline: PipelineConfig | undefined): void;

  /**
   * Get workflow configuration
   */
  getConfig(): WorkflowConfig | undefined;

  /**
   * Get pipeline configuration
   */
  getPipeline(): PipelineConfig | undefined;

  // ==================== General Operations ====================

  /**
   * Get the workflow root directory
   */
  getWorkflowRoot(): string | null;

  /**
   * Clear all data from the store
   */
  clear(): void;

  /**
   * Get store statistics
   */
  getStats(): {
    ticketCount: number;
    planCount: number;
    reportCount: number;
    hasConfig: boolean;
    hasPipeline: boolean;
  };
}
