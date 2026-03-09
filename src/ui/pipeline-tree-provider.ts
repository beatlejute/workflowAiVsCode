/**
 * PipelineTreeProvider - TreeDataProvider for Pipeline Monitor in Sidebar
 *
 * Provides TreeDataProvider for displaying pipeline execution state:
 * - Current run status, elapsed time, mode, tasks count
 * - Current stage: stage, agent, fallback, skill, ticket, attempt
 * - Completed stages with icons and timing
 * - Statistics: stages started, retries, gotos
 * - Run history: #N, date, result
 *
 * Also manages OutputChannel for streaming logs with timestamps.
 *
 * ADR-005: Event-driven architecture for reactive UI updates
 * ADR-007: Pipeline monitoring via stdout parsing
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { t } from '../i18n';
import { WorkflowStore, StoreChangeEvent } from '../data/workflow-store';
import { PipelineService, PipelineState } from '../services/pipeline-service';

/**
 * Tree item types for pipeline view
 */
export type PipelineTreeItemType =
  | 'pipeline-run'
  | 'current-stage'
  | 'completed-stage'
  | 'statistics'
  | 'history'
  | 'history-item'
  | 'history-report';

/**
 * Base tree item for pipeline view
 */
export class PipelineTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: PipelineTreeItemType,
    public readonly id: string
  ) {
    super(label, collapsibleState);
    this.id = id;
  }
}

/**
 * Tree item representing the current pipeline run
 */
export class PipelineRunTreeItem extends PipelineTreeItem {
  constructor(
    public readonly state: PipelineState,
    public readonly elapsed?: string
  ) {
    const label = getPipelineRunLabel(state);
    super(
      label,
      vscode.TreeItemCollapsibleState.Expanded,
      'pipeline-run',
      'pipeline-run'
    );

    this.description = elapsed ? `Elapsed: ${elapsed}` : '';
    this.tooltip = createPipelineRunTooltip(state, elapsed);
    this.iconPath = getPipelineStateIcon(state);
    this.contextValue = 'pipeline-run';
  }
}

/**
 * Tree item representing the current stage being executed
 */
export class CurrentStageTreeItem extends PipelineTreeItem {
  constructor(
    public readonly stage: string,
    public readonly agent?: string,
    public readonly fallbackAgent?: string,
    public readonly skill?: string,
    public readonly ticket?: string,
    public readonly attempt?: number,
    public readonly maxAttempts?: number
  ) {
    super(
      stage,
      vscode.TreeItemCollapsibleState.None,
      'current-stage',
      'current-stage'
    );

    this.iconPath = new vscode.ThemeIcon('gear~spin');

    const agentInfo = agent ? `${t('Agent')}: ${agent}` : '';
    const ticketInfo = ticket ? `${t('Ticket')}: ${ticket}` : '';
    const attemptInfo = attempt && maxAttempts ? `${t('Attempt')}: ${attempt}/${maxAttempts}` : '';

    this.description = [agentInfo, ticketInfo, attemptInfo].filter(Boolean).join(' | ');
    this.tooltip = createCurrentStageTooltip(
      stage, agent, fallbackAgent, skill, ticket, attempt, maxAttempts
    );
    this.contextValue = 'current-stage';
  }
}

/**
 * Tree item representing a completed stage
 */
 export class CompletedStageTreeItem extends PipelineTreeItem {
   private static counter = 0;
   public readonly reportPath?: string;
   public readonly logLineHint?: number;
   public readonly logFile?: string;
   constructor(
     public readonly stage: string,
     public readonly elapsed?: string,
     public readonly success?: boolean,
     public readonly ticket?: string,
     public readonly agent?: string,
     public readonly skill?: string,
     public readonly statusChange?: string,
     public readonly outputLines?: string[],
     public readonly reportInfo?: ReportInfo,
     logLineHint?: number,
     logFile?: string
   ) {
     const icon = success ? '✅' : '❌';
     const label = `${icon} ${stage}`;
     super(
       label,
       vscode.TreeItemCollapsibleState.None,
       'completed-stage',
       `completed-stage-${CompletedStageTreeItem.counter++}-${stage}`
     );
 
     // Build description: ticket | agent | status (graceful degradation)
     const parts = [ticket, agent, statusChange].filter(Boolean);
     this.description = parts.length > 0 ? parts.join(' | ') : (elapsed ? `${t('Elapsed')}: ${elapsed}` : '');
     this.tooltip = createCompletedStageTooltip(stage, elapsed, success, ticket, agent, skill, statusChange, outputLines);
     // Use contextValue to control context menu visibility:
     // - 'completed-stage-report' for report stages (has Open Report)
     // - 'completed-stage-ticket' for stages with a ticket (has Open Ticket)
     // - 'completed-stage' for stages without ticket/report
     if ((stage === 'create-report' || stage === 'analyze-report') && reportInfo) {
       this.contextValue = ticket ? 'completed-stage-report-ticket' : 'completed-stage-report';
     } else {
       this.contextValue = ticket ? 'completed-stage-ticket' : 'completed-stage';
     }
     // Store reportPath for later access
     this.reportPath = reportInfo?.path;
     this.logLineHint = logLineHint;
     this.logFile = logFile;
   }
 }

/**
 * Tree item representing pipeline statistics
 */
export class StatisticsTreeItem extends PipelineTreeItem {
  constructor(
    public readonly stagesStarted: number,
    public readonly retries: number,
    public readonly gotos: number
  ) {
    super(
      'Statistics',
      vscode.TreeItemCollapsibleState.Collapsed,
      'statistics',
      'statistics'
    );
    this.iconPath = new vscode.ThemeIcon('graph');

    this.description = `${t('Stages Started')}: ${stagesStarted} | ${t('Retries')}: ${retries} | ${t('Goto Transitions')}: ${gotos}`;
    this.tooltip = createStatisticsTooltip(stagesStarted, retries, gotos);
    this.contextValue = 'statistics';
  }
}

/**
 * Tree item representing run history
 */
export class HistoryTreeItem extends PipelineTreeItem {
  constructor(
    public readonly history: RunHistoryEntry[]
  ) {
    super(
      'History',
      vscode.TreeItemCollapsibleState.Collapsed,
      'history',
      'history'
    );
    this.iconPath = new vscode.ThemeIcon('history');

    this.description = history.length > 0 ? `${history.length} ${t('runs')}` : t('No runs yet');
    this.tooltip = createHistoryTooltip(history);
    this.contextValue = 'history';
  }
}

/**
 * Tree item representing a single history entry
 */
export class HistoryItemTreeItem extends PipelineTreeItem {
  constructor(
    public readonly entry: RunHistoryEntry
  ) {
    const icon = entry.result === 'success' ? '✅' : entry.result === 'error' ? '❌' : '⏹️';
    const label = `${icon} #${entry.runNumber}`;
    const hasReports = entry.reports && entry.reports.length > 0;
    super(
      label,
      hasReports ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
      'history-item',
      `history-${entry.runNumber}`
    );

    // Show planId in description when available
    this.description = entry.planId ? `${entry.planId} | ${entry.date}` : entry.date;
    this.tooltip = createHistoryItemTooltip(entry);
    // Use contextValue based on planId presence
    this.contextValue = entry.planId ? 'history-item-plan' : 'history-item';
  }
}

/**
 * Tree item representing a report from pipeline run
 */
export class HistoryReportTreeItem extends PipelineTreeItem {
  constructor(
    public readonly reportId: string,
    public readonly reportPath: string,
    public readonly runNumber: number
  ) {
    const label = `📄 ${reportId}`;
    super(
      label,
      vscode.TreeItemCollapsibleState.None,
      'history-report',
      `history-report-${runNumber}-${reportId}`
    );

    this.description = reportPath;
    this.tooltip = createHistoryReportTooltip(reportId, reportPath);
    this.contextValue = 'history-report';
    this.command = {
      command: 'vscode.open',
      title: 'Open Report',
      arguments: [vscode.Uri.file(reportPath)]
    };
  }
}

/**
 * Run history entry
 */
export interface RunHistoryEntry {
  runNumber: number;
  date: string;
  result: 'success' | 'error' | 'stopped';
  reports?: ReportInfo[];
  logFile?: string;
  planId?: string;
}

/**
 * Persisted history item - serializable version for workspaceState
 */
export interface PersistedHistoryItem {
  runNumber: number;
  timestamp: number;
  result: 'success' | 'error' | 'stopped';
  reports: ReportInfo[];
  logFile?: string;
  planId?: string;
}

/**
 * Report information
 */
export interface ReportInfo {
  id: string;
  path: string;
}

/**
 * Get label for pipeline run based on state and mode
 */
function getPipelineRunLabel(state: PipelineState): string {
  const stateLabels: Record<PipelineState, string> = {
    [PipelineState.Idle]: 'Idle',
    [PipelineState.Running]: 'Running',
    [PipelineState.Error]: 'Error',
    [PipelineState.Completed]: 'Completed'
  };

  return stateLabels[state];
}

/**
 * Get theme icon for pipeline state
 */
function getPipelineStateIcon(state: PipelineState): vscode.ThemeIcon {
  switch (state) {
    case PipelineState.Idle:
      return new vscode.ThemeIcon('circle-outline');
    case PipelineState.Running:
      return new vscode.ThemeIcon('loading~spin');
    case PipelineState.Error:
      return new vscode.ThemeIcon('error', new vscode.ThemeColor('notificationsErrorIcon.foreground'));
    case PipelineState.Completed:
      return new vscode.ThemeIcon('check', new vscode.ThemeColor('terminal.ansiGreen'));
    default:
      return new vscode.ThemeIcon('circle-outline');
  }
}

/**
 * Create tooltip for pipeline run
 */
function createPipelineRunTooltip(
  state: PipelineState,
  elapsed?: string
): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${t('Pipeline Run')}**\n\n`);
  markdown.appendMarkdown(`| ${t('Field')} | ${t('Value')} |\n`);
  markdown.appendMarkdown(`|-------|-------|\n`);
  markdown.appendMarkdown(`| **${t('State')}** | ${state} |\n`);
  if (elapsed) {
    markdown.appendMarkdown(`| **${t('Elapsed')}** | ${elapsed} |\n`);
  }
  return markdown;
}

/**
 * Create tooltip for current stage
 */
function createCurrentStageTooltip(
  stage: string,
  agent?: string,
  fallbackAgent?: string,
  skill?: string,
  ticket?: string,
  attempt?: number,
  maxAttempts?: number
): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${t('Current Stage')}: ${stage}**\n\n`);
  markdown.appendMarkdown(`| ${t('Field')} | ${t('Value')} |\n`);
  markdown.appendMarkdown(`|-------|-------|\n`);
  if (agent) {
    markdown.appendMarkdown(`| **${t('Agent')}** | ${agent} |\n`);
  }
  if (fallbackAgent) {
    markdown.appendMarkdown(`| **${t('Fallback Agent')}** | ${fallbackAgent} |\n`);
  }
  if (skill) {
    markdown.appendMarkdown(`| **${t('Skill')}** | ${skill} |\n`);
  }
  if (ticket) {
    markdown.appendMarkdown(`| **${t('Ticket')}** | ${ticket} |\n`);
  }
  if (attempt !== undefined && maxAttempts !== undefined) {
    markdown.appendMarkdown(`| **${t('Attempt')}** | ${attempt}/${maxAttempts} |\n`);
  }
  return markdown;
}

/**
 * Create tooltip for completed stage
 */
function createCompletedStageTooltip(
  stage: string,
  elapsed?: string,
  success?: boolean,
  ticket?: string,
  agent?: string,
  skill?: string,
  statusChange?: string,
  outputLines?: string[]
): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${t('Completed Stage')}: ${stage}**\n\n`);
  markdown.appendMarkdown(`| ${t('Field')} | ${t('Value')} |\n`);
  markdown.appendMarkdown(`|-------|-------|\n`);
  markdown.appendMarkdown(`| **${t('Result')}** | ${success ? '✅ Success' : '❌ Failed'} |\n`);
  if (ticket) {
    markdown.appendMarkdown(`| **${t('Ticket')}** | ${ticket} |\n`);
  }
  if (agent) {
    markdown.appendMarkdown(`| **${t('Agent')}** | ${agent} |\n`);
  }
  if (skill) {
    markdown.appendMarkdown(`| **${t('Skill')}** | ${skill} |\n`);
  }
  if (statusChange) {
    markdown.appendMarkdown(`| **${t('Status Change')}** | ${statusChange} |\n`);
  }
  if (elapsed) {
    markdown.appendMarkdown(`| **${t('Elapsed')}** | ${elapsed} |\n`);
  }

  // Add output section if available
  if (outputLines && outputLines.length > 0) {
    markdown.appendMarkdown(`\n---\n**${t('Output')}**\n\n`);
    markdown.appendMarkdown('```\n');
    const maxLines = 20;
    const displayLines = outputLines.slice(0, maxLines);
    displayLines.forEach(line => {
      markdown.appendMarkdown(`${line}\n`);
    });
    if (outputLines.length > maxLines) {
      markdown.appendMarkdown(`... (${outputLines.length - maxLines} ${t('lines truncated')})\n`);
    }
    markdown.appendMarkdown('```\n');
  }

  return markdown;
}

/**
 * Create tooltip for statistics
 */
function createStatisticsTooltip(
  stagesStarted: number,
  retries: number,
  gotos: number
): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${t('Pipeline Statistics')}**\n\n`);
  markdown.appendMarkdown(`| ${t('Metric')} | ${t('Count')} |\n`);
  markdown.appendMarkdown(`|--------|-------|\n`);
  markdown.appendMarkdown(`| **${t('Stages Started')}** | ${stagesStarted} |\n`);
  markdown.appendMarkdown(`| **${t('Retries')}** | ${retries} |\n`);
  markdown.appendMarkdown(`| **${t('Goto Transitions')}** | ${gotos} |\n`);
  return markdown;
}

/**
 * Create tooltip for history
 */
function createHistoryTooltip(history: RunHistoryEntry[]): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${t('Run History')}**\n\n`);

  if (history.length === 0) {
    markdown.appendMarkdown(`_${t('No runs yet')}_`);
  } else {
    markdown.appendMarkdown(`| # | ${t('Date')} | ${t('Result')} |\n`);
    markdown.appendMarkdown(`|---|------|--------|\n`);
    history.slice(0, 10).forEach(entry => {
      const icon = entry.result === 'success' ? '✅' : entry.result === 'error' ? '❌' : '⏹️';
      markdown.appendMarkdown(`| ${entry.runNumber} | ${entry.date} | ${icon} |\n`);
    });
  }

  return markdown;
}

/**
 * Create tooltip for history item
 */
function createHistoryItemTooltip(entry: RunHistoryEntry): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${t('Run')} ${entry.runNumber}**\n\n`);
  markdown.appendMarkdown(`| ${t('Field')} | ${t('Value')} |\n`);
  markdown.appendMarkdown(`|-------|-------|\n`);
  markdown.appendMarkdown(`| **${t('Date')}** | ${entry.date} |\n`);
  markdown.appendMarkdown(`| **${t('Result')}** | ${entry.result} |\n`);
  if (entry.reports && entry.reports.length > 0) {
    markdown.appendMarkdown(`| **${t('Reports')}** | ${entry.reports.length} |\n`);
  }
  return markdown;
}

/**
 * Create tooltip for history report
 */
function createHistoryReportTooltip(reportId: string, reportPath: string): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${t('Report')}: ${reportId}**\n\n`);
  markdown.appendMarkdown(`| ${t('Field')} | ${t('Value')} |\n`);
  markdown.appendMarkdown(`|-------|-------|\n`);
  markdown.appendMarkdown(`| **${t('ID')}** | ${reportId} |\n`);
  markdown.appendMarkdown(`| **${t('Path')}** | ${reportPath} |\n`);
  markdown.appendMarkdown(`\n[${t('Click to open')}](command:vscode.open)`);
  return markdown;
}

/**
 * TreeDataProvider for pipeline view
 */
export class PipelineTreeProvider implements vscode.TreeDataProvider<PipelineTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<PipelineTreeItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<PipelineTreeItem | undefined> = this._onDidChangeTreeData.event;

  private workflowRoot: string | null = null;
  private pipelineService: PipelineService | null = null;
  private outputChannel: vscode.OutputChannel | null = null;
  private listenersSetup: boolean = false;
  private runHistory: RunHistoryEntry[] = [];
  private runCounter: number = 0;
  private context: vscode.ExtensionContext | null = null;

  // Statistics
  private stagesStarted: number = 0;
  private retries: number = 0;
  private gotos: number = 0;
  
  // Current state tracking
  private currentState: PipelineState = PipelineState.Idle;
  private currentStage: string | undefined;
  private currentAgent: string | undefined;
  private currentFallbackAgent: string | undefined;
  private currentSkill: string | undefined;
  private currentTicket: string | undefined;
  private currentAttempt: number | undefined;
  private currentMaxAttempts: number | undefined;
  private elapsed: string | undefined;
  private ticketStatusHistory: string[] = []; // Track ticket status changes
  private currentOutputLines: string[] = []; // Track output lines for current stage
  private completedStages: Array<{
    stage: string;
    elapsed?: string;
    success: boolean;
    ticket?: string;
    agent?: string;
    skill?: string;
    statusChange?: string;
    outputLines?: string[];
    reportInfo?: ReportInfo;
    logLineHint?: number;
  }> = [];
  private stageOccurrences: Map<string, number> = new Map(); // Track occurrence index per stage name
  private currentRunReports: ReportInfo[] = []; // Track reports for current run
  private runStartTime: number = 0; // Timestamp when current run started
  private currentRunLogFile?: string; // Track log file for current run
  private currentRunPlanId?: string; // Track plan ID for current run
  private currentStageReport?: ReportInfo; // Track report info for current stage

  constructor(
    private readonly store: WorkflowStore,
    pipelineService?: PipelineService
  ) {
    this.pipelineService = pipelineService || null;

    // Subscribe to store change events for reactive updates
    store.onDidChange((event: StoreChangeEvent) => {
      if (event.type === 'config') {
        this.refresh();
      }
    });
  }

  /**
   * Set workflow root directory and initialize services
   */
  setWorkflowRoot(root: string): void {
    this.workflowRoot = root;

    // Initialize PipelineService if not already done
    if (!this.pipelineService) {
      this.pipelineService = new PipelineService();
    }

    // Initialize OutputChannel
    if (!this.outputChannel) {
      this.outputChannel = vscode.window.createOutputChannel('WF: Pipeline');
    }

    // Setup listeners (idempotent — only binds once via flag check in method)
    this.setupPipelineListeners();

    this.refresh();
  }

  /**
   * Set extension context for persistence
   */
  setContext(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  /**
   * Load history from workspaceState
   */
  async loadHistoryFromStorage(): Promise<void> {
    if (!this.context) return;

    try {
      const persisted = this.context.workspaceState.get<PersistedHistoryItem[]>('pipelineHistory');
      if (persisted && Array.isArray(persisted)) {
        // Deserialize persisted items
        this.runHistory = persisted.map(item => ({
          runNumber: item.runNumber,
          date: new Date(item.timestamp).toLocaleString(),
          result: item.result,
          reports: item.reports || [],
          logFile: item.logFile,
          planId: item.planId
        }));

        // Backfill reports for entries that have none
        if (this.workflowRoot && this.backfillHistoryReports(persisted)) {
          await this.saveHistoryToStorage();
        }

        // Backfill log files for entries that have none
        if (this.workflowRoot && this.backfillHistoryLogFiles(persisted)) {
          await this.saveHistoryToStorage();
        }

        // Restore run counter from highest run number
        if (this.runHistory.length > 0) {
          this.runCounter = Math.max(...this.runHistory.map(h => h.runNumber));
        }

        this.refresh();
      }
    } catch (error) {
      console.error('Failed to load pipeline history from storage:', error);
    }
  }

  /**
   * Backfill reports for persisted history entries that have none.
   * Matches report files by mtime to run completion timestamps.
   * Returns true if any entries were updated.
   */
  private backfillHistoryReports(persisted: PersistedHistoryItem[]): boolean {
    if (!this.workflowRoot) return false;
    const reportsDir = path.join(this.workflowRoot, 'reports');
    try {
      if (!fs.existsSync(reportsDir)) {
        console.log('[Backfill] Reports dir not found:', reportsDir);
        return false;
      }

      const reportFiles = fs.readdirSync(reportsDir)
        .filter(f => f.endsWith('.md'))
        .map(f => {
          const filePath = path.join(reportsDir, f);
          const stat = fs.statSync(filePath);
          return { id: f.replace('.md', ''), path: filePath, mtime: stat.mtimeMs };
        });

      console.log(`[Backfill] Found ${reportFiles.length} report files, ${persisted.length} history entries`);

      if (reportFiles.length === 0) return false;

      // Pair timestamps with history entries, sorted ascending by time
      const pairs = persisted.map((p, i) => ({
        timestamp: p.timestamp,
        entry: this.runHistory[i]
      })).sort((a, b) => a.timestamp - b.timestamp);

      for (const p of pairs) {
        console.log(`[Backfill] Run #${p.entry.runNumber}: timestamp=${p.timestamp}, reports=${p.entry.reports?.length ?? 'undefined'}`);
      }

      let updated = false;
      for (let i = 0; i < pairs.length; i++) {
        if (pairs[i].entry.reports && pairs[i].entry.reports!.length > 0) continue;

        const runTs = pairs[i].timestamp;
        const prevTs = i > 0 ? pairs[i - 1].timestamp : 0;

        const matched = reportFiles.filter(r => r.mtime <= runTs && r.mtime > prevTs);
        console.log(`[Backfill] Run #${pairs[i].entry.runNumber}: runTs=${runTs}, prevTs=${prevTs}, matched=${matched.length}`);
        if (matched.length > 0) {
          pairs[i].entry.reports = matched.map(r => ({ id: r.id, path: r.path }));
          updated = true;
        }
      }

      console.log(`[Backfill] Updated: ${updated}`);
      return updated;
    } catch (e) {
      console.error('[Backfill] Error:', e);
      return false;
    }
  }

  /**
   * Backfill log files for persisted history entries that have none.
   * Matches log files by mtime to run completion timestamps.
   * Returns true if any entries were updated.
   */
  private backfillHistoryLogFiles(persisted: PersistedHistoryItem[]): boolean {
    if (!this.workflowRoot) return false;
    const logsDir = path.join(this.workflowRoot, 'logs');
    try {
      if (!fs.existsSync(logsDir)) {
        console.log('[Backfill] Logs dir not found:', logsDir);
        return false;
      }

      const logFiles = fs.readdirSync(logsDir)
        .filter(f => f.endsWith('.log'))
        .map(f => {
          const filePath = path.join(logsDir, f);
          const stat = fs.statSync(filePath);
          return { path: filePath, mtime: stat.mtimeMs };
        });

      console.log(`[Backfill] Found ${logFiles.length} log files, ${persisted.length} history entries`);

      if (logFiles.length === 0) return false;

      // Pair timestamps with history entries, sorted ascending by time
      const pairs = persisted.map((p, i) => ({
        timestamp: p.timestamp,
        entry: this.runHistory[i]
      })).sort((a, b) => a.timestamp - b.timestamp);

      let updated = false;
      for (let i = 0; i < pairs.length; i++) {
        if (pairs[i].entry.logFile) continue;

        const runTs = pairs[i].timestamp;
        const prevTs = i > 0 ? pairs[i - 1].timestamp : 0;

        const matched = logFiles.filter(r => r.mtime <= runTs && r.mtime > prevTs);
        if (matched.length > 0) {
          // Use the most recent log file within the time window
          const bestMatch = matched.reduce((a, b) => a.mtime > b.mtime ? a : b);
          pairs[i].entry.logFile = bestMatch.path;
          updated = true;
        }
      }

      console.log(`[Backfill] Log files updated: ${updated}`);
      return updated;
    } catch (e) {
      console.error('[Backfill] Error:', e);
      return false;
    }
  }

  /**
   * Save history to workspaceState
   */
  async saveHistoryToStorage(): Promise<void> {
    if (!this.context) return;

    try {
      // Serialize history items for storage
      const persisted: PersistedHistoryItem[] = this.runHistory.map(item => ({
        runNumber: item.runNumber,
        timestamp: new Date(item.date).getTime(),
        result: item.result,
        reports: item.reports || [],
        logFile: item.logFile,
        planId: item.planId
      }));

      // Enforce 50 item limit (FIFO)
      if (persisted.length > 50) {
        const trimmed = persisted.slice(0, 50);
        await this.context.workspaceState.update('pipelineHistory', trimmed);
      } else {
        await this.context.workspaceState.update('pipelineHistory', persisted);
      }
    } catch (error) {
      console.error('Failed to save pipeline history to storage:', error);
    }
  }

  /**
   * Setup listeners for pipeline service events
   */
  private setupPipelineListeners(): void {
    if (!this.pipelineService || this.listenersSetup) return;
    this.listenersSetup = true;

    this.pipelineService.onStateChange((state: PipelineState) => {
      const previousState = this.currentState;
      this.currentState = state;

      // Track run completion for history (including manual stops)
      const isCompleted = state === PipelineState.Completed || state === PipelineState.Error;
      const isManuallyStopped = state === PipelineState.Idle && previousState === PipelineState.Running;

      if (isCompleted || isManuallyStopped) {
        // Fallback: if CLI didn't emit CREATE_REPORT, scan reports directory
        if (this.currentRunReports.length === 0 && this.workflowRoot) {
          this.currentRunReports = this.scanForNewReports();
        }

        // Scan for log file if not already tracked
        if (!this.currentRunLogFile && this.workflowRoot) {
          this.currentRunLogFile = this.scanForLogFile();
        }

        const result = isManuallyStopped ? 'stopped'
          : state === PipelineState.Completed ? 'success' : 'error';
        this.runCounter++;
        this.runHistory.unshift({
          runNumber: this.runCounter,
          date: new Date().toLocaleString(),
          result,
          reports: [...this.currentRunReports],
          logFile: this.currentRunLogFile,
          planId: this.currentRunPlanId
        });

        // Keep only last 50 runs in history
        if (this.runHistory.length > 50) {
          this.runHistory = this.runHistory.slice(0, 50);
        }

        // Reset current run tracking
        this.currentRunReports = [];
        this.currentRunLogFile = undefined;
        this.currentRunPlanId = undefined;

        // Save history to workspaceState (fire-and-forget)
        this.saveHistoryToStorage();
      }

      this.refresh();
    });

    this.pipelineService.onLog((log: string) => {
      // Add timestamp and write to output channel
      const timestamp = new Date().toLocaleTimeString();
      const logEntry = `[${timestamp}] ${log}`;

      if (this.outputChannel) {
        this.outputChannel.appendLine(logEntry);
      }

      // Parse log for stage transitions and update state
      let changed = false;
      const lines = log.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          if (this.parseLogLine(trimmed)) {
            changed = true;
          }
        }
      }

      if (changed) {
        this.refresh();
      }
    });
  }

  /**
   * Parse a single log line to update stage tracking.
   * Returns true if any state changed (caller should refresh).
   *
   * Real CLI format:
   * [2024-01-01T12:00:00] [INFO] [stage-name] message
   * [2024-01-01T12:00:00] [INFO] [Runner] GOTO next-stage
   * [2024-01-01T12:00:00] [INFO] [Runner] START stage="X" agent="Y" skill="Z"
   * [2024-01-01T12:00:00] [WARN] [stage] RETRY stage="X" attempt=N/M
   */
  private parseLogLine(line: string): boolean {
    // Strip ANSI escape codes (CLI outputs colored text)
    const clean = line.replace(/\x1b\[[0-9;]*m/g, '');

    // Pattern: [timestamp] [LEVEL] [stage] message (date separator: T or space)
    const basePattern = /^\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})\]\s+\[(\w+)\]\s+\[([^\]]+)\]\s+(.*)$/;
    const baseMatch = clean.match(basePattern);

    if (!baseMatch) {
      return this.parseLogLineLegacy(line);
    }

    const [, _timestamp, level, _stage, message] = baseMatch;

    // Parse GOTO: two formats supported
    // New: GOTO fromStage → toStage status="..." params={...}
    // Old: GOTO next-stage (elapsed: XX)
    const gotoNewMatch = message.match(/^GOTO\s+\S+\s*→\s*(\S+)(?:\s+status="([^"]*)")?(?:\s+params=(\{.*\}))?/);
    const gotoOldMatch = !gotoNewMatch ? message.match(/^GOTO\s+([^\s(]+)(?:\s*\(elapsed:\s*([^)]+)\))?/) : null;
    const gotoMatch = gotoNewMatch || gotoOldMatch;
    if (gotoMatch) {
      this.gotos++;
      const gotoStage = gotoMatch[1];
      const elapsed = gotoNewMatch ? undefined : gotoMatch[2];

      // Extract ticket_id and target from GOTO params JSON
      let gotoTarget: string | undefined;
      if (gotoNewMatch && gotoNewMatch[3]) {
        try {
          const params = JSON.parse(gotoNewMatch[3]);
          if (params.ticket_id && /^[A-Z]+-\d+$/.test(params.ticket_id)) {
            this.currentTicket = params.ticket_id;
          }
          if (params.target) {
            gotoTarget = params.target;
          }
        } catch { /* ignore parse errors */ }
      }

      if (this.currentStage) {
        // Build status change from history, or use GOTO target as fallback
        const statusChange = this.ticketStatusHistory.length > 0
          ? this.ticketStatusHistory.join(' → ')
          : (gotoTarget ? `→ ${gotoTarget}` : undefined);

        const occ = this.stageOccurrences.get(this.currentStage) ?? 0;
        this.completedStages.push({
          stage: this.currentStage,
          elapsed: this.elapsed,
          success: true,
          ticket: this.currentTicket,
          agent: this.currentAgent,
          skill: this.currentSkill,
          statusChange,
          outputLines: [...this.currentOutputLines],
          reportInfo: this.currentStageReport,
          logLineHint: occ
        });
        this.stageOccurrences.set(this.currentStage, occ + 1);
      }

      // Reset status history, output and stage report for next stage
      this.ticketStatusHistory = [];
      this.currentOutputLines = [];
      this.currentStageReport = undefined;

      this.currentStage = gotoStage;
      this.elapsed = elapsed;
      this.stagesStarted++;
      return true;
    }

    // Parse START: [timestamp] [INFO] [stage] START stage="X" agent="Y" skill="Z"
    const startMatch = message.match(/^START(?:\s+stage="([^"]*)")?(?:\s+agent="([^"]*)")?(?:\s+skill="([^"]*)")?/);
    if (startMatch && (startMatch[1] || startMatch[2] || startMatch[3])) {
      if (startMatch[1]) this.currentStage = startMatch[1];
      if (startMatch[2]) this.currentAgent = startMatch[2];
      if (startMatch[3]) this.currentSkill = startMatch[3];
      return true;
    }

    // Parse RETRY: [timestamp] [WARN] [stage] RETRY stage="X" attempt=N/M
    const retryMatch = message.match(/^RETRY\s+stage="([^"]+)"\s+attempt=(\d+)\/(\d+)/);
    if (retryMatch) {
      this.currentStage = retryMatch[1];
      this.currentAttempt = parseInt(retryMatch[2], 10);
      this.currentMaxAttempts = parseInt(retryMatch[3], 10);
      this.retries++;
      return true;
    }

    // Parse MOVE_TICKET: [timestamp] [INFO] [stage] MOVE_TICKET ticket="X" from="Y" to="Z"
    const moveTicketMatch = message.match(/^MOVE_TICKET\s+ticket="([^"]+)"\s+from="([^"]*)"\s+to="([^"]+)"/);
    if (moveTicketMatch) {
      const ticket = moveTicketMatch[1];
      const fromStatus = moveTicketMatch[2];
      const toStatus = moveTicketMatch[3];
      this.currentTicket = ticket;
      // Track status change
      if (fromStatus && toStatus) {
        const statusTransition = `${fromStatus} → ${toStatus}`;
        // Add to history if not duplicate
        if (!this.ticketStatusHistory.includes(statusTransition)) {
          this.ticketStatusHistory.push(statusTransition);
        }
      }
      return true;
    }

    // Parse CREATE_REPORT: [timestamp] [INFO] [stage] CREATE_REPORT id="RPT-XXX" path="..."
    const createReportMatch = message.match(/^CREATE_REPORT\s+id="([^"]+)"\s+path="([^"]+)"/);
    if (createReportMatch) {
      const reportId = createReportMatch[1];
      const reportPath = createReportMatch[2];
      const reportInfo: ReportInfo = { id: reportId, path: reportPath };
      this.currentRunReports.push(reportInfo);
      this.currentStageReport = reportInfo;
      return true;
    }

    // Parse context ticket_id: [timestamp] [INFO] [stage]     ticket_id: XXXX
    const contextTicketMatch = message.match(/^\s*ticket_id:\s*([A-Z]+-\d+)/);
    if (contextTicketMatch) {
      this.currentTicket = contextTicketMatch[1];
      return true;
    }

    // Parse context plan_id: [timestamp] [INFO] [stage]     plan_id: PLAN-XXX
    const contextPlanMatch = message.match(/^\s*plan_id:\s*([A-Z]+-\d+)/);
    if (contextPlanMatch) {
      this.currentRunPlanId = contextPlanMatch[1];
      return true;
    }

    // Parse OUTPUT: [timestamp] [INFO] [stage] OUTPUT: line content
    const outputMatch = message.match(/^OUTPUT:\s*(.*)$/);
    if (outputMatch) {
      const outputLine = outputMatch[1];
      if (outputLine) {
        this.currentOutputLines.push(outputLine);
      }
      return true;
    }

    // Generic info - extract agent/ticket from message if present
    if (level === 'INFO') {
      let changed = false;
      const agentMatch = message.match(/agent:\s*([^,]+)/);
      const ticketMatch = message.match(/ticket:\s*([A-Z]+-\d+)/);
      const retryInfoMatch = message.match(/retry:\s*(\d+)\/(\d+)/);

      if (agentMatch) { this.currentAgent = agentMatch[1].trim(); changed = true; }
      if (ticketMatch) { this.currentTicket = ticketMatch[1]; changed = true; }
      if (retryInfoMatch) {
        this.currentAttempt = parseInt(retryInfoMatch[1], 10);
        this.currentMaxAttempts = parseInt(retryInfoMatch[2], 10);
        this.retries++;
        changed = true;
      }

      // Capture non-system log lines as stage output (for hover tooltip)
      if (this.currentStage && _stage !== 'Runner' && _stage !== 'Pipeline' && message.length > 0) {
        if (this.currentOutputLines.length < 100) {
          this.currentOutputLines.push(message);
        }
      }

      return changed;
    }

    return false;
  }

  /**
   * Legacy parser for old format (fallback).
   * Returns true if any state changed.
   */
  private parseLogLineLegacy(line: string): boolean {
    let changed = false;

    // Track GOTO transitions
    if (line.includes('[GOTO]')) {
      this.gotos++;
      const gotoMatch = line.match(/\[GOTO\]\s+([^\s(]+)(?:\s*\(elapsed:\s*([^)]+)\))?/);
      if (gotoMatch) {
        if (this.currentStage) {
          // Build status change from history
          const statusChange = this.ticketStatusHistory.length > 0
            ? this.ticketStatusHistory.join(' → ')
            : undefined;

          const occ = this.stageOccurrences.get(this.currentStage) ?? 0;
          this.completedStages.push({
            stage: this.currentStage,
            elapsed: this.elapsed,
            success: true,
            ticket: this.currentTicket,
            agent: this.currentAgent,
            skill: this.currentSkill,
            statusChange,
            outputLines: [...this.currentOutputLines],
            reportInfo: this.currentStageReport,
            logLineHint: occ
          });
          this.stageOccurrences.set(this.currentStage, occ + 1);
        }

        // Reset status history, output and stage report for next stage
        this.ticketStatusHistory = [];
        this.currentOutputLines = [];
        this.currentStageReport = undefined;

        this.currentStage = gotoMatch[1];
        this.elapsed = gotoMatch[2];
        this.stagesStarted++;
        changed = true;
      }
    }

    // Track INFO with agent/ticket/retry
    if (line.includes('[INFO]')) {
      const infoMatch = line.match(/\[INFO\](?:\s+agent:\s*([^,]+))?(?:\s*,?\s*ticket:\s*([A-Z]+-\d+))?(?:\s*,?\s*retry:\s*(\d+)\/(\d+))?/);
      if (infoMatch) {
        if (infoMatch[1]) { this.currentAgent = infoMatch[1].trim(); changed = true; }
        if (infoMatch[2]) { this.currentTicket = infoMatch[2]; changed = true; }
        if (infoMatch[3]) {
          this.currentAttempt = parseInt(infoMatch[3], 10);
          this.currentMaxAttempts = parseInt(infoMatch[4], 10);
          this.retries++;
          changed = true;
        }
      }

      // Retry only
      if (!changed) {
        const retryOnlyMatch = line.match(/\[INFO\]\s*retry:\s*(\d+)\/(\d+)/);
        if (retryOnlyMatch) {
          this.currentAttempt = parseInt(retryOnlyMatch[1], 10);
          this.currentMaxAttempts = parseInt(retryOnlyMatch[2], 10);
          this.retries++;
          changed = true;
        }
      }
    }

    // Track CTX for skill info
    if (line.includes('[CTX]')) {
      const ctxMatch = line.match(/\[CTX\]\s+([^:]+):\s*(.+)/);
      if (ctxMatch) {
        const key = ctxMatch[1].trim();
        const value = ctxMatch[2].trim();
        if (key.toLowerCase() === 'skill') {
          this.currentSkill = value;
          changed = true;
        }
      }
    }

    // Parse OUTPUT: line content (legacy format)
    const outputMatch = line.match(/OUTPUT:\s*(.*)$/);
    if (outputMatch) {
      const outputLine = outputMatch[1];
      if (outputLine) {
        this.currentOutputLines.push(outputLine);
      }
      changed = true;
    }

    // Parse CREATE_REPORT: line content (legacy format)
    const createReportMatch = line.match(/CREATE_REPORT\s+id="([^"]+)"(?:\s+path="([^"]+)")?/);
    if (createReportMatch) {
      const reportId = createReportMatch[1];
      const reportPath = createReportMatch[2] || '';
      this.currentRunReports.push({ id: reportId, path: reportPath });
      changed = true;
    }

    // Capture unrecognized lines as stage output (for hover tooltip)
    if (!changed && this.currentStage && line.length > 0
        && !line.startsWith('[PIPELINE]') && !line.startsWith('[ERROR]')) {
      if (this.currentOutputLines.length < 100) {
        this.currentOutputLines.push(line);
      }
    }

    return changed;
  }

  /**
   * Get pipeline service instance
   */
  getPipelineService(): PipelineService | null {
    return this.pipelineService;
  }

  /**
   * Get output channel instance
   */
  getOutputChannel(): vscode.OutputChannel | null {
    return this.outputChannel;
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
  getTreeItem(element: PipelineTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for element
   */
  getChildren(element?: PipelineTreeItem): Thenable<PipelineTreeItem[]> {
    if (!this.workflowRoot) {
      return Promise.resolve([]);
    }

    if (!element) {
      // Root level: show run info, current stage, statistics, history
      return this.getRootItems();
    }

    if (element.itemType === 'statistics') {
      const stats = element as StatisticsTreeItem;
      const items: PipelineTreeItem[] = [];

      const addStat = (label: string, value: number, icon: string, id: string) => {
        const item = new PipelineTreeItem(
          `${label}: ${value}`,
          vscode.TreeItemCollapsibleState.None,
          'statistics',
          id
        );
        item.iconPath = new vscode.ThemeIcon(icon);
        items.push(item);
      };

      addStat(t('Stages Started'), stats.stagesStarted, 'play', 'stat-stages');
      addStat(t('Retries'), stats.retries, 'refresh', 'stat-retries');
      addStat(t('Goto Transitions'), stats.gotos, 'arrow-right', 'stat-gotos');

      return Promise.resolve(items);
    }

    if (element.itemType === 'history') {
      // Show history items
      return Promise.resolve(
        this.runHistory.map(entry => new HistoryItemTreeItem(entry))
      );
    }

    if (element.itemType === 'history-item') {
      // Show reports for history item
      const historyItem = element as HistoryItemTreeItem;
      const reports = historyItem.entry.reports || [];

      if (reports.length === 0) {
        // Show "No reports" item
        const noReportsItem = new PipelineTreeItem(
          t('No reports'),
          vscode.TreeItemCollapsibleState.None,
          'history-report',
          `history-${historyItem.entry.runNumber}-no-reports`
        );
        noReportsItem.iconPath = new vscode.ThemeIcon('info');
        return Promise.resolve([noReportsItem]);
      }

      return Promise.resolve(
        reports.map(report => new HistoryReportTreeItem(report.id, report.path, historyItem.entry.runNumber))
      );
    }

    return Promise.resolve([]);
  }

  /**
   * Get root level items
   */
  private getRootItems(): Thenable<PipelineTreeItem[]> {
    const items: PipelineTreeItem[] = [];

    // 1. Pipeline run status
    items.push(new PipelineRunTreeItem(
      this.currentState,
      this.elapsed
    ));

    // 2. Current stage (if running)
    if (this.currentState === PipelineState.Running && this.currentStage) {
      items.push(new CurrentStageTreeItem(
        this.currentStage,
        this.currentAgent,
        this.currentFallbackAgent,
        this.currentSkill,
        this.currentTicket,
        this.currentAttempt,
        this.currentMaxAttempts
      ));
    }

    // 3. Completed stages (newest on top)
    const logFile = this.currentRunLogFile || this.scanForLogFile();
    for (let i = this.completedStages.length - 1; i >= 0; i--) {
      const info = this.completedStages[i];
      items.push(new CompletedStageTreeItem(
        info.stage,
        info.elapsed,
        info.success,
        info.ticket,
        info.agent,
        info.skill,
        info.statusChange,
        info.outputLines,
        info.reportInfo,
        info.logLineHint,
        logFile
      ));
    }

    // 4. Statistics
    items.push(new StatisticsTreeItem(
      this.stagesStarted,
      this.retries,
      this.gotos
    ));

    // 5. History
    items.push(new HistoryTreeItem(this.runHistory));

    return Promise.resolve(items);
  }

  /**
   * Start pipeline execution
   * @param planId - Optional plan ID to run pipeline for a specific plan
   */
  async startPipeline(planId?: string): Promise<void> {
    if (!this.pipelineService) {
      vscode.window.showErrorMessage(t('Pipeline service not available'));
      return;
    }

    // Reset state from previous run
    this.completedStages = [];
    this.currentStage = undefined;
    this.currentAgent = undefined;
    this.currentFallbackAgent = undefined;
    this.currentSkill = undefined;
    this.currentTicket = undefined;
    this.currentAttempt = undefined;
    this.currentMaxAttempts = undefined;
    this.elapsed = undefined;
    this.ticketStatusHistory = [];
    this.currentOutputLines = [];
    this.currentRunReports = [];
    this.stageOccurrences = new Map();
    this.currentRunLogFile = undefined;
    this.currentRunPlanId = planId; // Set plan ID for current run
    this.currentStageReport = undefined;
    this.runStartTime = Date.now();
    this.stagesStarted = 0;
    this.retries = 0;
    this.gotos = 0;

    try {
      await this.pipelineService.start(planId);

      if (this.outputChannel) {
        this.outputChannel.show(true);
      }

      vscode.window.showInformationMessage(t('Pipeline started'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(t('Failed to start pipeline: {0}', message));
    }
  }

  /**
   * Stop pipeline execution
   */
  stopPipeline(): void {
    if (!this.pipelineService) {
      vscode.window.showErrorMessage(t('Pipeline service not available'));
      return;
    }

    this.pipelineService.stop();
    vscode.window.showInformationMessage(t('Pipeline stopped'));
  }

  /**
   * Show output channel
   */
  showOutput(): void {
    if (this.outputChannel) {
      this.outputChannel.show();
    }
  }

  /**
   * Scan reports directory for files created/modified during the current run
   */
  private scanForNewReports(): ReportInfo[] {
    if (!this.workflowRoot || this.runStartTime === 0) return [];
    const reportsDir = path.join(this.workflowRoot, 'reports');
    try {
      if (!fs.existsSync(reportsDir)) return [];
      const files = fs.readdirSync(reportsDir);
      const reports: ReportInfo[] = [];
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const filePath = path.join(reportsDir, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs >= this.runStartTime) {
          const id = file.replace('.md', '');
          reports.push({ id, path: filePath });
        }
      }
      return reports;
    } catch {
      return [];
    }
  }

  /**
   * Scan logs directory for log file created during the current run
   */
  private scanForLogFile(): string | undefined {
    if (!this.workflowRoot || this.runStartTime === 0) return undefined;
    const logsDir = path.join(this.workflowRoot, 'logs');
    try {
      if (!fs.existsSync(logsDir)) return undefined;
      const files = fs.readdirSync(logsDir);
      for (const file of files) {
        if (!file.endsWith('.log')) continue;
        const filePath = path.join(logsDir, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs >= this.runStartTime) {
          return filePath;
        }
      }
    } catch {
      // ignore errors
    }
    return undefined;
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.runHistory = [];
    this.runCounter = 0;
    this.stagesStarted = 0;
    this.retries = 0;
    this.gotos = 0;
    this.completedStages = [];
    this.ticketStatusHistory = [];
    this.refresh();
    vscode.window.showInformationMessage(t('Pipeline history cleared'));
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    if (this.pipelineService) {
      this.pipelineService.dispose();
    }
    if (this.outputChannel) {
      this.outputChannel.dispose();
    }
  }
}
