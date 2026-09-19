/**
 * PipelineHistoryManager - Manages pipeline run history persistence
 *
 * Responsible for:
 * - Loading history from workspaceState
 * - Saving history to workspaceState
 * - Backfilling history with reports and log files
 *
 * This module follows SRP - only history persistence logic.
 */

import * as vscode from 'vscode';
import { ReportInfo } from '../ui/pipeline-types';
import { HistoryBackfillService } from './history-backfill-service';

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
  /** Who started the run. Absent on entries written before external runs were tracked. */
  source?: 'extension' | 'cli' | 'mcp';
  /** Runner's own id for the run (`pipeline_<date>_<time>`), when known. */
  runId?: string;
}

/**
 * Run history entry for display
 */
export interface RunHistoryEntry {
  runNumber: number;
  timestamp: number;
  date: string;
  result: 'success' | 'error' | 'stopped';
  reports: ReportInfo[];
  logFile?: string;
  planId?: string;
  /** Who started the run. Absent on entries written before external runs were tracked. */
  source?: 'extension' | 'cli' | 'mcp';
  /** Runner's own id for the run (`pipeline_<date>_<time>`), when known. */
  runId?: string;
}

/**
 * PipelineHistoryManager - manages history persistence
 */
export class PipelineHistoryManager {
  private runHistory: RunHistoryEntry[] = [];
  private runCounter: number = 0;

  constructor(
    private readonly backfillService: HistoryBackfillService,
    private context: vscode.ExtensionContext | null = null,
    private workflowRoot: string | null = null
  ) {}

  /**
   * Set extension context
   */
  setContext(context: vscode.ExtensionContext | null): void {
    this.context = context;
  }

  /**
   * Set workflow root
   */
  setWorkflowRoot(workflowRoot: string | null): void {
    this.workflowRoot = workflowRoot;
  }

  /**
   * Load history from workspaceState
   */
  async load(): Promise<void> {
    if (!this.context) return;
    try {
      const persisted = this.context.workspaceState.get<PersistedHistoryItem[]>('pipelineHistory');
      if (!persisted || !Array.isArray(persisted)) return;

      const entries = this.backfillService.toHistoryEntries(persisted);
      
      if (this.workflowRoot) {
        this.backfillService.backfillReports(this.workflowRoot, entries);
        this.backfillService.backfillLogFiles(this.workflowRoot, entries);
      }
      
      this.runHistory = entries.map(e => ({
        runNumber: e.runNumber,
        timestamp: e.timestamp,
        date: new Date(e.timestamp).toLocaleString(),
        result: e.result,
        reports: e.reports || [],
        logFile: e.logFile,
        planId: e.planId,
        source: e.source,
        runId: e.runId
      }));
      
      if (this.runHistory.length > 0) {
        this.runCounter = Math.max(...this.runHistory.map(h => h.runNumber));
      }
    } catch (error) {
      console.error('Failed to load pipeline history:', error);
    }
  }

  /**
   * Save history to workspaceState
   */
  async save(): Promise<void> {
    if (!this.context) return;
    try {
      const persisted = this.backfillService.toPersistedItems(this.runHistory.map(item => ({
        runNumber: item.runNumber,
        timestamp: item.timestamp,
        result: item.result,
        reports: item.reports || [],
        logFile: item.logFile,
        planId: item.planId,
        source: item.source,
        runId: item.runId
      })));

      const toSave = persisted.length > 50 ? persisted.slice(0, 50) : persisted;
      await this.context.workspaceState.update('pipelineHistory', toSave);
    } catch (error) {
      console.error('Failed to save pipeline history:', error);
    }
  }

  /**
   * Add run to history
   */
  addRun(result: 'success' | 'error' | 'stopped', reports: ReportInfo[], logFile?: string, planId?: string): void {
    this.addEntry(result, reports, logFile, planId, 'extension');
  }

  /**
   * Add a run that this extension did not start (terminal, MCP server).
   *
   * Uses the same counter as internal runs rather than a separate `ext-`
   * numbering: one counter cannot collide with itself, which is what the
   * separate numbering was meant to avoid in the first place. `source` and
   * `runId` are what tell the two apart.
   */
  addExternalRun(
    result: 'success' | 'error' | 'stopped',
    source: 'cli' | 'mcp',
    runId?: string,
    logFile?: string
  ): void {
    this.addEntry(result, [], logFile, undefined, source, runId);
  }

  private addEntry(
    result: 'success' | 'error' | 'stopped',
    reports: ReportInfo[],
    logFile?: string,
    planId?: string,
    source: 'extension' | 'cli' | 'mcp' = 'extension',
    runId?: string
  ): void {
    this.runCounter++;
    const timestamp = Date.now();
    this.runHistory.unshift({
      runNumber: this.runCounter,
      timestamp,
      date: new Date(timestamp).toLocaleString(),
      result,
      reports,
      logFile,
      planId,
      source,
      runId
    });

    if (this.runHistory.length > 50) {
      this.runHistory = this.runHistory.slice(0, 50);
    }

    this.save();
  }

  /**
   * Get current run counter value
   */
  getRunCounter(): number {
    return this.runCounter;
  }

  /**
   * Get history entries
   */
  getHistory(): RunHistoryEntry[] {
    return [...this.runHistory];
  }

  /**
   * Clear history
   */
  clear(): void {
    this.runHistory = [];
    this.runCounter = 0;
  }
}
