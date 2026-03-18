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
import { CompletedStageData } from '../ui/pipeline-tree-data-provider';
import { ParsedLogData } from '../ui/pipeline-log-parser';

/**
 * Pipeline execution state
 */
export interface PipelineExecutionState {
  currentStage?: string;
  currentAgent?: string;
  currentSkill?: string;
  currentTicket?: string;
  currentAttempt?: number;
  currentMaxAttempts?: number;
  elapsed?: string;
  currentStageStartTime?: number;
  currentStageTimedOut?: boolean;
  stagesStarted: number;
  retries: number;
  gotos: number;
  timeouts: number;
  completedStages: CompletedStageData[];
  stageOccurrences: Map<string, number>;
  currentOutputLines: string[];
  currentStageReport?: ReportInfo;
  ticketStatusHistory: string[];
}

/**
 * PipelineStateManager - manages execution state
 */
export class PipelineStateManager {
  private state: PipelineExecutionState = {
    currentStage: undefined,
    currentAgent: undefined,
    currentSkill: undefined,
    currentTicket: undefined,
    currentAttempt: undefined,
    currentMaxAttempts: undefined,
    elapsed: undefined,
    currentStageStartTime: undefined,
    currentStageTimedOut: undefined,
    stagesStarted: 0,
    retries: 0,
    gotos: 0,
    timeouts: 0,
    completedStages: [],
    stageOccurrences: new Map(),
    currentOutputLines: [],
    currentStageReport: undefined,
    ticketStatusHistory: []
  };

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
      if (data.agent) this.state.currentAgent = data.agent;
      if (data.skill) this.state.currentSkill = data.skill;
      this.state.currentStageStartTime = Date.now();
      this.state.currentStageTimedOut = false;
      changed = true;
    }

    // Handle TIMEOUT
    if (data.isTimeout) {
      this.state.currentStageTimedOut = true;
      this.state.timeouts++;
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
    if (data.elapsed) {
      this.state.elapsed = data.elapsed;
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

      // Calculate duration from stage start time
      const durationMs = this.state.currentStageStartTime
        ? Date.now() - this.state.currentStageStartTime
        : undefined;

      this.state.completedStages.push({
        stage: prevStage,
        elapsed: this.state.elapsed,
        durationMs,
        success: !this.state.currentStageTimedOut,
        timedOut: this.state.currentStageTimedOut || false,
        ticket: this.state.currentTicket,
        agent: this.state.currentAgent,
        skill: this.state.currentSkill,
        statusChange,
        outputLines: [...this.state.currentOutputLines],
        reportInfo: this.state.currentStageReport,
        logLineHint: occurrence
      });

      this.state.stageOccurrences.set(prevStage, occurrence + 1);
    }

    // Reset for next stage
    this.state.ticketStatusHistory = [];
    this.state.currentOutputLines = [];
    this.state.currentStageReport = undefined;
    this.state.currentStageStartTime = undefined;
    this.state.currentStageTimedOut = false;
    this.state.stagesStarted++;
    this.state.gotos++;
  }

  /**
   * Get current stage
   */
  getCurrentStage(): string | undefined {
    return this.state.currentStage;
  }

  /**
   * Get current agent
   */
  getCurrentAgent(): string | undefined {
    return this.state.currentAgent;
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
   * Get current stage start time
   */
  getCurrentStageStartTime(): number | undefined {
    return this.state.currentStageStartTime;
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
      currentSkill: undefined,
      currentTicket: undefined,
      currentAttempt: undefined,
      currentMaxAttempts: undefined,
      elapsed: undefined,
      currentStageStartTime: undefined,
      currentStageTimedOut: undefined,
      stagesStarted: 0,
      retries: 0,
      gotos: 0,
      timeouts: 0,
      completedStages: [],
      stageOccurrences: new Map(),
      currentOutputLines: [],
      currentStageReport: undefined,
      ticketStatusHistory: []
    };
  }
}
