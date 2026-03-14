/**
 * ReportService - Service layer for report management and statistics
 *
 * Provides report handling with support for:
 * - CRUD operations (Create, Read, Update, Delete)
 * - Summary parsing from frontmatter
 * - Workflow statistics aggregation
 *
 * ADR-002: Files are source of truth, WorkflowStore provides in-memory cache
 */

import { WorkflowStore } from '../data/workflow-store';
import { Report, TicketStatus } from '../data/types';
import { safeLoad } from '../utils/yaml-utils';

/**
 * Report summary data parsed from frontmatter
 */
export interface ReportSummary {
  completed: number;
  failed: number;
  byType: Record<string, number>;
  byPriority: Record<number, number>;
}

/**
 * Workflow statistics aggregated from current ticket state
 */
export interface WorkflowStats {
  byStatus: Record<TicketStatus, number>;
  byType: Record<string, number>;
  byPriority: Record<number, number>;
  avgCompletionDays: number;
  blockedCount: number;
}

/**
 * ReportService - Service layer for report management and statistics
 */
export class ReportService {
  private readonly store: WorkflowStore;
  private readonly workflowRoot: string;

  constructor(store: WorkflowStore, workflowRoot: string) {
    this.store = store;
    this.workflowRoot = workflowRoot;
  }

  // ==================== Read Operations ====================

  /**
   * Get all reports from the store
   */
  getAll(): Report[] {
    return this.store.getReports();
  }

  /**
   * Get a report by ID
   * @param id - Report ID to retrieve
   * @returns Report or undefined if not found
   */
  getById(id: string): Report | undefined {
    return this.store.getReportById(id);
  }

  /**
   * Get the latest report by created_at date
   * @returns Report with the most recent created_at or undefined
   */
  getLatest(): Report | undefined {
    const reports = this.getAll();

    if (reports.length === 0) {
      return undefined;
    }

    // Sort by created_at descending and return first
    return reports.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA;
    })[0];
  }

  // ==================== Summary Parsing ====================

  /**
   * Parse summary data from a report's frontmatter
   * Extracts completed, failed counts and breakdowns by type and priority
   *
   * @param report - Report to parse summary from
   * @returns ReportSummary with aggregated data
   */
  parseSummary(report: Report): ReportSummary {
    const summary: ReportSummary = {
      completed: 0,
      failed: 0,
      byType: {},
      byPriority: {}
    };

    if (!report.summary) {
      return summary;
    }

    try {
      // Parse the summary field as YAML using safeLoad
      const parsedSummary = safeLoad(report.summary) as Record<string, unknown>;

      if (!parsedSummary) {
        return summary;
      }

      // Extract completed count
      if (typeof parsedSummary.completed === 'number') {
        summary.completed = parsedSummary.completed;
      }

      // Extract failed count
      if (typeof parsedSummary.failed === 'number') {
        summary.failed = parsedSummary.failed;
      }

      // Extract byType breakdown
      if (parsedSummary.byType && typeof parsedSummary.byType === 'object') {
        summary.byType = parsedSummary.byType as Record<string, number>;
      }

      // Extract byPriority breakdown
      if (parsedSummary.byPriority && typeof parsedSummary.byPriority === 'object') {
        // Convert string keys to number keys for byPriority
        const byPriorityObj = parsedSummary.byPriority as Record<string, number>;
        for (const [key, value] of Object.entries(byPriorityObj)) {
          const priority = parseInt(key, 10);
          if (!isNaN(priority)) {
            summary.byPriority[priority] = value;
          }
        }
      }
    } catch (error) {
      // If parsing fails, return empty summary
      console.error('Failed to parse report summary:', error);
    }

    return summary;
  }

  // ==================== Statistics Aggregation ====================

  /**
   * Get workflow statistics aggregated from current ticket state
   * Counts tickets by status, type, priority
   * Calculates average completion time for done tickets
   *
   * @returns WorkflowStats with aggregated metrics
   */
  getStatistics(): WorkflowStats {
    const tickets = this.store.getTickets();

    const byStatus: Record<TicketStatus, number> = {
      [TicketStatus.Backlog]: 0,
      [TicketStatus.Ready]: 0,
      [TicketStatus.InProgress]: 0,
      [TicketStatus.Blocked]: 0,
      [TicketStatus.Review]: 0,
      [TicketStatus.Done]: 0
    };

    const byType: Record<string, number> = {};
    const byPriority: Record<number, number> = {};

    let totalCompletionDays = 0;
    let completedTicketsCount = 0;
    let blockedCount = 0;

    for (const ticket of tickets) {
      // Count by status
      byStatus[ticket.status] = (byStatus[ticket.status] || 0) + 1;

      // Count by type
      byType[ticket.type] = (byType[ticket.type] || 0) + 1;

      // Count by priority
      byPriority[ticket.priority] = (byPriority[ticket.priority] || 0) + 1;

      // Count blocked tickets
      if (ticket.status === TicketStatus.Blocked) {
        blockedCount++;
      }

      // Calculate completion days for done tickets with completed_at
      if (ticket.status === TicketStatus.Done && ticket.completed_at) {
        const createdDate = new Date(ticket.created_at);
        const completedDate = new Date(ticket.completed_at);

        if (!isNaN(createdDate.getTime()) && !isNaN(completedDate.getTime())) {
          const diffMs = completedDate.getTime() - createdDate.getTime();
          const diffDays = diffMs / (1000 * 60 * 60 * 24);
          totalCompletionDays += diffDays;
          completedTicketsCount++;
        }
      }
    }

    // Calculate average completion days
    const avgCompletionDays = completedTicketsCount > 0
      ? totalCompletionDays / completedTicketsCount
      : 0;

    return {
      byStatus,
      byType,
      byPriority,
      avgCompletionDays,
      blockedCount
    };
  }
}
