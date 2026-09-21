/**
 * PipelineTreeDataProvider - Data provider for Pipeline Monitor in Sidebar
 *
 * Provides TreeDataProvider implementation for displaying pipeline execution state:
 * - getTreeItem, getChildren logic
 * - Data transformation from state to tree items
 *
 * This module follows SRP - only data provider logic.
 * Uses PipelineTreeItemBuilder for creating tree items.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { t } from '../i18n';
import { WorkflowStore } from '../data/workflow-store';
import { PipelineService, PipelineState } from '../services/pipeline-service';
import {
  PipelineTreeItem,
  PipelineRunTreeItem,
  CurrentStageTreeItem,
  CompletedStageTreeItem,
  StatisticsTreeItem,
  HistoryTreeItem,
  HistoryItemTreeItem,
  HistoryReportTreeItem
} from './pipeline-tree-item-builder';
import { RunHistoryEntry, ReportInfo } from './pipeline-types';
import { formatMsToElapsed } from '../services/pipeline-state-manager';

/**
 * Result of a completed pipeline stage
 */
export enum StageResult {
  Success = 'success',
  Error = 'error',
  Timeout = 'timeout',
  Skipped = 'skipped'
}

/**
 * Completed stage data for building tree items
 */
export interface CompletedStageData {
  stage: string;
  elapsed?: string;
  /** @deprecated Use `result` instead */
  success: boolean;
  result: StageResult;
  ticket?: string;
  agent?: string;
  fallbackAgent?: string;
  skill?: string;
  statusChange?: string;
  outputLines?: string[];
  reportInfo?: ReportInfo;
  logLineHint?: number;
}

/**
 * Current pipeline state for data provider
 */
export interface PipelineDataState {
  currentState: PipelineState;
  currentStage: string | undefined;
  currentAgent: string | undefined;
  currentFallbackAgent: string | undefined;
  currentSkill: string | undefined;
  currentTicket: string | undefined;
  currentAttempt: number | undefined;
  currentMaxAttempts: number | undefined;
  elapsed: string | undefined;
  stageElapsed: string | undefined;
  completedStages: CompletedStageData[];
  stagesStarted: number;
  retries: number;
  gotos: number;
  timeouts: number;
  totalElapsedMs: number;
  averageElapsedMs: number;
  runHistory: RunHistoryEntry[];
  currentRunLogFile?: string;
  currentManualGateTicket?: string;
  /**
   * Run started outside the extension, when one holds this project's slot.
   * Mutually exclusive with our own run: the runner allows one pipeline per
   * project root, so both are never set at once.
   */
  externalRun?: ExternalRunSummary;
}

/** What the tree needs to know about a run it does not own. */
export interface ExternalRunSummary {
  source: 'cli' | 'mcp';
  state: 'starting' | 'running' | 'paused' | 'stale';
  runId?: string;
  pid?: number;
  startedAt?: string;
  logPath?: string;
  /** A pause request is waiting for the current stage to finish. */
  pauseRequested?: boolean;
  /** Suspended by the MCP tool `pause_pipeline`. */
  suspendedByMcp?: boolean;
}

/** Localised name of an external run's state; the raw values are internal. */
function externalStateLabel(state: ExternalRunSummary['state']): string {
  switch (state) {
    case 'starting': return t('starting');
    case 'running': return t('running');
    case 'paused': return t('paused');
    case 'stale': return t('stale');
  }
}

/** Icon and label for the state of a run we do not own. */
const EXTERNAL_STATE_ICON: Record<ExternalRunSummary['state'], string> = {
  starting: 'loading~spin',
  running: 'loading~spin',
  paused: 'debug-pause',
  stale: 'warning'
};

/**
 * Builds the root node for a pipeline someone else started.
 *
 * Deliberately the same `pipeline-run` id as our own run node: the two are
 * alternatives for one slot, and reusing the id keeps the user's collapse
 * choice when a run changes hands.
 */
export function buildExternalRunItem(run: ExternalRunSummary): PipelineTreeItem {
  // Запрос паузы исполняется между стадиями: пока текущая стадия идёт,
  // пайплайн ещё работает, но пользователь должен видеть, что пауза принята.
  const stateLabel = run.pauseRequested && run.state === 'running'
    ? t('pausing after the current stage')
    : externalStateLabel(run.state);
  const item = new PipelineTreeItem(
    t('Pipeline: {0}', stateLabel),
    // Детей нет — как и у узла собственного запуска, см. PipelineRunTreeItem.
    vscode.TreeItemCollapsibleState.None,
    'pipeline-run',
    'pipeline-run'
  );

  item.description = run.runId ? `${run.source} · ${run.runId}` : run.source;
  item.iconPath = new vscode.ThemeIcon(
    EXTERNAL_STATE_ICON[run.state],
    run.state === 'stale' ? new vscode.ThemeColor('notificationsWarningIcon.foreground') : undefined
  );
  item.contextValue = 'pipeline-run-external';

  const lines = [
    `**${t('External pipeline')}**`,
    '',
    `- ${t('Started by')}: ${run.source}`,
    `- ${t('State')}: ${stateLabel}`
  ];
  if (run.pid) { lines.push(`- PID: ${run.pid}`); }
  if (run.startedAt) { lines.push(`- ${t('Started')}: ${run.startedAt}`); }
  if (run.suspendedByMcp) { lines.push(`- ${t('Suspended via MCP pause_pipeline')}`); }
  if (run.state === 'stale') {
    lines.push('', t('The process is gone but its lock file remains; the next run will clear it.'));
  }
  item.tooltip = new vscode.MarkdownString(lines.join('\n'));

  if (run.logPath) {
    item.command = {
      command: 'vscode.open',
      title: t('Open log'),
      arguments: [vscode.Uri.file(run.logPath)]
    };
  }

  return item;
}

/**
 * TreeDataProvider for pipeline view
 */
export class PipelineTreeDataProvider implements vscode.TreeDataProvider<PipelineTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<PipelineTreeItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<PipelineTreeItem | undefined> = this._onDidChangeTreeData.event;

  private workflowRoot: string | null = null;
  private runHistory: RunHistoryEntry[] = [];

  constructor(
    private readonly store: WorkflowStore,
    private pipelineService: PipelineService | null = null
  ) {
    // Subscribe to store change events for reactive updates
    store.onDidChange(() => {
      this.refresh();
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
   * Set pipeline service instance
   */
  setPipelineService(pipelineService: PipelineService): void {
    this.pipelineService = pipelineService;
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
      addStat(t('Timeouts'), stats.timeouts, 'watch', 'stat-timeouts');

      if (stats.totalElapsedMs > 0) {
        const addTimeStat = (label: string, value: string, icon: string, id: string) => {
          const item = new PipelineTreeItem(
            `${label}: ${value}`,
            vscode.TreeItemCollapsibleState.None,
            'statistics',
            id
          );
          item.iconPath = new vscode.ThemeIcon(icon);
          items.push(item);
        };
        addTimeStat(t('Total Time'), formatMsToElapsed(stats.totalElapsedMs), 'clock', 'stat-total-time');
        addTimeStat(t('Avg Time'), formatMsToElapsed(stats.averageElapsedMs), 'dashboard', 'stat-avg-time');
      }

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
   * Get root level items (called from getChildren)
   */
  private getRootItems(): Thenable<PipelineTreeItem[]> {
    const items: PipelineTreeItem[] = [];
    
    items.push(new PipelineRunTreeItem(PipelineState.Idle, undefined));
    items.push(new StatisticsTreeItem(0, 0, 0));
    items.push(new HistoryTreeItem(this.runHistory));

    return Promise.resolve(items);
  }

  /**
   * Get root level items from pipeline state
   */
  getRootItemsFromState(state: PipelineDataState, currentRunLogFile?: string): Thenable<PipelineTreeItem[]> {
    const items: PipelineTreeItem[] = [];

    // 1. Pipeline run status. An external run takes the same single slot — the
    //    runner does not allow a second pipeline in one project — so it is
    //    rendered as the same node with its origin spelled out. Its stages come
    //    from its own log (ExternalRunTracker), never from our past run.
    let stageActive: boolean;
    let logFile: string | undefined;
    if (state.externalRun) {
      items.push(buildExternalRunItem(state.externalRun));
      // У протухшего запуска процесса нет — «текущая» стадия не выполняется.
      stageActive = state.externalRun.state !== 'stale';
      logFile = state.externalRun.logPath;
    } else {
      items.push(new PipelineRunTreeItem(state.currentState, state.elapsed, state.currentManualGateTicket, this.workflowRoot || undefined));
      stageActive = state.currentState === PipelineState.Running || state.currentState === PipelineState.Paused;
      logFile = currentRunLogFile || this.scanForLogFile();
    }

    // 2. Current stage (if running or paused)
    if (stageActive && state.currentStage) {
      items.push(new CurrentStageTreeItem(
        state.currentStage,
        state.currentAgent,
        state.currentFallbackAgent,
        state.currentSkill,
        state.currentTicket,
        state.currentAttempt,
        state.currentMaxAttempts,
        state.stageElapsed
      ));
    }

    // 3. Completed stages (newest on top)
    for (let i = state.completedStages.length - 1; i >= 0; i--) {
      const info = state.completedStages[i];
      items.push(new CompletedStageTreeItem(
        info.stage,
        info.elapsed,
        info.success,
        info.ticket,
        info.agent,
        info.fallbackAgent,
        info.skill,
        info.statusChange,
        info.outputLines,
        info.reportInfo,
        info.logLineHint,
        logFile,
        info.result
      ));
    }

    // 4. Statistics
    items.push(new StatisticsTreeItem(
      state.stagesStarted,
      state.retries,
      state.gotos,
      state.timeouts,
      state.totalElapsedMs,
      state.averageElapsedMs
    ));

    // 5. History
    items.push(new HistoryTreeItem(state.runHistory));

    return Promise.resolve(items);
  }

  /**
   * Get children for element (delegated implementation)
   */
  getChildrenForElement(element: PipelineTreeItem | undefined, state: PipelineDataState): Thenable<PipelineTreeItem[]> {
    if (!this.workflowRoot) {
      return Promise.resolve([]);
    }

    if (!element) {
      return this.getRootItemsFromState(state, state.currentRunLogFile);
    }

    if (element.itemType === 'statistics') {
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

      addStat(t('Stages Started'), state.stagesStarted, 'play', 'stat-stages');
      addStat(t('Retries'), state.retries, 'refresh', 'stat-retries');
      addStat(t('Goto Transitions'), state.gotos, 'arrow-right', 'stat-gotos');
      addStat(t('Timeouts'), state.timeouts, 'watch', 'stat-timeouts');

      // Time stats (string-based items)
      if (state.totalElapsedMs > 0) {
        const addTimeStat = (label: string, value: string, icon: string, id: string) => {
          const item = new PipelineTreeItem(
            `${label}: ${value}`,
            vscode.TreeItemCollapsibleState.None,
            'statistics',
            id
          );
          item.iconPath = new vscode.ThemeIcon(icon);
          items.push(item);
        };
        addTimeStat(t('Total Time'), formatMsToElapsed(state.totalElapsedMs), 'clock', 'stat-total-time');
        addTimeStat(t('Avg Time'), formatMsToElapsed(state.averageElapsedMs), 'dashboard', 'stat-avg-time');
      }

      return Promise.resolve(items);
    }

    if (element.itemType === 'history') {
      return Promise.resolve(
        state.runHistory.map(entry => new HistoryItemTreeItem(entry))
      );
    }

    if (element.itemType === 'history-item') {
      const historyItem = element as HistoryItemTreeItem;
      const reports = historyItem.entry.reports || [];

      if (reports.length === 0) {
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
   * Scan logs directory for log file
   */
  scanForLogFile(sinceMs?: number): string | undefined {
    if (!this.workflowRoot) return undefined;
    const logsDir = path.join(this.workflowRoot, 'logs');
    try {
      if (!fs.existsSync(logsDir)) return undefined;
      // Prefer timestamped log files (pipeline_YYYY-MM-DD_HH-MM-SS.log)
      const allFiles = fs.readdirSync(logsDir).filter(f => f.endsWith('.log'));
      const timestamped = allFiles.filter(f => /^pipeline_\d{4}-\d{2}-\d{2}_/.test(f));
      const files = timestamped.length > 0 ? timestamped : allFiles;
      if (files.length === 0) return undefined;
      // Return the newest log file by modification time, optionally filtered by sinceMs
      let newest: string | undefined;
      let newestMtime = 0;
      for (const f of files) {
        const fullPath = path.join(logsDir, f);
        const mtime = fs.statSync(fullPath).mtimeMs;
        if (sinceMs && mtime < sinceMs) continue;
        if (mtime > newestMtime) {
          newest = f;
          newestMtime = mtime;
        }
      }
      return newest ? path.join(logsDir, newest) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Scan reports directory for new reports since start time
   */
  scanForNewReports(runStartTime: number): ReportInfo[] {
    if (!this.workflowRoot || runStartTime === 0) return [];
    const reportsDir = path.join(this.workflowRoot, 'reports');
    try {
      if (!fs.existsSync(reportsDir)) return [];
      return fs.readdirSync(reportsDir).filter(f => f.endsWith('.md')).map(f => {
        const filePath = path.join(reportsDir, f);
        return { id: f.replace('.md', ''), path: filePath };
      }).filter(r => fs.statSync(r.path).mtimeMs >= runStartTime);
    } catch {
      return [];
    }
  }

  /**
   * Get pipeline service instance
   */
  getPipelineService(): PipelineService | null {
    return this.pipelineService;
  }
}
