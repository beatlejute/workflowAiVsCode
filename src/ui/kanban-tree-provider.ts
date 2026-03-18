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
import { Ticket, TicketStatus, RecurringDefinition } from '../data/types';
import { getReviewBadges, extractPlanId } from './utils';
import { TreeItemCache } from '../utils/tree-item-cache';
import { getTicketIcon } from '../utils/ticket-utils';
import { buildTicketTooltip } from '../utils/tooltip-utils';

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
const sortedTicketsCache = new TreeItemCache<KanbanTicketTreeItem[]>();

/**
 * Cache for TreeItem objects (memoization)
 * Maps ticket ID to TreeItem to avoid recreation
 */
const treeItemCache = new TreeItemCache<KanbanTicketTreeItem>();

/**
 * Shared recurring definitions across all kanban providers
 */
let recurringDefinitions: RecurringDefinition[] = [];

/**
 * Set recurring definitions for all kanban providers
 */
export function setRecurringDefinitions(definitions: RecurringDefinition[]): void {
  recurringDefinitions = definitions;
  treeItemCache.clear();
}

/**
 * Tree item representing a ticket in the Kanban board
 */
export class KanbanTicketTreeItem extends vscode.TreeItem {
  constructor(
    public readonly ticket: Ticket,
    workflowRoot: string,
    private readonly recurringDefinitions: RecurringDefinition[] = []
  ) {
    const label = ticket.id;
    const reviewBadges = getReviewBadges(ticket.reviews);
    const description = reviewBadges ? `${reviewBadges} ${ticket.title}` : ticket.title;
    super(label, vscode.TreeItemCollapsibleState.None);

    this.description = description;
    this.tooltip = this.buildTooltip();
    this.iconPath = this.getIconPath();
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

  private getIconPath(): vscode.ThemeIcon | undefined {
    if (this.ticket.recurring_source) {
      return new vscode.ThemeIcon('sync');
    }
    return getTicketIcon(this.ticket.priority);
  }

  private buildTooltip(): vscode.MarkdownString {
    const baseTooltip = buildTicketTooltip(this.ticket);
    
    if (this.ticket.recurring_source && this.recurringDefinitions.length > 0) {
      const definition = this.recurringDefinitions.find(d => d.id === this.ticket.recurring_source);
      if (definition) {
        baseTooltip.appendMarkdown('\n\n---\n\n');
        baseTooltip.appendMarkdown(`**${t('Recurring')}:** ${definition.name}\n\n`);
        baseTooltip.appendMarkdown(`| ${t('Field')} | ${t('Value')} |\n`);
        baseTooltip.appendMarkdown(`|-------|-------|\n`);
        baseTooltip.appendMarkdown(`| **${t('Trigger Type')}** | ${definition.trigger.type} |\n`);
        
        if (definition.trigger.type === 'cron') {
          const cronTrigger = definition.trigger as { type: string; expression: string };
          baseTooltip.appendMarkdown(`| **${t('Cron Expression')}** | ${cronTrigger.expression} |\n`);
        }
        
        if (definition.state.next_trigger_at) {
          baseTooltip.appendMarkdown(`| **${t('Next Trigger')}** | ${definition.state.next_trigger_at} |\n`);
        }
        
        baseTooltip.appendMarkdown(`| **${t('Instance Count')}** | ${definition.state.instance_count} |\n`);
      }
    }
    
    return baseTooltip;
  }
}

/**
 * Create or get cached TreeItem for a ticket
 * Uses memoization to avoid recreating TreeItems for the same ticket
 */
function getOrCreateTreeItem(ticket: Ticket, workflowRoot: string): KanbanTicketTreeItem {
  const reviewKey = ticket.reviews?.map(r => r.status[0]).join('') || '';
  const cacheKey = `${ticket.id}:${ticket.updated_at}:${reviewKey}`;

  if (treeItemCache.has(cacheKey)) {
    return treeItemCache.get(cacheKey)!;
  }

  const item = new KanbanTicketTreeItem(ticket, workflowRoot, recurringDefinitions);
  treeItemCache.set(cacheKey, item);
  return item;
}

/**
 * Invalidate tree item cache for a specific ticket
 */
export function invalidateTicketCache(ticketId: string): void {
  treeItemCache.invalidateByPrefix(`${ticketId}:`);
}

/**
 * Get dimmed icon for pulse animation (pipeline active ticket)
 */
function getTicketIconDimmed(): vscode.ThemeIcon {
  return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('disabledForeground'));
}

/** Shared pulse state across all kanban providers */
let pulseTicketId: string | undefined;
let pulseOn = true;
let pulseTimer: ReturnType<typeof setInterval> | null = null;
const pulseSubscribers = new Set<KanbanTreeProvider>();

function startPulseTimer(): void {
  if (pulseTimer) { return; }
  pulseOn = true;
  pulseTimer = setInterval(() => {
    pulseOn = !pulseOn;
    for (const provider of pulseSubscribers) {
      provider.firePulse();
    }
  }, 1000);
}

function stopPulseTimer(): void {
  if (pulseTimer) {
    clearInterval(pulseTimer);
    pulseTimer = null;
  }
  pulseOn = true;
}

/**
 * Set the ticket ID whose priority dot should pulse (driven by pipeline).
 * Call with undefined to stop pulsing.
 */
export function setPulseTicketId(ticketId: string | undefined): void {
  if (ticketId === pulseTicketId) { return; }
  pulseTicketId = ticketId;
  if (ticketId) {
    startPulseTimer();
  } else {
    stopPulseTimer();
  }
  // Force refresh all providers so the icon updates immediately
  for (const provider of pulseSubscribers) {
    provider.firePulse();
  }
}

/**
 * TreeDataProvider for a single Kanban column
 * Parameterized by ticket status
 */
export class KanbanTreeProvider implements vscode.TreeDataProvider<KanbanTicketTreeItem>, vscode.Disposable {
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
        this.handleTicketChange(event);
      }
    });

    // Register for pulse notifications
    pulseSubscribers.add(this);
   }

  /**
   * Handle ticket change event with incremental refresh
   */
  private handleTicketChange(event: StoreChangeEvent): void {
    if (!event.id || !this.workflowRoot) {
      this.refresh();
      return;
    }

    const ticket = this.store.getTicketById(event.id);
    if (!ticket) {
      // Ticket deleted or not found
      this.refresh();
      return;
    }

    // Check if ticket status matches this provider's status
    if (ticket.status !== this.status) {
      // Ticket moved to another column, need full refresh
      this.refresh();
      return;
    }

    // Ticket updated within same column - incremental refresh
    invalidateTicketCache(event.id);
    sortedTicketsCache.clear(); // Invalidate sorted cache for this status
    const treeItem = getOrCreateTreeItem(ticket, this.workflowRoot);
    this._onDidChangeTreeData.fire(treeItem);
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
   * Clean up: unregister from pulse subscribers
   */
  dispose(): void {
    pulseSubscribers.delete(this);
  }

  /**
   * Fire a tree data change for pulse animation (called by shared timer)
   */
  /**
   * Fire a targeted tree data change for pulse animation.
   * Only updates the pulsing ticket element instead of the entire tree,
   * which prevents tooltips from flickering on hover.
   */
  firePulse(): void {
    if (!pulseTicketId || !this.workflowRoot) {
      return; // No pulse active or no root — skip
    }

    // Find the cached TreeItem for the pulsing ticket
    const cacheKey = getCacheKey({
      status: this.status,
      sortMode: this.sortMode,
      sortAscending: this.sortAscending,
      filterPlan: this.filterPlan
    });

    const cachedItems = sortedTicketsCache.get(cacheKey);
    if (cachedItems) {
      const pulsingItem = cachedItems.find(item => item.ticket.id === pulseTicketId);
      if (pulsingItem) {
        this._onDidChangeTreeData.fire(pulsingItem);
        return;
      }
    }

    // Pulsing ticket not in this column — no update needed
  }

  /**
   * Get tree item for element
   */
  getTreeItem(element: KanbanTicketTreeItem): vscode.TreeItem {
    if (element.ticket.recurring_source) {
      if (pulseTicketId && element.ticket.id === pulseTicketId) {
        element.iconPath = pulseOn
          ? new vscode.ThemeIcon('sync')
          : getTicketIconDimmed();
      } else {
        element.iconPath = new vscode.ThemeIcon('sync');
      }
    } else {
      if (pulseTicketId && element.ticket.id === pulseTicketId) {
        element.iconPath = pulseOn
          ? getTicketIcon(element.ticket.priority)
          : getTicketIconDimmed();
      } else {
        element.iconPath = getTicketIcon(element.ticket.priority);
      }
    }
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
      return Promise.resolve(sortedTicketsCache.get(cacheKey)!);
    }

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
