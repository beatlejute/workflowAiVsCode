/**
 * PipelineTreeProvider - Orchestrator for Pipeline Monitor in Sidebar
 *
 * Orchestrates pipeline monitoring:
 * - Manages PipelineService lifecycle and event listeners
 * - Persists run history to workspaceState
 * - Delegates tree building to PipelineTreeDataProvider
 * - Delegates log parsing to PipelineLogParser
 * - Delegates history backfill to HistoryBackfillService
 *
 * ADR-005: Event-driven architecture for reactive UI updates
 * ADR-007: Pipeline monitoring via stdout parsing
 *
 * REFAC-021: Refactored from 1,468 LOC to < 200 LOC by extracting:
 * - PipelineTreeItemBuilder: TreeItem classes and tooltip builders
 * - PipelineTreeDataProvider: TreeDataProvider implementation
 * - PipelineLogParser: Log parsing logic
 * - HistoryBackfillService: History backfill logic
 */

import * as vscode from 'vscode';
import { WorkflowStore, StoreChangeEvent } from '../data/workflow-store';
import { PipelineService, PipelineState } from '../services/pipeline-service';

import { PipelineTreeItem, CurrentStageTreeItem, formatDuration } from './pipeline-tree-item-builder';
import { PipelineTreeDataProvider } from './pipeline-tree-data-provider';
import { PipelineLogParser } from './pipeline-log-parser';
import { HistoryBackfillService } from '../services/history-backfill-service';
import { PipelineStateManager } from '../services/pipeline-state-manager';
import { PipelineHistoryManager, RunHistoryEntry, PersistedHistoryItem } from '../services/pipeline-history-manager';
import { PipelineExecutionListener } from '../services/pipeline-execution-listener';
import { t } from '../i18n';

export { RunHistoryEntry, PersistedHistoryItem };
export {
  PipelineTreeItem,
  PipelineRunTreeItem,
  CurrentStageTreeItem,
  CompletedStageTreeItem,
  StatisticsTreeItem,
  HistoryTreeItem,
  HistoryItemTreeItem
} from './pipeline-tree-item-builder';

/**
 * PipelineTreeProvider - Orchestrator only (< 200 LOC)
 */
export class PipelineTreeProvider implements vscode.TreeDataProvider<PipelineTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<PipelineTreeItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<PipelineTreeItem | undefined> = this._onDidChangeTreeData.event;

  private workflowRoot: string | null = null;
  private pipelineService: PipelineService | null = null;
  private outputChannel: vscode.OutputChannel | null = null;
  private listenersSetup: boolean = false;
  private context: vscode.ExtensionContext | null = null;

  // Delegated services
  private dataProvider: PipelineTreeDataProvider;
  private logParser: PipelineLogParser;
  private backfillService: HistoryBackfillService;
  private stateManager: PipelineStateManager;
  private historyManager: PipelineHistoryManager;
  private executionListener: PipelineExecutionListener | null = null;

  // Minimal state tracking
  private currentState: PipelineState = PipelineState.Idle;
  private runStartTime: number = 0;
  private currentRunLogFile?: string;

  // Cached root items for targeted refresh (prevents tooltip flickering)
  private lastRootItems: PipelineTreeItem[] = [];
  private currentRunPlanId?: string;
  private durationRefreshTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly store: WorkflowStore,
    pipelineService?: PipelineService
  ) {
    this.pipelineService = pipelineService || null;
    this.logParser = new PipelineLogParser();
    this.backfillService = new HistoryBackfillService();
    this.stateManager = new PipelineStateManager();
    this.historyManager = new PipelineHistoryManager(this.backfillService);
    this.executionListener = new PipelineExecutionListener(
      this.logParser,
      this.stateManager,
      null, // outputChannel will be set later
      (result) => this.finalizeRun(result),
      () => this.refresh(),
      (state) => { this.currentState = state; this.handleStateChange(state); }
    );
    this.dataProvider = new PipelineTreeDataProvider(store, this.pipelineService);

    store.onDidChange((event: StoreChangeEvent) => {
      if (event.type === 'config') this.refresh();
    });
  }

  getCompletedStagesCount(): number {
    return this.stateManager.getCompletedStages().length;
  }

  setWorkflowRoot(root: string): void {
    this.workflowRoot = root;
    this.dataProvider.setWorkflowRoot(root);
    this.historyManager.setWorkflowRoot(root);
    if (!this.pipelineService) {
      this.pipelineService = new PipelineService();
      this.dataProvider.setPipelineService(this.pipelineService);
    }
    if (!this.outputChannel) {
      this.outputChannel = vscode.window.createOutputChannel('WF: Pipeline');
      // Recreate execution listener with output channel
      this.executionListener = new PipelineExecutionListener(
        this.logParser,
        this.stateManager,
        this.outputChannel,
        (result) => this.finalizeRun(result),
        () => this.refresh(),
        (state) => { this.currentState = state; this.handleStateChange(state); }
      );
    }
    if (this.pipelineService && this.executionListener) {
      this.executionListener.setup(this.pipelineService);
    }
    this.refresh();
  }

  setContext(context: vscode.ExtensionContext): void {
    this.context = context;
    this.historyManager.setContext(context);
  }

  async loadHistoryFromStorage(): Promise<void> {
    await this.historyManager.load();
    this.refresh();
  }

  async saveHistoryToStorage(): Promise<void> {
    await this.historyManager.save();
  }

  /**
   * Finalize pipeline run and save to history
   */
  private finalizeRun(result: 'success' | 'error' | 'stopped'): void {
    const reports = this.dataProvider.scanForNewReports(this.runStartTime);
    const logFile = this.currentRunLogFile || this.dataProvider.scanForLogFile();
    
    this.historyManager.addRun(result, reports, logFile, this.currentRunPlanId);
    
    this.currentRunLogFile = undefined;
    this.currentRunPlanId = undefined;
  }

  getPipelineService(): PipelineService | null {
    return this.pipelineService;
  }

  getOutputChannel(): vscode.OutputChannel | null {
    return this.outputChannel;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  private handleStateChange(state: PipelineState): void {
    if (state === PipelineState.Running) {
      this.startDurationRefresh();
    } else {
      this.stopDurationRefresh();
    }
  }

  private startDurationRefresh(): void {
    if (this.durationRefreshTimer) return;
    this.durationRefreshTimer = setInterval(() => {
      // Targeted refresh: only update pipeline-run and current-stage items
      // to avoid resetting tooltips on other elements
      if (this.lastRootItems.length > 0) {
        for (const item of this.lastRootItems) {
          if (item.itemType === 'pipeline-run' || item.itemType === 'current-stage') {
            this._onDidChangeTreeData.fire(item);
          }
        }
      } else {
        this._onDidChangeTreeData.fire(undefined);
      }
    }, 5000);
  }

  private stopDurationRefresh(): void {
    if (this.durationRefreshTimer) {
      clearInterval(this.durationRefreshTimer);
      this.durationRefreshTimer = undefined;
    }
  }

  getTreeItem(element: PipelineTreeItem): vscode.TreeItem {
    // For duration refresh: update description in-place for time-sensitive items
    // so we can use targeted fire(element) without recreating the tree
    if (element.itemType === 'pipeline-run' && this.currentState === PipelineState.Running) {
      const elapsed = this.stateManager.getElapsed();
      element.description = elapsed ? `Elapsed: ${elapsed}` : '';
    } else if (element.itemType === 'current-stage') {
      const stageItem = element as CurrentStageTreeItem;
      const durationMs = stageItem.stageStartTime ? Date.now() - stageItem.stageStartTime : undefined;
      const durationStr = durationMs ? formatDuration(durationMs) : '';
      const durationInfo = durationStr ? `⏱ ${durationStr}` : '';
      const agentInfo = stageItem.agent ? `${t('Agent')}: ${stageItem.agent}` : '';
      const ticketInfo = stageItem.ticket ? `${t('Ticket')}: ${stageItem.ticket}` : '';
      const attemptInfo = stageItem.attempt && stageItem.maxAttempts ? `${t('Attempt')}: ${stageItem.attempt}/${stageItem.maxAttempts}` : '';
      element.description = [durationInfo, agentInfo, ticketInfo, attemptInfo].filter(Boolean).join(' | ');
    }
    return element;
  }

  getChildren(element?: PipelineTreeItem): Thenable<PipelineTreeItem[]> {
    if (!this.workflowRoot) return Promise.resolve([]);

    const state = {
      currentState: this.currentState,
      currentStage: this.stateManager.getCurrentStage(),
      currentAgent: this.stateManager.getCurrentAgent(),
      currentFallbackAgent: undefined,
      currentSkill: this.stateManager.getCurrentSkill(),
      currentTicket: this.stateManager.getCurrentTicket(),
      currentAttempt: this.stateManager.getCurrentAttempt(),
      currentMaxAttempts: this.stateManager.getCurrentMaxAttempts(),
      currentStageStartTime: this.stateManager.getCurrentStageStartTime(),
      elapsed: this.stateManager.getElapsed(),
      completedStages: this.stateManager.getCompletedStages(),
      stagesStarted: this.stateManager.getStagesStarted(),
      retries: this.stateManager.getRetries(),
      gotos: this.stateManager.getGotos(),
      timeouts: this.stateManager.getTimeouts(),
      runHistory: this.historyManager.getHistory()
    };

    const result = this.dataProvider.getChildrenForElement(element, state);

    // Cache root items for targeted duration refresh
    if (!element) {
      result.then(items => { this.lastRootItems = items; });
    }

    return result;
  }

  async startPipeline(planId?: string): Promise<void> {
    if (!this.pipelineService) {
      vscode.window.showErrorMessage(t('Pipeline service not available'));
      return;
    }

    this.stateManager.reset();
    this.historyManager.clear();
    this.currentRunLogFile = undefined;
    this.currentRunPlanId = planId;
    this.runStartTime = Date.now();
    
    try {
      await this.pipelineService.start(planId);
      if (this.outputChannel) this.outputChannel.show(true);
      vscode.window.showInformationMessage(t('Pipeline started'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(t('Failed to start pipeline: {0}', message));
    }
  }

  stopPipeline(): void {
    if (!this.pipelineService) {
      vscode.window.showErrorMessage(t('Pipeline service not available'));
      return;
    }
    this.pipelineService.stop();
    vscode.window.showInformationMessage(t('Pipeline stopped'));
  }

  showOutput(): void {
    if (this.outputChannel) this.outputChannel.show();
  }

  clearHistory(): void {
    this.historyManager.clear();
    this.stateManager.reset();
    this.refresh();
    vscode.window.showInformationMessage(t('Pipeline history cleared'));
  }

  dispose(): void {
    this.stopDurationRefresh();
    if (this.pipelineService) this.pipelineService.dispose();
    if (this.outputChannel) this.outputChannel.dispose();
  }
}
