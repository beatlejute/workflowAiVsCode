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
import * as path from 'path';
import { WorkflowStore, StoreChangeEvent } from '../data/workflow-store';
import { Ticket, TicketStatus } from '../data/types';

export type KanbanSortMode = 'priority' | 'id' | 'title';

/**
 * Tree item representing a ticket in the Kanban board
 */
export class KanbanTicketTreeItem extends vscode.TreeItem {
  constructor(
    public readonly ticket: Ticket,
    workflowRoot: string
  ) {
    const label = ticket.id;
    const description = ticket.title;
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
      title: vscode.l10n.t('Open Ticket'),
      arguments: [vscode.Uri.file(ticketPath)]
    };
  }
}

/**
 * Create tooltip for a ticket using MarkdownString
 * Shows: status, priority, type, dependencies, parent plan
 */
function createTicketTooltip(ticket: Ticket): vscode.MarkdownString {
  const priorityLabels: Record<number, string> = {
    1: vscode.l10n.t('Critical'),
    2: vscode.l10n.t('High'),
    3: vscode.l10n.t('Medium'),
    4: vscode.l10n.t('Low'),
    5: vscode.l10n.t('Trivial')
  };

  const priorityLabel = priorityLabels[ticket.priority] || `${vscode.l10n.t('Priority')} ${ticket.priority}`;
  const deps = ticket.dependencies.length > 0
    ? ticket.dependencies.join(', ')
    : vscode.l10n.t('None');

  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.supportHtml = true;
  markdown.appendMarkdown(`**${ticket.id}: ${ticket.title}**\n\n`);
  markdown.appendMarkdown(`| ${vscode.l10n.t('Field')} | ${vscode.l10n.t('Value')} |\n`);
  markdown.appendMarkdown(`|-------|-------|\n`);
  markdown.appendMarkdown(`| **${vscode.l10n.t('Status')}** | ${ticket.status} |\n`);
  markdown.appendMarkdown(`| **${vscode.l10n.t('Priority')}** | ${priorityLabel} |\n`);
  markdown.appendMarkdown(`| **${vscode.l10n.t('Type')}** | ${ticket.type} |\n`);
  markdown.appendMarkdown(`| **${vscode.l10n.t('Dependencies')}** | ${deps} |\n`);
  markdown.appendMarkdown(`| **${vscode.l10n.t('Parent Plan')}** | ${ticket.parent_plan} |\n`);

  if (ticket.context?.notes) {
    markdown.appendMarkdown(`\n---\n\n**${vscode.l10n.t('Notes')}:**\n${ticket.context.notes}\n`);
  }

  if (ticket.reviews?.length) {
    markdown.appendMarkdown(`\n**${vscode.l10n.t('Review')}:**\n\n`);
    markdown.appendMarkdown(`| ${vscode.l10n.t('Date')} | ${vscode.l10n.t('Status')} | ${vscode.l10n.t('Summary')} |\n|---|---|---|\n`);
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
   * Refresh tree data
   */
  refresh(): void {
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
   * Get tickets for the configured status
   */
  private getTicketsForStatus(): Thenable<KanbanTicketTreeItem[]> {
    const tickets = this.store.getTicketsByStatus(this.status);

    switch (this.sortMode) {
      case 'id':
        tickets.sort((a, b) => a.id.localeCompare(b.id));
        break;
      case 'title':
        tickets.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'priority':
      default:
        tickets.sort((a, b) => a.priority - b.priority);
        break;
    }

    const items = tickets.map(
      ticket => new KanbanTicketTreeItem(ticket, this.workflowRoot!)
    );

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
      tooltip: vscode.l10n.t('{0} tickets ready', count)
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
  return {
    backlog: new KanbanTreeProvider(store, TicketStatus.Backlog),
    ready: new KanbanTreeProvider(store, TicketStatus.Ready),
    inProgress: new KanbanTreeProvider(store, TicketStatus.InProgress),
    blocked: new KanbanTreeProvider(store, TicketStatus.Blocked),
    review: new KanbanTreeProvider(store, TicketStatus.Review),
    done: new KanbanTreeProvider(store, TicketStatus.Done)
  };
}
