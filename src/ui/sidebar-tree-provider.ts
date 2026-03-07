/**
 * SidebarTreeProvider - TreeDataProvider for Workflow sidebar views
 *
 * Provides TreeDataProvider implementations for:
 * - Tickets (grouped by status with counts)
 * - Plans (current/archive)
 * - Reports (sorted by date)
 * - Logs (log files sorted by modification date)
 *
 * ADR-005: Event-driven architecture for reactive UI updates
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowStore, StoreChangeEvent } from '../data/workflow-store';
import { Ticket, TicketStatus, Plan, Report } from '../data/types';

/**
 * Tree item types for sidebar navigation
 */
export type TreeItemType = 'ticket' | 'plan' | 'report' | 'status-group' | 'plan-group' | 'skill' | 'log';

/**
 * Base tree item for all sidebar items
 */
export class SidebarTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: TreeItemType,
    public readonly id: string
  ) {
    super(label, collapsibleState);
    this.id = id;
  }
}

/**
 * Tree item representing a ticket
 */
export class TicketTreeItem extends SidebarTreeItem {
  constructor(
    public readonly ticket: Ticket,
    workflowRoot: string
  ) {
    const label = ticket.id;
    const description = ticket.title;
    super(label, vscode.TreeItemCollapsibleState.None, 'ticket', ticket.id);

    this.description = description;
    this.tooltip = buildTicketTooltip(ticket);
    this.iconPath = getTicketIcon(ticket.priority);
    this.contextValue = 'ticket';

    // Inline actions for quick access
    this.command = {
      command: 'vscode.open',
      title: vscode.l10n.t('Open Ticket'),
      arguments: [vscode.Uri.file(getTicketPath(ticket, workflowRoot))]
    };
  }
}

/**
 * Tree item representing a status group (for tickets)
 */
export class StatusGroupTreeItem extends SidebarTreeItem {
  constructor(
    public readonly status: TicketStatus,
    public readonly count: number
  ) {
    const label = `${status} (${count})`;
    super(label, vscode.TreeItemCollapsibleState.Expanded, 'status-group', status);
    
    this.contextValue = 'status-group';
  }
}

/**
 * Tree item representing a plan
 */
export class PlanTreeItem extends SidebarTreeItem {
  constructor(
    public readonly plan: Plan,
    workflowRoot: string,
    isCurrent: boolean
  ) {
    const label = plan.id;
    const description = plan.title;
    const groupId = isCurrent ? 'current' : 'archive';
    super(label, vscode.TreeItemCollapsibleState.None, 'plan', plan.id);

    this.description = description;
    this.tooltip = `${plan.id}: ${plan.title}\n${vscode.l10n.t('Status')}: ${plan.status}`;
    this.iconPath = new vscode.ThemeIcon('notebook');

    // Command to open plan file on click
    const planPath = path.join(
      workflowRoot,
      'plans',
      groupId,
      `${plan.id}.md`
    );
    this.command = {
      command: 'vscode.open',
      title: vscode.l10n.t('Open Plan'),
      arguments: [vscode.Uri.file(planPath)]
    };
  }
}

/**
 * Tree item representing a plan group (current/archive)
 */
export class PlanGroupTreeItem extends SidebarTreeItem {
  constructor(
    public readonly groupType: 'current' | 'archive',
    public readonly count: number
  ) {
    const label = groupType === 'current' ? vscode.l10n.t('Current') : vscode.l10n.t('Archive');
    super(`${label} (${count})`, vscode.TreeItemCollapsibleState.Collapsed, 'plan-group', groupType);

    this.contextValue = 'plan-group';
  }
}

/**
 * Tree item representing a report
 */
export class ReportTreeItem extends SidebarTreeItem {
  constructor(
    public readonly report: Report,
    workflowRoot: string
  ) {
    const label = report.id;
    const description = report.title;
    super(label, vscode.TreeItemCollapsibleState.None, 'report', report.id);

    this.description = description;
    this.tooltip = `${report.id}: ${report.title}\n${vscode.l10n.t('Type')}: ${report.type}\n${vscode.l10n.t('Created')}: ${report.created_at}`;
    this.iconPath = new vscode.ThemeIcon('document');

    // Command to open report file on click
    const reportPath = path.join(
      workflowRoot,
      'reports',
      `${report.id}.md`
    );
    this.command = {
      command: 'vscode.open',
      title: vscode.l10n.t('Open Report'),
      arguments: [vscode.Uri.file(reportPath)]
    };
  }
}

/**
 * Build a rich tooltip for a ticket tree item
 */
function buildTicketTooltip(ticket: Ticket): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = true;

  md.appendMarkdown(`**${ticket.id}: ${ticket.title}**\n\n`);
  md.appendMarkdown(`| ${vscode.l10n.t('Field')} | ${vscode.l10n.t('Value')} |\n|---|---|\n`);
  md.appendMarkdown(`| **${vscode.l10n.t('Status')}** | ${ticket.status} |\n`);
  md.appendMarkdown(`| **${vscode.l10n.t('Priority')}** | ${ticket.priority} |\n`);
  md.appendMarkdown(`| **${vscode.l10n.t('Type')}** | ${ticket.type} |\n`);

  if (ticket.dependencies?.length) {
    md.appendMarkdown(`| **${vscode.l10n.t('Deps')}** | ${ticket.dependencies.join(', ')} |\n`);
  }
  if (ticket.parent_plan) {
    md.appendMarkdown(`| **${vscode.l10n.t('Plan')}** | ${ticket.parent_plan} |\n`);
  }
  if (ticket.context?.notes) {
    md.appendMarkdown(`\n**${vscode.l10n.t('Notes')}:** ${ticket.context.notes}\n`);
  }

  if (ticket.reviews?.length) {
    md.appendMarkdown(`\n**${vscode.l10n.t('Review')}:**\n\n`);
    md.appendMarkdown(`| ${vscode.l10n.t('Date')} | ${vscode.l10n.t('Status')} | ${vscode.l10n.t('Summary')} |\n|---|---|---|\n`);
    for (const r of ticket.reviews) {
      const icon = r.status === 'passed' ? '✅' : '❌';
      md.appendMarkdown(`| ${r.date} | ${icon} ${r.status} | ${r.summary} |\n`);
    }
  }

  return md;
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
 * Get ticket file path based on status
 */
function getTicketPath(ticket: Ticket, workflowRoot: string): string {
  return path.join(
    workflowRoot,
    'tickets',
    ticket.status,
    `${ticket.id}.md`
  );
}

/**
 * TreeDataProvider for tickets view
 * Groups tickets by status with counts in headers
 */
export class TicketsTreeProvider implements vscode.TreeDataProvider<SidebarTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<SidebarTreeItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<SidebarTreeItem | undefined> = this._onDidChangeTreeData.event;

  private workflowRoot: string | null = null;
  private filterPlan: string | null = null;

  constructor(private readonly store: WorkflowStore) {
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
   * Set plan filter for tickets
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
   * Refresh tree data
   */
  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Get tree item for element
   */
  getTreeItem(element: SidebarTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for element
   */
  getChildren(element?: SidebarTreeItem): Thenable<SidebarTreeItem[]> {
    if (!this.workflowRoot) {
      return Promise.resolve([]);
    }

    if (!element) {
      // Root level: show status groups
      return this.getStatusGroups();
    }

    if (element.itemType === 'status-group') {
      // Status group level: show tickets in that status
      const statusGroup = element as StatusGroupTreeItem;
      return this.getTicketsForStatus(statusGroup.status);
    }

    return Promise.resolve([]);
  }

  /**
   * Get status groups with ticket counts
   */
  private getStatusGroups(): Thenable<SidebarTreeItem[]> {
    let tickets = this.store.getTickets();

    // Apply plan filter if set
    if (this.filterPlan) {
      tickets = tickets.filter(ticket => ticket.parent_plan === this.filterPlan);
    }

    // Count tickets by status
    const counts: Record<TicketStatus, number> = {
      [TicketStatus.Backlog]: 0,
      [TicketStatus.Ready]: 0,
      [TicketStatus.InProgress]: 0,
      [TicketStatus.Blocked]: 0,
      [TicketStatus.Review]: 0,
      [TicketStatus.Done]: 0
    };

    for (const ticket of tickets) {
      counts[ticket.status]++;
    }

    // Create status groups (only show groups with tickets)
    const groups: SidebarTreeItem[] = [];
    const statusOrder: TicketStatus[] = [
      TicketStatus.Blocked,
      TicketStatus.Backlog,
      TicketStatus.Ready,
      TicketStatus.InProgress,
      TicketStatus.Review,
      TicketStatus.Done
    ];

    for (const status of statusOrder) {
      if (counts[status] > 0) {
        groups.push(new StatusGroupTreeItem(status, counts[status]));
      }
    }

    return Promise.resolve(groups);
  }

  /**
   * Get tickets for a specific status
   */
  private getTicketsForStatus(status: TicketStatus): Thenable<SidebarTreeItem[]> {
    let tickets = this.store.getTicketsByStatus(status);

    // Apply plan filter if set
    if (this.filterPlan) {
      tickets = tickets.filter(ticket => ticket.parent_plan === this.filterPlan);
    }

    // Sort by priority (ascending, 1 = highest priority first)
    tickets.sort((a, b) => a.priority - b.priority);

    const items = tickets.map(
      ticket => new TicketTreeItem(ticket, this.workflowRoot!)
    );

    return Promise.resolve(items);
  }
}

/**
 * TreeDataProvider for plans view
 * Groups plans into current and archive
 */
export class PlansTreeProvider implements vscode.TreeDataProvider<SidebarTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<SidebarTreeItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<SidebarTreeItem | undefined> = this._onDidChangeTreeData.event;

  private workflowRoot: string | null = null;

  constructor(private readonly store: WorkflowStore) {
    // Subscribe to store change events for reactive updates
    store.onDidChange((event: StoreChangeEvent) => {
      if (event.type === 'plan') {
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
   * Refresh tree data
   */
  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Get tree item for element
   */
  getTreeItem(element: SidebarTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for element
   */
  getChildren(element?: SidebarTreeItem): Thenable<SidebarTreeItem[]> {
    if (!this.workflowRoot) {
      return Promise.resolve([]);
    }

    if (!element) {
      // Root level: show plan groups
      return this.getPlanGroups();
    }

    if (element.itemType === 'plan-group') {
      // Plan group level: show plans in that group
      const planGroup = element as PlanGroupTreeItem;
      return this.getPlansForGroup(planGroup.groupType);
    }

    return Promise.resolve([]);
  }

  /**
   * Get plan groups (current/archive) with counts
   */
  private getPlanGroups(): Thenable<SidebarTreeItem[]> {
    const plans = this.store.getPlans();
    
    const currentPlans = plans.filter(p => p.folder === 'current');
    const archivedPlans = plans.filter(p => p.folder === 'archive');

    const groups: SidebarTreeItem[] = [];
    
    if (currentPlans.length > 0) {
      groups.push(new PlanGroupTreeItem('current', currentPlans.length));
    }
    
    if (archivedPlans.length > 0) {
      groups.push(new PlanGroupTreeItem('archive', archivedPlans.length));
    }

    return Promise.resolve(groups);
  }

  /**
   * Get plans for a specific group
   */
  private getPlansForGroup(groupType: 'current' | 'archive'): Thenable<SidebarTreeItem[]> {
    const plans = this.store.getPlans();
    
    const filteredPlans = plans.filter(p => p.folder === groupType);
    
    // Sort by ID
    filteredPlans.sort((a, b) => a.id.localeCompare(b.id));
    
    const items = filteredPlans.map(
      plan => new PlanTreeItem(plan, this.workflowRoot!, groupType === 'current')
    );

    return Promise.resolve(items);
  }
}

/**
 * TreeDataProvider for reports view
 * Shows reports sorted by date
 */
export class ReportsTreeProvider implements vscode.TreeDataProvider<SidebarTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<SidebarTreeItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<SidebarTreeItem | undefined> = this._onDidChangeTreeData.event;

  private workflowRoot: string | null = null;

  constructor(private readonly store: WorkflowStore) {
    // Subscribe to store change events for reactive updates
    store.onDidChange((event: StoreChangeEvent) => {
      if (event.type === 'report') {
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
   * Refresh tree data
   */
  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Get tree item for element
   */
  getTreeItem(element: SidebarTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for element
   */
  getChildren(element?: SidebarTreeItem): Thenable<SidebarTreeItem[]> {
    if (!this.workflowRoot) {
      return Promise.resolve([]);
    }

    if (element) {
      return Promise.resolve([]);
    }

    // Root level: show all reports sorted by date
    return this.getReports();
  }

  /**
   * Get reports sorted by creation date (newest first)
   */
  private getReports(): Thenable<SidebarTreeItem[]> {
    const reports = this.store.getReports();
    
    // Sort by created_at descending (newest first)
    reports.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    
    const items = reports.map(
      report => new ReportTreeItem(report, this.workflowRoot!)
    );

    return Promise.resolve(items);
  }
}

/**
 * TreeDataProvider for pipeline view
 * Shows pipeline stages from configuration
 */
export class PipelineTreeProvider implements vscode.TreeDataProvider<SidebarTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<SidebarTreeItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<SidebarTreeItem | undefined> = this._onDidChangeTreeData.event;

  private workflowRoot: string | null = null;

  constructor(private readonly store: WorkflowStore) {
    // Subscribe to store change events for reactive updates
    store.onDidChange((event: StoreChangeEvent) => {
      if (event.type === 'config') {
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
   * Refresh tree data
   */
  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Get tree item for element
   */
  getTreeItem(element: SidebarTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for element
   */
  getChildren(element?: SidebarTreeItem): Thenable<SidebarTreeItem[]> {
    if (!this.workflowRoot) {
      return Promise.resolve([]);
    }

    if (element) {
      return Promise.resolve([]);
    }

    // Root level: show pipeline stages
    return this.getPipelineStages();
  }

  /**
   * Get pipeline stages from configuration
   */
  private getPipelineStages(): Thenable<SidebarTreeItem[]> {
    const pipeline = this.store.getPipeline();

    if (!pipeline?.pipeline?.stages) {
      return Promise.resolve([]);
    }

    const stages = pipeline.pipeline.stages;
    const items: SidebarTreeItem[] = [];

    for (const [stageId, stageConfig] of Object.entries(stages)) {
      const item = new SidebarTreeItem(
        stageId,
        vscode.TreeItemCollapsibleState.None,
        'ticket',
        stageId
      );

      item.description = stageConfig.description || '';
      item.tooltip = stageConfig.description || stageId;
      item.iconPath = new vscode.ThemeIcon('gear');

      items.push(item);
    }

    return Promise.resolve(items);
  }
}

/**
 * Tree item representing a skill
 */
export class SkillTreeItem extends SidebarTreeItem {
  constructor(
    public readonly skillId: string,
    public readonly skillPath: string,
    public readonly stagesCount: number,
    public readonly isUnlinked: boolean
  ) {
    const label = skillId;
    const description = `${stagesCount} stage${stagesCount !== 1 ? 's' : ''}`;
    super(label, vscode.TreeItemCollapsibleState.None, 'skill', skillId);

    this.description = description;
    this.tooltip = `${skillId}\nStages: ${stagesCount}\nPath: ${skillPath}`;
    this.iconPath = isUnlinked
      ? new vscode.ThemeIcon('warning', new vscode.ThemeColor('notificationsWarningIcon.foreground'))
      : new vscode.ThemeIcon('symbol-method');

    // Command to open SKILL.md file on click
    this.command = {
      command: 'vscode.open',
      title: vscode.l10n.t('Open Skill'),
      arguments: [vscode.Uri.file(skillPath)]
    };
  }
}

/**
 * TreeDataProvider for skills view
 * Scans .workflow/src/skills/{skill}/SKILL.md and displays skills with stages count
 */
export class SkillsTreeProvider implements vscode.TreeDataProvider<SidebarTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<SidebarTreeItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<SidebarTreeItem | undefined> = this._onDidChangeTreeData.event;

  private workflowRoot: string | null = null;
  private skillsWatcher: vscode.FileSystemWatcher | null = null;

  constructor(private readonly store: WorkflowStore) {
    // Subscribe to store change events for reactive updates
    store.onDidChange((event: StoreChangeEvent) => {
      if (event.type === 'config') {
        this.refresh();
      }
    });
  }

  /**
   * Set workflow root directory and setup file watcher
   */
  setWorkflowRoot(root: string): void {
    this.workflowRoot = root;

    // Setup file watcher for SKILL.md files
    if (this.skillsWatcher) {
      this.skillsWatcher.dispose();
    }

    const skillsPattern = path.join(root, 'src', 'skills', '*', 'SKILL.md');
    this.skillsWatcher = vscode.workspace.createFileSystemWatcher(skillsPattern);

    this.skillsWatcher.onDidChange(() => this.refresh());
    this.skillsWatcher.onDidCreate(() => this.refresh());
    this.skillsWatcher.onDidDelete(() => this.refresh());

    this.refresh();
  }

  /**
   * Dispose file watcher
   */
  dispose(): void {
    if (this.skillsWatcher) {
      this.skillsWatcher.dispose();
    }
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
  getTreeItem(element: SidebarTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for element
   */
  getChildren(element?: SidebarTreeItem): Thenable<SidebarTreeItem[]> {
    if (!this.workflowRoot) {
      return Promise.resolve([]);
    }

    if (element) {
      return Promise.resolve([]);
    }

    // Root level: show all skills
    return this.getSkills();
  }

  /**
   * Scan and return all skills as tree items
   */
  private async getSkills(): Promise<SidebarTreeItem[]> {
    const skillsDir = path.join(this.workflowRoot!, 'src', 'skills');

    try {
      const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(skillsDir));
      const items: SkillTreeItem[] = [];

      // Filter directories and sort alphabetically
      const skillDirs = entries
        .filter(([_, type]) => type === vscode.FileType.Directory)
        .map(([name]) => name)
        .sort();

      // Get pipeline stages to check skill bindings
      const pipeline = this.store.getPipeline();
      const stageSkills = this.getStageSkillsFromPipeline(pipeline);

      for (const skillDir of skillDirs) {
        const skillPath = path.join(skillsDir, skillDir, 'SKILL.md');
        const skillUri = vscode.Uri.file(skillPath);

        // Check if SKILL.md exists
        try {
          await vscode.workspace.fs.stat(skillUri);
        } catch {
          continue; // Skip if SKILL.md doesn't exist
        }

        // Count stages that reference this skill
        const stagesCount = stageSkills.get(skillDir) || 0;
        const isUnlinked = stagesCount === 0;

        items.push(new SkillTreeItem(skillDir, skillPath, stagesCount, isUnlinked));
      }

      return items;
    } catch (error) {
      console.error('Failed to read skills directory:', error);
      return [];
    }
  }

  /**
   * Extract skill bindings from pipeline configuration
   * Returns a map of skillId -> stages count
   */
  private getStageSkillsFromPipeline(pipeline: any): Map<string, number> {
    const skillCounts = new Map<string, number>();

    if (!pipeline?.pipeline?.stages) {
      return skillCounts;
    }

    const stages = pipeline.pipeline.stages;

    for (const stageConfig of Object.values(stages)) {
      const stage = stageConfig as any;
      if (stage.skill && typeof stage.skill === 'string') {
        const count = skillCounts.get(stage.skill) || 0;
        skillCounts.set(stage.skill, count + 1);
      }
    }

    return skillCounts;
  }
}

/**
 * Tree item representing a log file
 */
export class LogFileTreeItem extends SidebarTreeItem {
  constructor(
    public readonly fileName: string,
    public readonly filePath: string,
    public readonly modifiedDate: Date
  ) {
    const label = fileName;
    const description = modifiedDate.toLocaleString();
    super(label, vscode.TreeItemCollapsibleState.None, 'log', fileName);

    this.description = description;
    this.tooltip = `${fileName}\nModified: ${modifiedDate.toLocaleString()}`;
    this.iconPath = new vscode.ThemeIcon('output');

    // Command to open log file on click
    this.command = {
      command: 'vscode.open',
      title: vscode.l10n.t('Open Log'),
      arguments: [vscode.Uri.file(filePath)]
    };
  }
}

/**
 * TreeDataProvider for logs view
 * Scans .workflow/logs/ and displays log files sorted by modification date (newest first)
 */
export class LogsTreeProvider implements vscode.TreeDataProvider<SidebarTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<SidebarTreeItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<SidebarTreeItem | undefined> = this._onDidChangeTreeData.event;

  private workflowRoot: string | null = null;
  private logsWatcher: vscode.FileSystemWatcher | null = null;

  constructor(private readonly store: WorkflowStore) {
    // Subscribe to store change events for reactive updates
    store.onDidChange((event: StoreChangeEvent) => {
      if (event.type === 'config') {
        this.refresh();
      }
    });
  }

  /**
   * Set workflow root directory and setup file watcher
   */
  setWorkflowRoot(root: string): void {
    this.workflowRoot = root;

    // Setup file watcher for log files
    if (this.logsWatcher) {
      this.logsWatcher.dispose();
    }

    const logsPattern = path.join(root, 'logs', '*');
    this.logsWatcher = vscode.workspace.createFileSystemWatcher(logsPattern);

    this.logsWatcher.onDidChange(() => this.refresh());
    this.logsWatcher.onDidCreate(() => this.refresh());
    this.logsWatcher.onDidDelete(() => this.refresh());

    this.refresh();
  }

  /**
   * Dispose file watcher
   */
  dispose(): void {
    if (this.logsWatcher) {
      this.logsWatcher.dispose();
    }
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
  getTreeItem(element: SidebarTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for element
   */
  getChildren(element?: SidebarTreeItem): Thenable<SidebarTreeItem[]> {
    if (!this.workflowRoot) {
      return Promise.resolve([]);
    }

    if (element) {
      return Promise.resolve([]);
    }

    // Root level: show all log files
    return this.getLogFiles();
  }

  /**
   * Scan and return all log files sorted by modification date (newest first)
   */
  private async getLogFiles(): Promise<SidebarTreeItem[]> {
    const logsDir = path.join(this.workflowRoot!, 'logs');

    try {
      const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(logsDir));
      const items: LogFileTreeItem[] = [];

      // Filter files and get their stats
      for (const [fileName, fileType] of entries) {
        if (fileType === vscode.FileType.File) {
          const filePath = path.join(logsDir, fileName);
          try {
            const stats = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
            const modifiedDate = new Date(stats.mtime);
            items.push(new LogFileTreeItem(fileName, filePath, modifiedDate));
          } catch {
            // Skip files that can't be read
          }
        }
      }

      // Sort by modification date (newest first)
      items.sort((a, b) => b.modifiedDate.getTime() - a.modifiedDate.getTime());

      return items;
    } catch (error) {
      console.error('Failed to read logs directory:', error);
      return [];
    }
  }
}
