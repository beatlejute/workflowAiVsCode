/**
 * PipelineExecutionListener - Listens to pipeline execution events
 *
 * Responsible for:
 * - Setting up listeners on PipelineService
 * - Processing log events through PipelineLogParser and PipelineStateManager
 * - Triggering UI refresh on state changes
 *
 * This module follows SRP - only event listening logic.
 */

import * as vscode from 'vscode';
import { PipelineService, PipelineState } from './pipeline-service';
import { PipelineLogParser } from '../ui/pipeline-log-parser';
import { PipelineStateManager } from '../services/pipeline-state-manager';
import { setPulseTicketId } from '../ui/kanban-tree-provider';

/**
 * Callback for state changes
 */
export type StateChangeCallback = (result: 'success' | 'error' | 'stopped') => void;
export type PipelineStateCallback = (state: PipelineState) => void;

/**
 * PipelineExecutionListener - sets up and manages pipeline event listeners
 */
export class PipelineExecutionListener {
  private listenersSetup: boolean = false;
  private currentState: PipelineState = PipelineState.Idle;

  constructor(
    private readonly logParser: PipelineLogParser,
    private readonly stateManager: PipelineStateManager,
    private readonly outputChannel: vscode.OutputChannel | null,
    private readonly onStateChange: StateChangeCallback,
    private readonly onRefresh: () => void,
    private readonly onPipelineStateChange?: PipelineStateCallback
  ) {}

  /**
   * Set up listeners on pipeline service
   */
  setup(pipelineService: PipelineService): void {
    if (this.listenersSetup) return;
    this.listenersSetup = true;

    pipelineService.onStateChange((state: PipelineState) => {
      const previousState = this.currentState;
      this.currentState = state;
      this.onPipelineStateChange?.(state);

      if (state !== PipelineState.Running) {
        setPulseTicketId(undefined);
      }

      const isCompleted = state === PipelineState.Completed || state === PipelineState.Error;
      const isManuallyStopped = state === PipelineState.Idle && previousState === PipelineState.Running;

      if (isCompleted || isManuallyStopped) {
        const result = isManuallyStopped ? 'stopped' : state === PipelineState.Completed ? 'success' : 'error';
        this.onStateChange(result);
      }
      this.onRefresh();
    });

    pipelineService.onLog((log: string) => {
      const timestamp = new Date().toLocaleTimeString();
      if (this.outputChannel) {
        this.outputChannel.appendLine(`[${timestamp}] ${log}`);
      }

      const prevTicket = this.stateManager.getCurrentTicket();
      let changed = false;

      for (const line of log.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const data = this.logParser.parse(trimmed);
        if (this.stateManager.process(data)) {
          changed = true;
        }
      }

      const currentTicket = this.stateManager.getCurrentTicket();
      if (currentTicket !== prevTicket) {
        setPulseTicketId(currentTicket);
      }
      if (changed) {
        this.onRefresh();
      }
    });
  }

  /**
   * Get current pipeline state
   */
  getCurrentState(): PipelineState {
    return this.currentState;
  }
}
