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

import { PipelineTreeItem } from './pipeline-tree-item-builder';
import { PipelineTreeDataProvider } from './pipeline-tree-data-provider';
import { PipelineLogParser } from './pipeline-log-parser';
import { HistoryBackfillService } from '../services/history-backfill-service';
import { PipelineStateManager } from '../services/pipeline-state-manager';
import { PipelineHistoryManager, RunHistoryEntry, PersistedHistoryItem } from '../services/pipeline-history-manager';
import { PipelineExecutionListener } from '../services/pipeline-execution-listener';
import { CollapseStateStore } from './tree-collapse-state';
import { ActiveRun } from '../services/pipeline-run-source';
import { ExternalRunTracker } from '../services/external-run-tracker';
import { ExternalPipelineControl, ControlOutcome } from '../services/external-pipeline-control';
import { t } from '../i18n';

export { RunHistoryEntry, PersistedHistoryItem };
export { StageResult } from './pipeline-tree-data-provider';
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

  /**
   * User's collapse/expand choices. The tree is rebuilt on every refresh —
   * once a second while a pipeline runs — so without this the builder's default
   * state would overwrite the user's click almost immediately.
   */
  readonly collapseState = new CollapseStateStore();

  /** Run started outside the extension, when one occupies this project's slot. */
  private externalRun: ActiveRun | undefined;

  /**
   * Reports a foreign run holding this project's slot, if any.
   *
   * Set by external pipeline detection. Without it a user starting a pipeline
   * while another one runs gets the runner's raw stderr and a generic Error;
   * with it we can say what is already running before spawning anything.
   */
  private blockingRunProbe: (() => ActiveRun | undefined) | undefined;

  /** Wire in the probe used to explain PIPELINE_ALREADY_RUNNING up front. */
  setBlockingRunProbe(probe: () => ActiveRun | undefined): void {
    this.blockingRunProbe = probe;
  }

  /** Stages of the external run, read from its log file. */
  private externalTracker: ExternalRunTracker | undefined;
  /** Which run the tracker follows: pid, start time and log path. */
  private externalTrackerKey: string | undefined;
  private externalTrackerTimer: ReturnType<typeof setInterval> | undefined;

  /** Stop/pause/resume for runs we did not start; set by external pipeline detection. */
  private externalControl: ExternalPipelineControl | undefined;
  /** Re-reads a folder's run right after a control action. */
  private refreshExternalRun: ((root: string) => void) | undefined;

  /** Wire in control of external runs. */
  setExternalRunControl(control: ExternalPipelineControl, refreshRun: (root: string) => void): void {
    this.externalControl = control;
    this.refreshExternalRun = refreshRun;
  }

  // Minimal state tracking
  private currentState: PipelineState = PipelineState.Idle;
  private runStartTime: number = 0;
  private currentRunLogFile?: string;
  private currentRunPlanId?: string;
  private stageElapsedTimer?: ReturnType<typeof setInterval>;

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
      (state) => {
        this.currentState = state;
        this.updateStageElapsedTimer(state);
      }
    );
    this.dataProvider = new PipelineTreeDataProvider(store, this.pipelineService);

    store.onDidChange((event: StoreChangeEvent) => {
      if (event.type === 'config') this.refresh();
    });
  }

  getCompletedStagesCount(): number {
    return this.stateManager.getCompletedStages().length;
  }

  /**
   * Publish the run occupying this project's slot when it is not ours.
   * Only one run per project exists at a time (runner singleton), so this
   * replaces rather than adds to what PipelineService reports.
   */
  setExternalRun(run: ActiveRun | undefined): void {
    const externalRun = run && run.source !== 'extension' ? run : undefined;
    // Сравниваем и logPath с approval: у одного и того же run они появляются
    // вторым событием при неизменном state, и без этого команда «открыть лог»
    // не возникла бы до следующего изменения.
    const changed = externalRun?.runId !== this.externalRun?.runId
      || externalRun?.state !== this.externalRun?.state
      || externalRun?.logPath !== this.externalRun?.logPath
      || externalRun?.awaitingApproval?.stepId !== this.externalRun?.awaitingApproval?.stepId
      || externalRun?.pauseRequested !== this.externalRun?.pauseRequested
      || externalRun?.suspendedByMcp !== this.externalRun?.suspendedByMcp;
    this.externalRun = externalRun;
    this.syncExternalTracker(externalRun);
    if (changed) {
      this.refresh();
    }
  }

  /**
   * Follows the external run's log while there is one.
   *
   * A new tracker per run: a run is identified by pid, start time and log, and
   * the stages of one must never leak into the next.
   */
  private syncExternalTracker(run: ActiveRun | undefined): void {
    const key = run?.logPath ? `${run.pid}|${run.startedAt}|${run.logPath}` : undefined;
    if (key === this.externalTrackerKey) { return; }

    this.stopExternalTracker();
    if (!run?.logPath || !key) { return; }

    const tracker = new ExternalRunTracker(run.logPath, run.startedAt);
    this.externalTracker = tracker;
    this.externalTrackerKey = key;

    const tick = () => {
      void tracker.poll().then(changed => {
        if (this.externalTracker !== tracker) { return; }
        // Пока запуск идёт, дерево обновляем каждую секунду — как у нашего
        // собственного: у текущей стадии тикает время.
        if (changed || this.externalRun?.state === 'running') {
          this.refresh();
        }
      });
    };
    tick();
    this.externalTrackerTimer = setInterval(tick, 1000);
  }

  private stopExternalTracker(): void {
    if (this.externalTrackerTimer) {
      clearInterval(this.externalTrackerTimer);
      this.externalTrackerTimer = undefined;
    }
    this.externalTracker?.dispose();
    this.externalTracker = undefined;
    this.externalTrackerKey = undefined;
  }

  /** The external run currently shown, if any. */
  getExternalRun(): ActiveRun | undefined {
    return this.externalRun;
  }

  /** Record a finished external run in the run history. */
  addExternalRunToHistory(
    result: 'success' | 'error' | 'stopped',
    source: 'cli' | 'mcp',
    runId?: string,
    logFile?: string
  ): void {
    this.historyManager.addExternalRun(result, source, runId, logFile);
    this.refresh();
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
        (state) => {
          this.currentState = state;
          this.updateStageElapsedTimer(state);
        }
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
    // Auto-detect log file for current run when pipeline is running
    if ((this.currentState === PipelineState.Running || this.currentState === PipelineState.Paused) && !this.currentRunLogFile) {
      this.currentRunLogFile = this.dataProvider.scanForLogFile(this.runStartTime);
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: PipelineTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: PipelineTreeItem): Thenable<PipelineTreeItem[]> {
    if (!this.workflowRoot) return Promise.resolve([]);

    const external = this.externalRun && this.externalRun.source !== 'extension'
      ? this.externalRun
      : undefined;
    // Стадии чужого запуска берутся из его лога. Наши прошлые стадии под ним
    // были бы враньём, поэтому без лога у внешнего запуска стадий нет вовсе.
    const stages = external ? this.externalTracker?.state : this.stateManager;

    const state = {
      currentState: this.currentState,
      currentStage: stages?.getCurrentStage(),
      currentAgent: stages?.getCurrentAgent(),
      currentFallbackAgent: stages?.getCurrentFallbackAgent(),
      currentSkill: stages?.getCurrentSkill(),
      currentTicket: stages?.getCurrentTicket(),
      currentAttempt: stages?.getCurrentAttempt(),
      currentMaxAttempts: stages?.getCurrentMaxAttempts(),
      elapsed: stages?.getRunElapsed(),
      stageElapsed: stages?.getStageElapsed(),
      completedStages: stages?.getCompletedStages() ?? [],
      stagesStarted: stages?.getStagesStarted() ?? 0,
      retries: stages?.getRetries() ?? 0,
      gotos: stages?.getGotos() ?? 0,
      timeouts: stages?.getTimeouts() ?? 0,
      totalElapsedMs: stages?.getTotalElapsedMs() ?? 0,
      averageElapsedMs: stages?.getAverageElapsedMs() ?? 0,
      runHistory: this.historyManager.getHistory(),
      currentRunLogFile: this.currentRunLogFile,
      currentManualGateTicket: this.pipelineService?.getCurrentManualGateTicket(),
      externalRun: external
        ? {
            source: external.source as 'cli' | 'mcp',
            state: external.state as 'starting' | 'running' | 'paused' | 'stale',
            runId: external.runId,
            pid: external.pid,
            startedAt: external.startedAt,
            logPath: external.logPath,
            pauseRequested: external.pauseRequested,
            suspendedByMcp: external.suspendedByMcp
          }
        : undefined
    };

    return this.dataProvider
      .getChildrenForElement(element, state)
      .then(items => this.collapseState.apply(items));
  }

  async startPipeline(planId?: string): Promise<void> {
    if (!this.pipelineService) {
      vscode.window.showErrorMessage(t('Pipeline service not available'));
      return;
    }

    // Раннер откажет вторым запуском в том же проекте (PIPELINE_ALREADY_RUNNING).
    // Лучше сказать это словами, чем показать stderr чужого процесса.
    const blocking = this.blockingRunProbe?.();
    if (blocking) {
      vscode.window.showErrorMessage(
        t('A pipeline is already running in this project ({0}, PID {1}, started {2})',
          blocking.source,
          String(blocking.pid ?? '?'),
          blocking.startedAt ?? '?')
      );
      return;
    }

    this.stateManager.reset();
    this.stateManager.setRunStartTime(Date.now());
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

  async stopPipeline(): Promise<void> {
    if (!this.pipelineService) {
      vscode.window.showErrorMessage(t('Pipeline service not available'));
      return;
    }
    // Слот проекта один: если наш запуск не идёт, кнопка относится к чужому.
    const ownState = this.pipelineService.getState();
    const ownActive = ownState === PipelineState.Running || ownState === PipelineState.Paused;
    const external = this.getExternalRun();
    if (!ownActive && external) {
      await this.stopExternalPipeline(external);
      return;
    }
    await this.pipelineService.stop();
    vscode.window.showInformationMessage(t('Pipeline stopped'));
  }

  /**
   * Stops a run someone else started. Asks first: unlike our own run, the user
   * may not know what this pipeline is doing, and the stop cuts its stage short.
   */
  private async stopExternalPipeline(run: ActiveRun): Promise<void> {
    if (!this.externalControl) {
      vscode.window.showErrorMessage(t('External pipeline control is not available'));
      return;
    }
    const stopLabel = t('Stop');
    const choice = await vscode.window.showWarningMessage(
      t('Stop the external pipeline ({0}, PID {1})? Its current stage will be interrupted.',
        run.source, String(run.pid ?? '?')),
      { modal: true },
      stopLabel
    );
    if (choice !== stopLabel) { return; }

    const outcome = await this.externalControl.stop(run.root, run);
    this.refreshExternalRun?.(run.root);
    if (outcome.ok) {
      vscode.window.showInformationMessage(t('External pipeline stopped'));
    } else {
      vscode.window.showErrorMessage(describeControlRefusal(outcome));
    }
  }

  /** Asks an external run to hold before its next stage. */
  async pauseExternalPipeline(): Promise<void> {
    const run = this.getExternalRun();
    if (!run || !this.externalControl) {
      vscode.window.showInformationMessage(t('No external pipeline is running'));
      return;
    }
    const outcome = this.externalControl.pause(run.root, run);
    this.refreshExternalRun?.(run.root);
    if (outcome.ok) {
      vscode.window.showInformationMessage(t('Pause requested: the pipeline will hold before its next stage'));
    } else {
      vscode.window.showErrorMessage(describeControlRefusal(outcome));
    }
  }

  /** Withdraws a pause request, or undoes an MCP suspension. */
  async resumeExternalPipeline(): Promise<void> {
    const run = this.getExternalRun();
    if (!run || !this.externalControl) {
      vscode.window.showInformationMessage(t('No external pipeline is running'));
      return;
    }
    const outcome = await this.externalControl.resume(run.root, run);
    this.refreshExternalRun?.(run.root);
    if (outcome.ok) {
      vscode.window.showInformationMessage(t('Pipeline resumed'));
    } else {
      vscode.window.showErrorMessage(describeControlRefusal(outcome));
    }
  }

  showOutput(): void {
    if (this.outputChannel) this.outputChannel.show();
  }

  clearHistory(): void {
    this.historyManager.clear();
    this.stateManager.reset();
    // History nodes are gone; their remembered collapse state would only leak.
    this.collapseState.clear();
    this.refresh();
    vscode.window.showInformationMessage(t('Pipeline history cleared'));
  }

  /**
   * Start/stop timer that refreshes tree every second while pipeline is running
   */
  private updateStageElapsedTimer(state: PipelineState): void {
    if (state === PipelineState.Running) {
      if (!this.stageElapsedTimer) {
        this.stageElapsedTimer = setInterval(() => this.refresh(), 1000);
      }
    } else {
      if (this.stageElapsedTimer) {
        clearInterval(this.stageElapsedTimer);
        this.stageElapsedTimer = undefined;
      }
    }
  }

  dispose(): void {
    if (this.stageElapsedTimer) {
      clearInterval(this.stageElapsedTimer);
      this.stageElapsedTimer = undefined;
    }
    this.stopExternalTracker();
    this.collapseState.clear();
    this._onDidChangeTreeData.dispose();
    if (this.pipelineService) this.pipelineService.dispose();
    if (this.outputChannel) this.outputChannel.dispose();
  }
}

/** User-facing text for a refused control action on an external run. */
export function describeControlRefusal(outcome: ControlOutcome): string {
  if (outcome.ok) { return ''; }
  const pid = String(outcome.pid ?? '?');
  switch (outcome.reason) {
    case 'run-changed':
      return t('The pipeline has already finished or another run took its place');
    case 'pid-reused':
      return t('PID {0} now belongs to another process: the pipeline lock is stale. Nothing was stopped.', pid);
    case 'still-alive':
      return t('The pipeline process (PID {0}) is still running after the stop attempt', pid);
    case 'pause-unsupported':
      return t('This workflow-ai runner cannot pause. Update workflow-ai.');
    case 'not-paused':
      return t('The pipeline is not paused');
    case 'resume-failed':
      return t('Failed to resume the pipeline: {0}', outcome.hint ?? '');
    case 'write-failed':
      return t('Failed to request a pause: {0}', outcome.hint ?? '');
  }
}
