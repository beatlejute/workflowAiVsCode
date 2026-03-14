/**
 * HistoryBackfillService - Backfill history with reports and log files
 *
 * Responsible for:
 * - Scanning reports directory for existing reports
 * - Scanning logs directory for existing log files
 * - Matching reports/logs to history entries by timestamp
 *
 * This module follows SRP - only backfill logic.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ReportInfo } from '../ui/pipeline-types';
import { PersistedHistoryItem } from './pipeline-history-manager';

/**
 * History entry with backfilled data
 */
export interface HistoryEntryWithBackfill {
  runNumber: number;
  timestamp: number;
  result: 'success' | 'error' | 'stopped';
  reports: ReportInfo[];
  logFile?: string;
  planId?: string;
}

/**
 * File info for matching
 */
interface FileInfo {
  id?: string;
  path: string;
  mtime: number;
}

/**
 * HistoryBackfillService - backfills history with existing reports and logs
 */
export class HistoryBackfillService {
  /**
   * Backfill history with reports from reports directory
   * @param workflowRoot - Root directory of workflow
   * @param history - History entries to backfill
   * @returns True if any entries were updated
   */
  backfillReports(workflowRoot: string, history: HistoryEntryWithBackfill[]): boolean {
    const reportsDir = path.join(workflowRoot, 'reports');
    try {
      if (!fs.existsSync(reportsDir)) return false;

      const reportFiles = this.scanDirectory(reportsDir, '.md');
      if (reportFiles.length === 0) return false;

      const pairs = this.sortByTimestamp(history);
      let updated = false;

      for (let i = 0; i < pairs.length; i++) {
        if (pairs[i].entry.reports?.length) continue;

        const prevTimestamp = i > 0 ? pairs[i - 1].timestamp : 0;
        const matched = reportFiles.filter(r => r.mtime <= pairs[i].timestamp && r.mtime > prevTimestamp);

        if (matched.length > 0) {
          pairs[i].entry.reports = matched.map(r => ({ id: r.id!, path: r.path }));
          updated = true;
        }
      }

      return updated;
    } catch (e) {
      console.error('[HistoryBackfill] Reports error:', e);
      return false;
    }
  }

  /**
   * Backfill history with log files from logs directory
   * @param workflowRoot - Root directory of workflow
   * @param history - History entries to backfill
   * @returns True if any entries were updated
   */
  backfillLogFiles(workflowRoot: string, history: HistoryEntryWithBackfill[]): boolean {
    const logsDir = path.join(workflowRoot, 'logs');
    try {
      if (!fs.existsSync(logsDir)) return false;

      const logFiles = this.scanDirectory(logsDir, '.log');
      if (logFiles.length === 0) return false;

      const pairs = this.sortByTimestamp(history);
      let updated = false;

      for (let i = 0; i < pairs.length; i++) {
        if (pairs[i].entry.logFile) continue;

        const prevTimestamp = i > 0 ? pairs[i - 1].timestamp : 0;
        const matched = logFiles.filter(r => r.mtime <= pairs[i].timestamp && r.mtime > prevTimestamp);

        if (matched.length > 0) {
          // Get most recent file from matched
          const mostRecent = matched.reduce((a, b) => a.mtime > b.mtime ? a : b);
          pairs[i].entry.logFile = mostRecent.path;
          updated = true;
        }
      }

      return updated;
    } catch (e) {
      console.error('[HistoryBackfill] Logs error:', e);
      return false;
    }
  }

  /**
   * Scan directory for files with specific extension
   */
  private scanDirectory(dir: string, extension: string): FileInfo[] {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith(extension))
      .map(f => {
        const filePath = path.join(dir, f);
        const stat = fs.statSync(filePath);
        return {
          id: f.replace(extension, ''),
          path: filePath,
          mtime: stat.mtimeMs
        };
      });
  }

  /**
   * Sort history entries by timestamp
   */
  private sortByTimestamp(history: HistoryEntryWithBackfill[]): Array<{ timestamp: number; entry: HistoryEntryWithBackfill }> {
    return history
      .map(item => ({ timestamp: item.timestamp, entry: item }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Convert persisted items to history entries with backfill
   */
  toHistoryEntries(persisted: PersistedHistoryItem[]): HistoryEntryWithBackfill[] {
    return persisted.map(item => ({
      runNumber: item.runNumber,
      timestamp: item.timestamp,
      result: item.result,
      reports: item.reports || [],
      logFile: item.logFile,
      planId: item.planId
    }));
  }

  /**
   * Convert history entries back to persisted format
   */
  toPersistedItems(entries: HistoryEntryWithBackfill[]): PersistedHistoryItem[] {
    return entries.map(item => ({
      runNumber: item.runNumber,
      timestamp: item.timestamp,
      result: item.result,
      reports: item.reports || [],
      logFile: item.logFile,
      planId: item.planId
    }));
  }
}
