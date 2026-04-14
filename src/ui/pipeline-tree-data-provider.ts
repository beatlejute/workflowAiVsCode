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

    // 1. Pipeline run status
    items.push(new PipelineRunTreeItem(state.currentState, state.elapsed));

    // 2. Current stage (if running)
    if (state.currentState === PipelineState.Running && state.currentStage) {
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
    const logFile = currentRunLogFile || this.scanForLogFile();
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
