/**
 * KanbanTreeProvider - TreeDataProvider for Kanban board views in Panel
 *
 * Provides a parameterized TreeDataProvider for displaying tickets
 * grouped by status in a kanban-style board layout.
 *
 * Features:
 * - 6 TreeViews (backlog, ready, in-progress, blocked, review, done)
 * - Tooltip with MarkdownString preview
 * - Context menu and toolbar actions
 * - Reactive updates via Store.onDidChange
 *
 * ADR-005: Event-driven architecture for reactive UI updates
 */

import * as vscode from 'vscode';
import { t } from '../i18n';
import * as path from 'path';
import { WorkflowStore, StoreChangeEvent } from '../data/workflow-store';
import { Ticket, TicketStatus, ReviewEntry } from '../data/types';
import { getReviewBadges, extractPlanId } from './utils';

export type KanbanSortMode = 'priority' | 'id' | 'title' | 'date';

/**
 * Cache key for sorted tickets cache
 */
interface CacheKey {
  status: TicketStatus;
  sortMode: KanbanSortMode;
  sortAscending: boolean;
  filterPlan: string | null;
}

function getCacheKey(key: CacheKey): string {
  return `${key.status}|${key.sortMode}|${key.sortAscending}|${key.filterPlan || 'none'}`;
}

/**
 * Cache for sorted ticket lists
 * Maps cache key to precomputed ticket arrays
 */
const sortedTicketsCache = new Map<string, KanbanTicketTreeItem[]>();

/**
 * Cache for TreeItem objects (memoization)
 * Maps ticket ID to TreeItem to avoid recreation
 */
const treeItemCache = new Map<string, KanbanTicketTreeItem>();

/**
 * Performance metrics
 */
let perfMetrics = {
  cacheHits: 0,
  cacheMisses: 0,
  treeItemCacheHits: 0,
  treeItemCacheMisses: 0
};

/**
 * Tree item representing a ticket in the Kanban board
 */
export class KanbanTicketTreeItem extends vscode.TreeItem {
  constructor(
    public readonly ticket: Ticket,
    workflowRoot: string
  ) {
    const label = ticket.id;
    const reviewBadges = getReviewBadges(ticket.reviews);
    const description = reviewBadges ? `${reviewBadges} ${ticket.title}` : ticket.title;
    super(label, vscode.TreeItemCollapsibleState.None);

    this.description = description;
    this.tooltip = createTicketTooltip(ticket);
    this.iconPath = getTicketIcon(ticket.priority);
    this.contextValue = 'kanban-ticket';

    // Command to open ticket file on click
    const ticketPath = path.join(
      workflowRoot,
      'tickets',
      ticket.status,
      `${ticket.id}.md`
    );
    this.command = {
      command: 'vscode.open',
      title: t('Open Ticket'),
      arguments: [vscode.Uri.file(ticketPath)]
    };
  }
}

/**
 * Create or get cached TreeItem for a ticket
 * Uses memoization to avoid recreating TreeItems for the same ticket
 */
function getOrCreateTreeItem(ticket: Ticket, workflowRoot: string): KanbanTicketTreeItem {
  const cacheKey = `${ticket.id}:${ticket.updated_at}`;
  
  if (treeItemCache.has(cacheKey)) {
    perfMetrics.treeItemCacheHits++;
    return treeItemCache.get(cacheKey)!;
  }
  
  perfMetrics.treeItemCacheMisses++;
  const item = new KanbanTicketTreeItem(ticket, workflowRoot);
  treeItemCache.set(cacheKey, item);
  return item;
}

/**
 * Invalidate tree item cache for a specific ticket
 */
export function invalidateTicketCache(ticketId: string): void {
  for (const key of treeItemCache.keys()) {
    if (key.startsWith(`${ticketId}:`)) {
      treeItemCache.delete(key);
    }
  }
}

/**
 * Create tooltip for a ticket using MarkdownString
 * Shows: status, priority, type, dependencies, parent plan
 */
function createTicketTooltip(ticket: Ticket): vscode.MarkdownString {
  const priorityLabels: Record<number, string> = {
    1: t('Critical'),
    2: t('High'),
    3: t('Medium'),
    4: t('Low'),
    5: t('Trivial')
  };

  const priorityLabel = priorityLabels[ticket.priority] || `${t('Priority')} ${ticket.priority}`;
  const deps = ticket.dependencies.length > 0
    ? ticket.dependencies.join(', ')
    : t('None');

  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.supportHtml = true;
  markdown.appendMarkdown(`**${ticket.id}: ${ticket.title}**\n\n`);
  markdown.appendMarkdown(`| ${t('Field')} | ${t('Value')} |\n`);
  markdown.appendMarkdown(`|-------|-------|\n`);
  markdown.appendMarkdown(`| **${t('Status')}** | ${ticket.status} |\n`);
  markdown.appendMarkdown(`| **${t('Priority')}** | ${priorityLabel} |\n`);
  markdown.appendMarkdown(`| **${t('Type')}** | ${ticket.type} |\n`);
  markdown.appendMarkdown(`| **${t('Dependencies')}** | ${deps} |\n`);
  markdown.appendMarkdown(`| **${t('Parent Plan')}** | ${ticket.parent_plan} |\n`);

  if (ticket.context?.notes) {
    markdown.appendMarkdown(`\n---\n\n**${t('Notes')}:**\n${ticket.context.notes}\n`);
  }

  if (ticket.reviews?.length) {
    markdown.appendMarkdown(`\n**${t('Review')}:**\n\n`);
    markdown.appendMarkdown(`| ${t('Date')} | ${t('Status')} | ${t('Summary')} |\n|---|---|---|\n`);
    for (const r of ticket.reviews) {
      const icon = r.status === 'passed' ? '✅' : '❌';
      markdown.appendMarkdown(`| ${r.date} | ${icon} ${r.status} | ${r.summary} |\n`);
    }
  }

  return markdown;
}

/**
 * Get theme icon based on ticket priority
 */
function getTicketIcon(priority: number): vscode.ThemeIcon {
  // Priority 1 = Critical, 5 = Low
  if (priority <= 1) {
    return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('notificationsErrorIcon.foreground'));
  } else if (priority === 2) {
    return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('notificationsWarningIcon.foreground'));
  } else if (priority === 3) {
    return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('notificationsInfoIcon.foreground'));
  } else {
    return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('terminal.ansiGreen'));
  }
}

/**
 * TreeDataProvider for a single Kanban column
 * Parameterized by ticket status
 */
export class KanbanTreeProvider implements vscode.TreeDataProvider<KanbanTicketTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<KanbanTicketTreeItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<KanbanTicketTreeItem | undefined> = this._onDidChangeTreeData.event;

  private workflowRoot: string | null = null;
  private sortMode: KanbanSortMode = 'priority';
  private sortAscending: boolean = false;
  private filterPlan: string | null = null;

  constructor(
    private readonly store: WorkflowStore,
    private readonly status: TicketStatus
  ) {
    // Subscribe to store change events for reactive updates
    store.onDidChange((event: StoreChangeEvent) => {
      if (event.type === 'ticket') {
        this.refresh();
      }
    });
  }

  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root: string): void {
    this.workflowRoot = root;
    this.refresh();
  }

  /**
   * Set sort mode and refresh
   */
  setSortMode(mode: KanbanSortMode): void {
    this.sortMode = mode;
    this.refresh();
  }

  /**
   * Set plan filter for kanban
   * @param planId Plan ID to filter by, or null to clear filter
   */
  setPlanFilter(planId: string | null): void {
    this.filterPlan = planId;
    this.refresh();
  }

  /**
   * Get current plan filter
   */
  getPlanFilter(): string | null {
    return this.filterPlan;
  }

  /**
   * Set sort direction (ascending/descending)
   * @param ascending true for ascending, false for descending
   */
  setSortAscending(ascending: boolean): void {
    this.sortAscending = ascending;
    this.refresh();
  }

  /**
   * Get current sort direction
   */
  getSortAscending(): boolean {
    return this.sortAscending;
  }

  /**
   * Refresh tree data
   */
  refresh(): void {
    // Invalidate cache for this status when refreshing
    sortedTicketsCache.clear();
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Get tree item for element
   */
  getTreeItem(element: KanbanTicketTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for element
   */
  getChildren(element?: KanbanTicketTreeItem): Thenable<KanbanTicketTreeItem[]> {
    if (!this.workflowRoot) {
      return Promise.resolve([]);
    }

    if (element) {
      // No children for individual tickets
      return Promise.resolve([]);
    }

    // Root level: show all tickets for this status
    return this.getTicketsForStatus();
  }

  /**
   * Get tickets for the configured status with caching
   */
  private getTicketsForStatus(): Thenable<KanbanTicketTreeItem[]> {
    // Build cache key
    const cacheKey = getCacheKey({
      status: this.status,
      sortMode: this.sortMode,
      sortAscending: this.sortAscending,
      filterPlan: this.filterPlan
    });

    // Check cache first
    if (sortedTicketsCache.has(cacheKey)) {
      perfMetrics.cacheHits++;
      return Promise.resolve(sortedTicketsCache.get(cacheKey)!);
    }

    perfMetrics.cacheMisses++;

    let tickets = this.store.getTicketsByStatus(this.status);

    // Apply plan filter if set
    if (this.filterPlan) {
      tickets = tickets.filter(ticket => extractPlanId(ticket.parent_plan) === this.filterPlan);
    }

    const direction = this.sortAscending ? 1 : -1;

    switch (this.sortMode) {
      case 'id':
        tickets.sort((a, b) => direction * a.id.localeCompare(b.id));
        break;
      case 'title':
        tickets.sort((a, b) => direction * a.title.localeCompare(b.title));
        break;
      case 'date':
        tickets.sort((a, b) => direction * a.updated_at.localeCompare(b.updated_at));
        break;
      case 'priority':
      default:
        tickets.sort((a, b) => direction * (a.priority - b.priority));
        break;
    }

    // Use cached TreeItems
    const items = tickets.map(
      ticket => getOrCreateTreeItem(ticket, this.workflowRoot!)
    );

    // Cache the result
    sortedTicketsCache.set(cacheKey, items);

    return Promise.resolve(items);
  }

  /**
   * Get the ticket count for this status
   * Used for column header display
   */
  getCount(): number {
    return this.store.getTicketsByStatus(this.status).length;
  }

  /**
   * Get badge for this status
   * Used for TreeView.badge property
   */
  getBadge(): vscode.ViewBadge | undefined {
    const count = this.getCount();
    if (count === 0) {
      return undefined;
    }
    return {
      value: count,
      tooltip: t('{0} tickets {1}', count, this.status)
    };
  }
}

/**
 * Factory function to create all 6 Kanban tree providers
 */
export function createKanbanProviders(store: WorkflowStore): {
  backlog: KanbanTreeProvider;
  ready: KanbanTreeProvider;
  inProgress: KanbanTreeProvider;
  blocked: KanbanTreeProvider;
  review: KanbanTreeProvider;
  done: KanbanTreeProvider;
} {
  const done = new KanbanTreeProvider(store, TicketStatus.Done);
  done.setSortMode('date');

  return {
    backlog: new KanbanTreeProvider(store, TicketStatus.Backlog),
    ready: new KanbanTreeProvider(store, TicketStatus.Ready),
    inProgress: new KanbanTreeProvider(store, TicketStatus.InProgress),
    blocked: new KanbanTreeProvider(store, TicketStatus.Blocked),
    review: new KanbanTreeProvider(store, TicketStatus.Review),
    done
  };
}

/**
 * Get performance metrics for debugging
 */
export function getKanbanPerfMetrics(): typeof perfMetrics {
  return { ...perfMetrics };
}

/**
 * Reset performance metrics
 */
export function resetKanbanPerfMetrics(): void {
  perfMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    treeItemCacheHits: 0,
    treeItemCacheMisses: 0
  };
}
