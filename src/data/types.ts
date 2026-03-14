/**
 * Workflow AI - Data Layer Types
 * TypeScript interfaces for Ticket, Plan, Report and related entities
 */

/**
 * Ticket status enum representing the workflow state machine
 */
export enum TicketStatus {
  Backlog = 'backlog',
  Ready = 'ready',
  InProgress = 'in-progress',
  Blocked = 'blocked',
  Review = 'review',
  Done = 'done'
}

/**
 * Ticket priority levels (1 = Critical, 5 = Low)
 */
export enum TicketPriority {
  Critical = 1,
  High = 2,
  Medium = 3,
  Low = 4,
  Trivial = 5
}

/**
 * Condition type for ticket dependencies and conditions
 */
export interface Condition {
  type: 'tasks_completed' | 'file_exists' | string;
  value: string | string[];
}

/**
 * Context information for a ticket
 */
export interface TicketContext {
  files?: string[];
  references?: string[];
  notes?: string;
}

/**
 * Review entry from the review table in ticket body
 */
export interface ReviewEntry {
  date: string;
  status: string;
  icon: string;
  summary: string;
}

/**
 * Ticket interface representing a workflow task
 */
export interface Ticket {
  id: string;
  title: string;
  status: TicketStatus;
  priority: number;
  type: string;
  dependencies: string[];
  conditions: Condition[];
  context: TicketContext;
  tags: string[];
  complexity: string;
  parent_plan: string;
  parent_task: string;
  created_at: string;
  updated_at: string;
  completed_at: string;
  reviews?: ReviewEntry[];
}

/**
 * Plan interface representing a workflow plan
 */
export interface Plan {
  id: string;
  title: string;
  status: string;
  author: string;
  created_at: string;
  updated_at: string;
  completed_at: string;
  previous_plan: string;
  related_reports: string[];
  /** Which folder the plan was loaded from: 'current' or 'archive' */
  folder?: 'current' | 'archive';
}

/**
 * Report interface representing a workflow report
 */
export interface Report {
  id: string;
  title: string;
  type: string;
  created_at: string;
  summary: string;
}

/**
 * Workflow configuration interface
 */
export interface WorkflowConfig {
  version: string;
  project: {
    name: string;
    description: string;
  };
  task_types: Record<string, { description: string; prefix: string }>;
  priorities: Record<number, string>;
  statuses: Record<string, { description: string; color: string }>;
  condition_types: Record<string, { description: string }>;
  paths: {
    tickets: string;
    plans: string;
    reports: string;
    archive: string;
  };
  reporting: {
    enabled: boolean;
    auto_generate: boolean;
  };
}

/**
 * Pipeline configuration interface
 */
export interface PipelineConfig {
  pipeline: {
    name: string;
    version: string;
    agents: Record<string, {
      command: string;
      args: string[];
      workdir: string;
      description?: string;
    }>;
    stages: Record<string, {
      description: string;
      agent?: string;
      fallback_agent?: string;
      skill?: string;
      type?: string;
      counter?: string;
      max?: number;
      timeout?: number;
      goto?: Record<string, {
        stage: string;
        params?: Record<string, string>;
      }>;
    }>;
    entry: string;
    entry_point?: string;
    context?: Record<string, string>;
    execution?: {
      max_steps: number;
      delay_between_stages: number;
      timeout_per_stage: number;
      log_file: string;
    };
    protected_files?: string[];
  };
}

/**
 * Frontmatter wrapper for parse result
 */
export interface FrontmatterResult<T> {
  frontmatter: T;
  body: string;
}

/**
 * Validation error for configuration validation
 */
export interface ValidationError {
  field: string;
  message: string;
}
