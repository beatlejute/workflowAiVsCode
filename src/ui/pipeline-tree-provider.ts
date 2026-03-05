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
import { WorkflowStore, StoreChangeEvent } from '../data/workflow-store';
import { PipelineService, PipelineState, PipelineMode } from '../services/pipeline-service';

/**
 * Tree item types for pipeline view
 */
export type PipelineTreeItemType = 
  | 'pipeline-run'
  | 'current-stage'
  | 'completed-stage'
  | 'statistics'
  | 'history'
  | 'history-item';

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
    public readonly mode: PipelineMode,
    public readonly elapsed?: string,
    public readonly tasksCount?: number
  ) {
    const label = getPipelineRunLabel(state, mode, tasksCount);
    super(
      label,
      vscode.TreeItemCollapsibleState.Expanded,
      'pipeline-run',
      'pipeline-run'
    );

    this.description = elapsed ? `Elapsed: ${elapsed}` : '';
    this.tooltip = createPipelineRunTooltip(state, mode, elapsed, tasksCount);
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
    const label = `$(gear) ${stage}`;
    super(
      label,
      vscode.TreeItemCollapsibleState.None,
      'current-stage',
      'current-stage'
    );

    const agentInfo = agent ? `${vscode.l10n.t('Agent')}: ${agent}` : '';
    const ticketInfo = ticket ? `${vscode.l10n.t('Ticket')}: ${ticket}` : '';
    const attemptInfo = attempt && maxAttempts ? `${vscode.l10n.t('Attempt')}: ${attempt}/${maxAttempts}` : '';

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
  constructor(
    public readonly stage: string,
    public readonly elapsed?: string,
    public readonly success?: boolean
  ) {
    const icon = success ? '✅' : '❌';
    const label = `${icon} ${stage}`;
    super(
      label,
      vscode.TreeItemCollapsibleState.None,
      'completed-stage',
      `completed-stage-${stage}`
    );

    this.description = elapsed ? `${vscode.l10n.t('Elapsed')}: ${elapsed}` : '';
    this.tooltip = createCompletedStageTooltip(stage, elapsed, success);
    this.contextValue = 'completed-stage';
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
    const label = `$(graph) Statistics`;
    super(
      label,
      vscode.TreeItemCollapsibleState.Collapsed,
      'statistics',
      'statistics'
    );

    this.description = `${vscode.l10n.t('Stages Started')}: ${stagesStarted} | ${vscode.l10n.t('Retries')}: ${retries} | ${vscode.l10n.t('Goto Transitions')}: ${gotos}`;
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
    const label = `$(history) History`;
    super(
      label,
      vscode.TreeItemCollapsibleState.Collapsed,
      'history',
      'history'
    );

    this.description = history.length > 0 ? `${history.length} ${vscode.l10n.t('runs')}` : vscode.l10n.t('No runs yet');
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
    super(
      label,
      vscode.TreeItemCollapsibleState.None,
      'history-item',
      `history-${entry.runNumber}`
    );

    this.description = entry.date;
    this.tooltip = createHistoryItemTooltip(entry);
    this.contextValue = 'history-item';
  }
}

/**
 * Run history entry
 */
export interface RunHistoryEntry {
  runNumber: number;
  date: string;
  result: 'success' | 'error' | 'stopped';
  mode: PipelineMode;
  tasksCompleted?: number;
}

/**
 * Get label for pipeline run based on state and mode
 */
function getPipelineRunLabel(
  state: PipelineState,
  mode: PipelineMode,
  tasksCount?: number
): string {
  const modeLabels: Record<PipelineMode, string> = {
    'single-cycle': 'Single Cycle',
    'continuous': 'Continuous',
    'n-tasks': `${tasksCount || '?'} Tasks`
  };

  const stateLabels: Record<PipelineState, string> = {
    [PipelineState.Idle]: 'Idle',
    [PipelineState.Running]: 'Running',
    [PipelineState.Error]: 'Error',
    [PipelineState.Completed]: 'Completed'
  };

  return `${stateLabels[state]} - ${modeLabels[mode]}`;
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
  mode: PipelineMode,
  elapsed?: string,
  tasksCount?: number
): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${vscode.l10n.t('Pipeline Run')}**\n\n`);
  markdown.appendMarkdown(`| ${vscode.l10n.t('Field')} | ${vscode.l10n.t('Value')} |\n`);
  markdown.appendMarkdown(`|-------|-------|\n`);
  markdown.appendMarkdown(`| **${vscode.l10n.t('State')}** | ${state} |\n`);
  markdown.appendMarkdown(`| **${vscode.l10n.t('Mode')}** | ${mode} |\n`);
  if (elapsed) {
    markdown.appendMarkdown(`| **${vscode.l10n.t('Elapsed')}** | ${elapsed} |\n`);
  }
  if (tasksCount !== undefined) {
    markdown.appendMarkdown(`| **${vscode.l10n.t('Tasks')}** | ${tasksCount} |\n`);
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
  markdown.appendMarkdown(`**${vscode.l10n.t('Current Stage')}: ${stage}**\n\n`);
  markdown.appendMarkdown(`| ${vscode.l10n.t('Field')} | ${vscode.l10n.t('Value')} |\n`);
  markdown.appendMarkdown(`|-------|-------|\n`);
  if (agent) {
    markdown.appendMarkdown(`| **${vscode.l10n.t('Agent')}** | ${agent} |\n`);
  }
  if (fallbackAgent) {
    markdown.appendMarkdown(`| **${vscode.l10n.t('Fallback Agent')}** | ${fallbackAgent} |\n`);
  }
  if (skill) {
    markdown.appendMarkdown(`| **${vscode.l10n.t('Skill')}** | ${skill} |\n`);
  }
  if (ticket) {
    markdown.appendMarkdown(`| **${vscode.l10n.t('Ticket')}** | ${ticket} |\n`);
  }
  if (attempt !== undefined && maxAttempts !== undefined) {
    markdown.appendMarkdown(`| **${vscode.l10n.t('Attempt')}** | ${attempt}/${maxAttempts} |\n`);
  }
  return markdown;
}

/**
 * Create tooltip for completed stage
 */
function createCompletedStageTooltip(
  stage: string,
  elapsed?: string,
  success?: boolean
): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${vscode.l10n.t('Completed Stage')}: ${stage}**\n\n`);
  markdown.appendMarkdown(`| ${vscode.l10n.t('Field')} | ${vscode.l10n.t('Value')} |\n`);
  markdown.appendMarkdown(`|-------|-------|\n`);
  markdown.appendMarkdown(`| **${vscode.l10n.t('Result')}** | ${success ? '✅ Success' : '❌ Failed'} |\n`);
  if (elapsed) {
    markdown.appendMarkdown(`| **${vscode.l10n.t('Elapsed')}** | ${elapsed} |\n`);
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
  markdown.appendMarkdown(`**${vscode.l10n.t('Pipeline Statistics')}**\n\n`);
  markdown.appendMarkdown(`| ${vscode.l10n.t('Metric')} | ${vscode.l10n.t('Count')} |\n`);
  markdown.appendMarkdown(`|--------|-------|\n`);
  markdown.appendMarkdown(`| **${vscode.l10n.t('Stages Started')}** | ${stagesStarted} |\n`);
  markdown.appendMarkdown(`| **${vscode.l10n.t('Retries')}** | ${retries} |\n`);
  markdown.appendMarkdown(`| **${vscode.l10n.t('Goto Transitions')}** | ${gotos} |\n`);
  return markdown;
}

/**
 * Create tooltip for history
 */
function createHistoryTooltip(history: RunHistoryEntry[]): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${vscode.l10n.t('Run History')}**\n\n`);

  if (history.length === 0) {
    markdown.appendMarkdown(`_${vscode.l10n.t('No runs yet')}_`);
  } else {
    markdown.appendMarkdown(`| # | ${vscode.l10n.t('Date')} | ${vscode.l10n.t('Result')} | ${vscode.l10n.t('Mode')} |\n`);
    markdown.appendMarkdown(`|---|------|--------|------|\n`);
    history.slice(0, 10).forEach(entry => {
      const icon = entry.result === 'success' ? '✅' : entry.result === 'error' ? '❌' : '⏹️';
      markdown.appendMarkdown(`| ${entry.runNumber} | ${entry.date} | ${icon} | ${entry.mode} |\n`);
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
  markdown.appendMarkdown(`**${vscode.l10n.t('Run')} #{entry.runNumber}**\n\n`);
  markdown.appendMarkdown(`| ${vscode.l10n.t('Field')} | ${vscode.l10n.t('Value')} |\n`);
  markdown.appendMarkdown(`|-------|-------|\n`);
  markdown.appendMarkdown(`| **${vscode.l10n.t('Date')}** | ${entry.date} |\n`);
  markdown.appendMarkdown(`| **${vscode.l10n.t('Result')}** | ${entry.result} |\n`);
  markdown.appendMarkdown(`| **${vscode.l10n.t('Mode')}** | ${entry.mode} |\n`);
  if (entry.tasksCompleted !== undefined) {
    markdown.appendMarkdown(`| **${vscode.l10n.t('Tasks Completed')}** | ${entry.tasksCompleted} |\n`);
  }
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
  private runHistory: RunHistoryEntry[] = [];
  private runCounter: number = 0;
  
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
  private completedStages: Map<string, { elapsed?: string; success: boolean }> = new Map();

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
      this.setupPipelineListeners();
    }
    
    // Initialize OutputChannel
    if (!this.outputChannel) {
      this.outputChannel = vscode.window.createOutputChannel('WF: Pipeline');
    }
    
    this.refresh();
  }

  /**
   * Setup listeners for pipeline service events
   */
  private setupPipelineListeners(): void {
    if (!this.pipelineService) return;

    this.pipelineService.onStateChange((state: PipelineState) => {
      this.currentState = state;
      
      // Track run completion for history
      if (state === PipelineState.Completed || state === PipelineState.Error) {
        this.runCounter++;
        this.runHistory.unshift({
          runNumber: this.runCounter,
          date: new Date().toLocaleString(),
          result: state === PipelineState.Completed ? 'success' : 'error',
          mode: 'single-cycle' // Default mode, could be tracked more precisely
        });
        
        // Keep only last 50 runs in history
        if (this.runHistory.length > 50) {
          this.runHistory = this.runHistory.slice(0, 50);
        }
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
      this.parseLogForState(log);
    });
  }

  /**
   * Parse log entries to update stage tracking
   */
  private parseLogForState(log: string): void {
    // Track GOTO transitions
    if (log.includes('[GOTO]')) {
      this.gotos++;
      const gotoMatch = log.match(/\[GOTO\]\s+([^\s(]+)(?:\s*\(elapsed:\s*([^)]+)\))?/);
      if (gotoMatch) {
        const stage = gotoMatch[1];
        const elapsed = gotoMatch[2];
        
        // Mark previous stage as completed if exists
        if (this.currentStage) {
          this.completedStages.set(this.currentStage, {
            elapsed: this.elapsed,
            success: true
          });
        }
        
        this.currentStage = stage;
        this.elapsed = elapsed;
        this.stagesStarted++;
      }
    }
    
    // Track INFO with agent/ticket/retry
    if (log.includes('[INFO]')) {
      const infoMatch = log.match(/\[INFO\](?:\s+agent:\s*([^,]+))?(?:\s*,?\s*ticket:\s*([A-Z]+-\d+))?(?:\s*,?\s*retry:\s*(\d+)\/(\d+))?/);
      if (infoMatch) {
        if (infoMatch[1]) this.currentAgent = infoMatch[1].trim();
        if (infoMatch[2]) this.currentTicket = infoMatch[2];
        if (infoMatch[3]) {
          this.currentAttempt = parseInt(infoMatch[3], 10);
          this.currentMaxAttempts = parseInt(infoMatch[4], 10);
          this.retries++;
        }
      }
      
      // Retry only
      const retryOnlyMatch = log.match(/\[INFO\]\s*retry:\s*(\d+)\/(\d+)/);
      if (retryOnlyMatch) {
        this.currentAttempt = parseInt(retryOnlyMatch[1], 10);
        this.currentMaxAttempts = parseInt(retryOnlyMatch[2], 10);
        this.retries++;
      }
    }
    
    // Track CTX for skill info
    if (log.includes('[CTX]')) {
      const ctxMatch = log.match(/\[CTX\]\s+([^:]+):\s*(.+)/);
      if (ctxMatch) {
        const key = ctxMatch[1].trim();
        const value = ctxMatch[2].trim();
        if (key.toLowerCase() === 'skill') {
          this.currentSkill = value;
        }
      }
    }
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
      // Statistics has no children in this implementation
      return Promise.resolve([]);
    }

    if (element.itemType === 'history') {
      // Show history items
      return Promise.resolve(
        this.runHistory.map(entry => new HistoryItemTreeItem(entry))
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
      'single-cycle', // Could be tracked more precisely
      this.elapsed,
      this.stagesStarted
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

    // 3. Completed stages
    for (const [stage, info] of this.completedStages.entries()) {
      items.push(new CompletedStageTreeItem(stage, info.elapsed, info.success));
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
   * Start pipeline execution with mode selection
   */
  async startPipeline(): Promise<void> {
    if (!this.pipelineService) {
      vscode.window.showErrorMessage(vscode.l10n.t('Pipeline service not available'));
      return;
    }

    // Show QuickPick for mode selection
    const mode = await vscode.window.showQuickPick(
      [
        { label: 'single-cycle', description: vscode.l10n.t('Run one cycle through all stages') },
        { label: 'continuous', description: vscode.l10n.t('Run continuously until stopped') },
        { label: 'n-tasks', description: vscode.l10n.t('Run for a specific number of tasks') }
      ],
      {
        placeHolder: vscode.l10n.t('Select pipeline mode'),
        title: vscode.l10n.t('Start Pipeline')
      }
    );

    if (!mode) {
      return; // User cancelled
    }

    let n: number | undefined;
    if (mode.label === 'n-tasks') {
      const input = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('Enter number of tasks'),
        placeHolder: vscode.l10n.t('e.g., 5'),
        title: vscode.l10n.t('Start Pipeline - N Tasks'),
        validateInput: (value) => {
          if (!value || !/^\d+$/.test(value)) {
            return vscode.l10n.t('Please enter a valid number');
          }
          const num = parseInt(value, 10);
          if (num <= 0) {
            return vscode.l10n.t('Number must be greater than 0');
          }
          return undefined;
        }
      });

      if (!input) {
        return; // User cancelled
      }

      n = parseInt(input, 10);
    }

    try {
      await this.pipelineService.start(mode.label as PipelineMode, n);

      // Show output channel
      if (this.outputChannel) {
        this.outputChannel.show(true);
      }

      vscode.window.showInformationMessage(vscode.l10n.t('Pipeline started in {0} mode', mode.label));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(vscode.l10n.t('Failed to start pipeline: {0}', message));
    }
  }

  /**
   * Stop pipeline execution
   */
  stopPipeline(): void {
    if (!this.pipelineService) {
      vscode.window.showErrorMessage(vscode.l10n.t('Pipeline service not available'));
      return;
    }

    this.pipelineService.stop();
    vscode.window.showInformationMessage(vscode.l10n.t('Pipeline stopped'));
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
   * Clear history
   */
  clearHistory(): void {
    this.runHistory = [];
    this.runCounter = 0;
    this.stagesStarted = 0;
    this.retries = 0;
    this.gotos = 0;
    this.completedStages.clear();
    this.refresh();
    vscode.window.showInformationMessage(vscode.l10n.t('Pipeline history cleared'));
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
