/**
 * Pipeline Types - Shared type definitions for pipeline components
 *
 * Contains interfaces used across multiple pipeline modules to avoid
 * circular dependencies.
 */

import { RunHistoryEntry } from '../services/pipeline-history-manager';

export { RunHistoryEntry };

/**
 * Report information from pipeline run
 */
export interface ReportInfo {
  id: string;
  path: string;
}
