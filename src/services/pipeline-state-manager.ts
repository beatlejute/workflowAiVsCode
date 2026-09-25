/**
 * PipelineStateManager - Manages pipeline execution state
 *
 * Responsible for:
 * - Tracking current stage, agent, skill, ticket
 * - Processing stage transitions (GOTO events)
 * - Building completed stage entries
 * - Tracking statistics (stages started, retries, gotos)
 *
 * This module follows SRP - only state management logic.
 */

import { ReportInfo } from '../ui/pipeline-types';
import { CompletedStageData, StageResult } from '../ui/pipeline-tree-data-provider';
import { ParsedLogData } from '../ui/pipeline-log-parser';
import * as fs from 'fs';

/**
 * Pipeline execution state
 */
export interface PipelineExecutionState {
  currentStage?: string;
  currentAgent?: string;
  /** Agent with its actual model (`kilo-free(dots-3-note-preview)`), see ParsedLogData.agentLabel. */
  currentAgentLabel?: string;
  currentFallbackAgent?: string;
  currentSkill?: string;
  currentTicket?: string;
  currentAttempt?: number;
  currentMaxAttempts?: number;
  elapsed?: string;
  runStartTime?: number;
  stageStartTime?: number;
  logStageStartTime?: number;
  stagesStarted: number;
  retries: number;
  gotos: number;
  timeouts: number;
  completedStages: CompletedStageData[];
  stageOccurrences: Map<string, number>;
  currentOutputLines: string[];
  currentStageReport?: ReportInfo;
  ticketStatusHistory: string[];
  lastStageResult: StageResult;
}

/**
 * When a log event happened, in epoch ms.
 *
 * Receives the line's own timestamp. The default ignores it and answers
 * `Date.now()`: lines of our own run arrive from stdout as they are written, so
 * the moment of arrival is the moment of the event.
 */
export type EventClock = (logTimestamp?: string) => number;

/**
 * PipelineStateManager - manages execution state
 */
export class PipelineStateManager {
  constructor(private readonly clock: EventClock = () => Date.now()) {}

  private state: PipelineExecutionState = {
    currentStage: undefined,
    currentAgent: undefined,
    currentFallbackAgent: undefined,
    currentSkill: undefined,
    currentTicket: undefined,
    currentAttempt: undefined,
    currentMaxAttempts: undefined,
    elapsed: undefined,
    runStartTime: undefined,
    stageStartTime: undefined,
    logStageStartTime: undefined,
    stagesStarted: 0,
    retries: 0,
    gotos: 0,
    timeouts: 0,
    completedStages: [],
    stageOccurrences: new Map(),
    currentOutputLines: [],
    currentStageReport: undefined,
    ticketStatusHistory: [],
    lastStageResult: StageResult.Success
  };

  /**
   * Set run start time (called when pipeline starts)
   */
  setRunStartTime(time: number): void {
    this.state.runStartTime = time;
  }

  /**
   * Get formatted total run elapsed time
   */
  getRunElapsed(): string | undefined {
    if (!this.state.runStartTime) return undefined;
    return formatMsToElapsed(Date.now() - this.state.runStartTime);
  }

  /**
   * Process parsed log data and update state
   * @returns true if state changed significantly (requires UI refresh)
   */
  process(data: ParsedLogData): boolean {
    let changed = false;

    // Handle GOTO - stage transition
    if (data.isGoto) {
      this.handleGoto(data);
      changed = true;
    }

    // Handle START - stage start
    if (data.isStart) {
      if (data.stage) this.state.currentStage = data.stage;
      if (data.agent) {
        // Если это fallback-агент, сохраняем отдельно
        if (data.isFallback) {
          this.state.currentFallbackAgent = data.agent;
        } else {
          this.state.currentAgent = data.agent;
          // Модель прежнего агента к новому не относится.
          this.state.currentAgentLabel = undefined;
          // Не сбрасываем fallback если START пришёл с тем же агентом
          // (Agent rotation → START идут подряд, START не должен затирать fallback)
          if (this.state.currentFallbackAgent !== data.agent) {
            this.state.currentFallbackAgent = undefined;
          }
        }
      }
      if (data.skill) this.state.currentSkill = data.skill;
      this.state.stageStartTime = this.clock(data.timestamp);
      this.state.logStageStartTime = parseTimestamp(data.timestamp) || Date.now();
      changed = true;
    }

    // Handle AGENT_MODELS - the actual model of the running agent
    if (data.agentLabel) {
      this.state.currentAgentLabel = data.agentLabel;
      changed = true;
    }

    // Handle FALLBACK - preserve fallback agent even when not inside START
    // Парсер устанавливает isFallback=true для сообщений "switching to fallback: <agent>"
    // или "Agent rotation: attempt N → <agent>" без isStart
    if (data.isFallback && data.agent && !data.isStart) {
      this.state.currentFallbackAgent = data.agent;
      changed = true;
    }

    // Handle ERROR - mark current stage as errored
    if (data.isError) {
      this.state.lastStageResult = StageResult.Error;
      changed = true;
    }

    // Handle TIMEOUT - mark current stage as timed out
    if (data.isTimeout) {
      this.state.lastStageResult = StageResult.Timeout;
      this.state.timeouts++;
      changed = true;
    }

    // Handle COMPLETE - determine result from status/exitCode
    if (data.isComplete) {
      if (data.exitCode !== 0) {
        this.state.lastStageResult = StageResult.Error;
      }
      changed = true;
    }

    // Handle RETRY
    if (data.isRetry) {
      if (data.stage) this.state.currentStage = data.stage;
      this.state.currentAttempt = data.attempt;
      this.state.currentMaxAttempts = data.maxAttempts;
      this.state.retries++;
      changed = true;
    }

    // Handle MOVE_TICKET
    if (data.isMoveTicket) {
      if (data.ticket) this.state.currentTicket = data.ticket;
      if (data.statusTransition && !this.state.ticketStatusHistory.includes(data.statusTransition)) {
        this.state.ticketStatusHistory.push(data.statusTransition);
      }
      changed = true;
    }

    // Handle CREATE_REPORT
    if (data.isCreateReport && data.reportInfo) {
      this.state.currentStageReport = data.reportInfo;
      changed = true;
    }

    // Handle context (ticket_id, plan_id)
    if (data.ticket) this.state.currentTicket = data.ticket;
    if (data.planId) { /* planId is tracked elsewhere */ }

    // Handle output
    if (data.outputLine && this.state.currentOutputLines.length < 100) {
      this.state.currentOutputLines.push(data.outputLine);
      changed = true;
    }

    return changed;
  }

  /**
   * Handle GOTO stage transition
   */
  private handleGoto(data: ParsedLogData): void {
    const prevStage = this.state.currentStage;
    
    if (data.gotoStage) {
      this.state.currentStage = data.gotoStage;
    }
    // Compute elapsed from log timestamps (accurate for completed stages)
    const gotoLogTime = parseTimestamp(data.timestamp) || Date.now();
    if (data.elapsed) {
      this.state.elapsed = data.elapsed;
    } else if (this.state.stageStartTime) {
      // Используем stageStartTime как надёжный fallback — он обновляется только при START
      this.state.elapsed = formatMsToElapsed(this.clock(data.timestamp) - this.state.stageStartTime);
    } else if (this.state.logStageStartTime) {
      this.state.elapsed = formatMsToElapsed(gotoLogTime - this.state.logStageStartTime);
    } else {
      this.state.elapsed = undefined;
    }
    if (data.ticket) {
      this.state.currentTicket = data.ticket;
    }

    // Create completed stage entry for previous stage
    if (prevStage) {
      const statusChange = this.state.ticketStatusHistory.length > 0
        ? this.state.ticketStatusHistory.join(' → ')
        : (data.gotoTarget ? `→ ${data.gotoTarget}` : undefined);

      const occurrence = this.state.stageOccurrences.get(prevStage) ?? 0;

      const stageResult = this.state.lastStageResult;
      // Prefer reportInfo from current GOTO event (when GOTO carries report_id);
      // fallback to currentStageReport accumulated from previous CREATE_REPORT events.
      const eventReportInfo = data.isCreateReport ? data.reportInfo : undefined;
      this.state.completedStages.push({
        stage: prevStage,
        elapsed: this.state.elapsed,
        success: stageResult === StageResult.Success,
        result: stageResult,
        ticket: this.state.currentTicket,
        agent: this.state.currentAgentLabel ?? this.state.currentAgent,
        fallbackAgent: this.state.currentFallbackAgent,
        skill: this.state.currentSkill,
        statusChange,
        outputLines: [...this.state.currentOutputLines],
        reportInfo: eventReportInfo || this.state.currentStageReport,
        logLineHint: occurrence
      });

      this.state.stageOccurrences.set(prevStage, occurrence + 1);
    }

    // Reset for next stage
    this.state.ticketStatusHistory = [];
    this.state.currentOutputLines = [];
    this.state.currentFallbackAgent = undefined;
    this.state.currentAgentLabel = undefined;

    // Fallback report detection: if no reportInfo but stage is a report stage, try to find report
    if (!this.state.currentStageReport && prevStage) {
      const isReportStage = prevStage === 'create-report' || 
                           prevStage === 'analyze-report' || 
                           prevStage.endsWith('-report');
if (isReportStage && this.state.currentTicket) {
          const reportId = this.state.currentTicket.replace(/^[A-Z]+-(\d+)$/, 'REPORT-$1');
          const reportPath = `.workflow/reports/${reportId}.md`;
          if (fs.existsSync(reportPath)) {
            this.state.currentStageReport = { id: reportId, path: reportPath };
          }
        }
    }

    this.state.currentStageReport = undefined;
    // stageStartTime НЕ сбрасываем здесь — он сбрасывается только при START новой стадии
    // Это предотвращает видимый сброс таймера (3с→0с→1с) между GOTO и START
    this.state.logStageStartTime = gotoLogTime;
    this.state.stagesStarted++;
    this.state.gotos++;
    this.state.lastStageResult = StageResult.Success;
  }

  /**
   * Get current stage
   */
  getCurrentStage(): string | undefined {
    return this.state.currentStage;
  }

  /**
   * Get current agent — with its actual model once the runner reported it
   */
  getCurrentAgent(): string | undefined {
    return this.state.currentAgentLabel ?? this.state.currentAgent;
  }

  /**
   * Get current fallback agent
   */
  getCurrentFallbackAgent(): string | undefined {
    return this.state.currentFallbackAgent;
  }

  /**
   * Get current skill
   */
  getCurrentSkill(): string | undefined {
    return this.state.currentSkill;
  }

  /**
   * Get current ticket
   */
  getCurrentTicket(): string | undefined {
    return this.state.currentTicket;
  }

  /**
   * Get current attempt
   */
  getCurrentAttempt(): number | undefined {
    return this.state.currentAttempt;
  }

  /**
   * Get max attempts
   */
  getCurrentMaxAttempts(): number | undefined {
    return this.state.currentMaxAttempts;
  }

  /**
   * Get elapsed time
   */
  getElapsed(): string | undefined {
    return this.state.elapsed;
  }

  /**
   * Get current stage start time (timestamp)
   */
  getStageStartTime(): number | undefined {
    return this.state.stageStartTime;
  }

  /**
   * Get formatted elapsed time for current stage
   */
  getStageElapsed(): string | undefined {
    if (!this.state.stageStartTime) return undefined;
    const seconds = Math.floor((Date.now() - this.state.stageStartTime) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m${remainingSeconds.toString().padStart(2, '0')}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h${remainingMinutes.toString().padStart(2, '0')}m`;
  }

  /**
   * Get stages started count
   */
  getStagesStarted(): number {
    return this.state.stagesStarted;
  }

  /**
   * Get retries count
   */
  getRetries(): number {
    return this.state.retries;
  }

  /**
   * Get gotos count
   */
  getGotos(): number {
    return this.state.gotos;
  }

  /**
   * Get timeouts count
   */
  getTimeouts(): number {
    return this.state.timeouts;
  }

  /**
   * Get total elapsed time across all completed stages in milliseconds
   */
  getTotalElapsedMs(): number {
    return this.state.completedStages.reduce((sum, s) => {
      return sum + parseElapsedToMs(s.elapsed);
    }, 0);
  }

  /**
   * Get average elapsed time per completed stage in milliseconds
   */
  getAverageElapsedMs(): number {
    const stages = this.state.completedStages;
    if (stages.length === 0) return 0;
    return this.getTotalElapsedMs() / stages.length;
  }

  /**
   * Get completed stages
   */
  getCompletedStages(): CompletedStageData[] {
    return [...this.state.completedStages];
  }

  /**
   * Get current output lines
   */
  getCurrentOutputLines(): string[] {
    return [...this.state.currentOutputLines];
  }

  /**
   * Get current stage report
   */
  getCurrentStageReport(): ReportInfo | undefined {
    return this.state.currentStageReport;
  }

  /**
   * Reset state for new pipeline run
   */
  reset(): void {
    this.state = {
      currentStage: undefined,
      currentAgent: undefined,
      currentAgentLabel: undefined,
      currentFallbackAgent: undefined,
      currentSkill: undefined,
      currentTicket: undefined,
      currentAttempt: undefined,
      currentMaxAttempts: undefined,
      elapsed: undefined,
      runStartTime: undefined,
      stageStartTime: undefined,
      logStageStartTime: undefined,
      stagesStarted: 0,
      retries: 0,
      gotos: 0,
      timeouts: 0,
      completedStages: [],
      stageOccurrences: new Map(),
      currentOutputLines: [],
      currentStageReport: undefined,
      ticketStatusHistory: [],
      lastStageResult: StageResult.Success
    };
  }
}

/**
 * Parse elapsed string (e.g. "1.5s", "2m30s", "1h02m") to milliseconds
 */
export function parseElapsedToMs(elapsed?: string): number {
  if (!elapsed) return 0;
  let ms = 0;
  const hourMatch = elapsed.match(/(\d+)h/);
  const minMatch = elapsed.match(/(\d+)m/);
  const secMatch = elapsed.match(/([\d.]+)s/);
  if (hourMatch) ms += parseInt(hourMatch[1], 10) * 3600000;
  if (minMatch) ms += parseInt(minMatch[1], 10) * 60000;
  if (secMatch) ms += Math.round(parseFloat(secMatch[1]) * 1000);
  return ms;
}

/**
 * Format milliseconds to human-readable elapsed string
 */
export function formatMsToElapsed(ms: number): string {
  if (ms <= 0) return '0s';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m${remainingSeconds.toString().padStart(2, '0')}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h${remainingMinutes.toString().padStart(2, '0')}m`;
}

/**
 * Parse log timestamp (e.g. "2026-03-25T14:30:15" or "2026-03-25 14:30:15") to epoch ms (local time)
 */
export function parseTimestamp(timestamp?: string): number | undefined {
  if (!timestamp) return undefined;
  const match = timestamp.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return undefined;
  const [, y, mo, d, h, mi, s] = match;
  const ms = new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime();
  return isNaN(ms) ? undefined : ms;
}
