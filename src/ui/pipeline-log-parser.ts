/**
 * PipelineLogParser - Parser for pipeline execution logs
 *
 * Responsible for:
 * - Parsing CLI log output
 * - Extracting stage transitions, agent/ticket info
 * - Tracking pipeline execution state
 *
 * This module follows SRP - only log parsing logic.
 */

import { ReportInfo } from './pipeline-types';

/**
 * Parsed log data extracted from log lines
 */
export interface ParsedLogData {
  stage?: string;
  agent?: string;
  skill?: string;
  ticket?: string;
  attempt?: number;
  maxAttempts?: number;
  elapsed?: string;
  gotoStage?: string;
  gotoTarget?: string;
  statusTransition?: string;
  reportInfo?: ReportInfo;
  planId?: string;
  outputLine?: string;
  isRetry: boolean;
  isGoto: boolean;
  isStart: boolean;
  isMoveTicket: boolean;
  isCreateReport: boolean;
  isError: boolean;
  isTimeout: boolean;
  isComplete: boolean;
  timestamp?: string;
  errorMessage?: string;
  timeoutSeconds?: number;
  completeStatus?: string;
  exitCode?: number;
}

/**
 * PipelineLogParser - parses log lines and extracts state changes
 */
export class PipelineLogParser {
  private currentStage: string | undefined;
  private currentAgent: string | undefined;
  private currentSkill: string | undefined;
  private currentTicket: string | undefined;
  private currentAttempt: number | undefined;
  private currentMaxAttempts: number | undefined;
  private elapsed: string | undefined;
  private ticketStatusHistory: string[] = [];
  private currentOutputLines: string[] = [];
  private currentStageReport?: ReportInfo;
  private currentRunPlanId?: string;

  /**
   * Parse a log line and return extracted data
   */
  parse(line: string): ParsedLogData {
    const clean = line.replace(/\x1b\[[0-9;]*m/g, '');
    const basePattern = /^\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})\]\s+\[(\w+)\]\s+\[([^\]]+)\]\s+(.*)$/;
    const baseMatch = clean.match(basePattern);

    if (!baseMatch) return this.parseLegacy(line);

    const [, timestamp, , _stage, message] = baseMatch;
    const result: ParsedLogData = { isRetry: false, isGoto: false, isStart: false, isMoveTicket: false, isCreateReport: false, isError: false, isTimeout: false, isComplete: false };
    result.timestamp = timestamp;

    // ERROR stage="X" message="..."
    const errorMatch = message.match(/^ERROR\s+stage="([^"]+)"\s+message="([^"]*)"/);
    if (errorMatch) {
      result.isError = true;
      result.stage = errorMatch[1];
      result.errorMessage = errorMatch[2];
      return result;
    }

    // TIMEOUT stage="X" after Ns
    const timeoutMatch = message.match(/^TIMEOUT\s+stage="([^"]+)"\s+after\s+(\d+)s/);
    if (timeoutMatch) {
      result.isTimeout = true;
      result.stage = timeoutMatch[1];
      result.timeoutSeconds = parseInt(timeoutMatch[2], 10);
      return result;
    }

    // COMPLETE stage="X" status="Y" exitCode=N
    const completeMatch = message.match(/^COMPLETE\s+stage="([^"]+)"\s+status="([^"]*)"\s+exitCode=(\d+)/);
    if (completeMatch) {
      result.isComplete = true;
      result.stage = completeMatch[1];
      result.completeStatus = completeMatch[2];
      result.exitCode = parseInt(completeMatch[3], 10);
      return result;
    }

    // GOTO new format: GOTO old → new status="..." params={...}
    const gotoNewMatch = message.match(/^GOTO\s+\S+\s*→\s*(\S+)(?:\s+status="([^"]*)")?(?:\s+params=(\{.*\}))?/);
    if (gotoNewMatch) {
      result.isGoto = true;
      result.gotoStage = gotoNewMatch[1];
      // gotoNewMatch[2] is status (e.g. "default", "passed"), NOT elapsed
      result.gotoTarget = gotoNewMatch[2];
      if (gotoNewMatch[3]) {
        try {
          const params = JSON.parse(gotoNewMatch[3]);
          if (params.ticket_id && /^[A-Z]+-\d+$/.test(params.ticket_id)) result.ticket = params.ticket_id;
          if (params.target) result.gotoTarget = params.target;
        } catch { /* ignore */ }
      }
      result.statusTransition = this.ticketStatusHistory.length > 0 ? this.ticketStatusHistory.join(' → ') : result.gotoTarget ? `→ ${result.gotoTarget}` : undefined;
      return result;
    }

    // GOTO legacy format: GOTO stage (elapsed: 1.5s)
    const gotoLegacyMatch = message.match(/^GOTO\s+([^\s(]+)(?:\s*\(elapsed:\s*([^)]+)\))?/);
    if (gotoLegacyMatch) {
      result.isGoto = true;
      result.gotoStage = gotoLegacyMatch[1];
      result.elapsed = gotoLegacyMatch[2];
      result.statusTransition = this.ticketStatusHistory.length > 0 ? this.ticketStatusHistory.join(' → ') : undefined;
      return result;
    }

    // START
    const startMatch = message.match(/^START(?:\s+stage="([^"]*)")?(?:\s+agent="([^"]*)")?(?:\s+skill="([^"]*)")?/);
    if (startMatch && (startMatch[1] || startMatch[2] || startMatch[3])) {
      result.isStart = true;
      if (startMatch[1]) result.stage = startMatch[1];
      if (startMatch[2]) result.agent = startMatch[2];
      if (startMatch[3]) result.skill = startMatch[3];
      return result;
    }

    // RETRY
    const retryMatch = message.match(/^RETRY\s+stage="([^"]+)"\s+attempt=(\d+)\/(\d+)/);
    if (retryMatch) {
      result.isRetry = true;
      result.stage = retryMatch[1];
      result.attempt = parseInt(retryMatch[2], 10);
      result.maxAttempts = parseInt(retryMatch[3], 10);
      return result;
    }

    // MOVE_TICKET
    const moveTicketMatch = message.match(/^MOVE_TICKET\s+ticket="([^"]+)"\s+from="([^"]*)"\s+to="([^"]+)"/);
    if (moveTicketMatch) {
      result.isMoveTicket = true;
      result.ticket = moveTicketMatch[1];
      const fromStatus = moveTicketMatch[2];
      const toStatus = moveTicketMatch[3];
      if (fromStatus && toStatus) {
        result.statusTransition = `${fromStatus} → ${toStatus}`;
      }
      return result;
    }

    // CREATE_REPORT
    const createReportMatch = message.match(/^CREATE_REPORT\s+id="([^"]+)"\s+path="([^"]+)"/);
    if (createReportMatch) {
      result.isCreateReport = true;
      result.reportInfo = { id: createReportMatch[1], path: createReportMatch[2] };
      return result;
    }

    // Context ticket_id / plan_id
    const ticketMatch = message.match(/^\s*ticket_id:\s*([A-Z]+-\d+)/);
    if (ticketMatch) { result.ticket = ticketMatch[1]; return result; }

    const planMatch = message.match(/^\s*plan_id:\s*([A-Z]+-\d+)/);
    if (planMatch) { result.planId = planMatch[1]; return result; }

    // OUTPUT
    const outputMatch = message.match(/^OUTPUT:\s*(.*)$/);
    if (outputMatch) { result.outputLine = outputMatch[1]; return result; }

    // Generic info
    if (_stage !== 'Runner' && _stage !== 'Pipeline' && message.length > 0) {
      result.outputLine = message;
    }
    return result;
  }

  /**
   * Legacy parser for old format
   */
  private parseLegacy(line: string): ParsedLogData {
    const result: ParsedLogData = { isRetry: false, isGoto: false, isStart: false, isMoveTicket: false, isCreateReport: false, isError: false, isTimeout: false, isComplete: false };

    if (line.includes('[GOTO]')) {
      result.isGoto = true;
      const gotoMatch = line.match(/\[GOTO\]\s+([^\s(]+)(?:\s*\(elapsed:\s*([^)]+)\))?/);
      if (gotoMatch) {
        result.gotoStage = gotoMatch[1];
        result.elapsed = gotoMatch[2];
        result.statusTransition = this.ticketStatusHistory.length > 0 ? this.ticketStatusHistory.join(' → ') : undefined;
      }
    }

    if (line.includes('[INFO]')) {
      const infoMatch = line.match(/\[INFO\](?:\s+agent:\s*([^,]+))?(?:\s*,?\s*ticket:\s*([A-Z]+-\d+))?(?:\s*,?\s*retry:\s*(\d+)\/(\d+))?/);
      if (infoMatch) {
        if (infoMatch[1]) result.agent = infoMatch[1].trim();
        if (infoMatch[2]) result.ticket = infoMatch[2];
        if (infoMatch[3]) {
          result.isRetry = true;
          result.attempt = parseInt(infoMatch[3], 10);
          result.maxAttempts = parseInt(infoMatch[4], 10);
        }
      }
    }

    if (line.includes('[CTX]')) {
      const ctxMatch = line.match(/\[CTX\]\s+([^:]+):\s*(.+)/);
      if (ctxMatch && ctxMatch[1].trim().toLowerCase() === 'skill') {
        result.skill = ctxMatch[2].trim();
      }
    }

    const outputMatch = line.match(/OUTPUT:\s*(.*)$/);
    if (outputMatch) result.outputLine = outputMatch[1];

    const createReportMatch = line.match(/CREATE_REPORT\s+id="([^"]+)"(?:\s+path="([^"]+)")?/);
    if (createReportMatch) result.reportInfo = { id: createReportMatch[1], path: createReportMatch[2] || '' };

    return result;
  }

  /**
   * Update internal state from parsed data
   */
  updateState(data: ParsedLogData): void {
    if (data.isGoto) {
      if (data.gotoStage) this.currentStage = data.gotoStage;
      if (data.elapsed) this.elapsed = data.elapsed;
      if (data.ticket) this.currentTicket = data.ticket;
    }
    if (data.isStart) {
      if (data.stage) this.currentStage = data.stage;
      if (data.agent) this.currentAgent = data.agent;
      if (data.skill) this.currentSkill = data.skill;
    }
    if (data.isRetry) {
      if (data.stage) this.currentStage = data.stage;
      this.currentAttempt = data.attempt;
      this.currentMaxAttempts = data.maxAttempts;
    }
    if (data.isMoveTicket && data.ticket) {
      this.currentTicket = data.ticket;
      if (data.statusTransition && !this.ticketStatusHistory.includes(data.statusTransition)) {
        this.ticketStatusHistory.push(data.statusTransition);
      }
    }
    if (data.isCreateReport && data.reportInfo) {
      this.currentStageReport = data.reportInfo;
    }
    if (data.planId) this.currentRunPlanId = data.planId;
    if (data.outputLine) this.currentOutputLines.push(data.outputLine!);
  }

  /**
   * Get current stage
   */
  getCurrentStage(): string | undefined { return this.currentStage; }

  /**
   * Get current agent
   */
  getCurrentAgent(): string | undefined { return this.currentAgent; }

  /**
   * Get current skill
   */
  getCurrentSkill(): string | undefined { return this.currentSkill; }

  /**
   * Get current ticket
   */
  getCurrentTicket(): string | undefined { return this.currentTicket; }

  /**
   * Get current attempt
   */
  getCurrentAttempt(): number | undefined { return this.currentAttempt; }

  /**
   * Get max attempts
   */
  getCurrentMaxAttempts(): number | undefined { return this.currentMaxAttempts; }

  /**
   * Get elapsed time
   */
  getElapsed(): string | undefined { return this.elapsed; }

  /**
   * Get ticket status history
   */
  getTicketStatusHistory(): string[] { return [...this.ticketStatusHistory]; }

  /**
   * Get current output lines
   */
  getCurrentOutputLines(): string[] { return [...this.currentOutputLines]; }

  /**
   * Get current stage report
   */
  getCurrentStageReport(): ReportInfo | undefined { return this.currentStageReport; }

  /**
   * Get current run plan ID
   */
  getCurrentRunPlanId(): string | undefined { return this.currentRunPlanId; }

  /**
   * Reset parser state for new run
   */
  reset(): void {
    this.currentStage = undefined;
    this.currentAgent = undefined;
    this.currentSkill = undefined;
    this.currentTicket = undefined;
    this.currentAttempt = undefined;
    this.currentMaxAttempts = undefined;
    this.elapsed = undefined;
    this.ticketStatusHistory = [];
    this.currentOutputLines = [];
    this.currentStageReport = undefined;
    this.currentRunPlanId = undefined;
  }
}
