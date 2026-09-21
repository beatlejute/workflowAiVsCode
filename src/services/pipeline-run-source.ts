/**
 * PipelineRunSource — one active pipeline per project.
 *
 * The runner enforces a singleton per project root: while a lock with a live
 * PID exists, a second `workflow run` for the same root is refused with
 * PIPELINE_ALREADY_RUNNING. The extension starts pipelines through the same
 * CLI, so "our run" and "someone else's run" are mutually exclusive states of
 * one slot, not two things to show side by side.
 *
 * This layer picks which of the two fills the slot, and — for a multi-root
 * workspace — how many projects have a pipeline going at all.
 */

import * as vscode from 'vscode';
import { PipelineService, PipelineState } from './pipeline-service';
import {
  ExternalPipelineMonitor,
  ExternalRun,
  ExternalRunState,
  PipelineSource
} from './external-pipeline-monitor';

/** The run occupying a project's single slot. */
export interface ActiveRun {
  /** Workspace folder this run belongs to. */
  root: string;
  source: PipelineSource;
  state: ExternalRunState | 'running' | 'paused';
  runId?: string;
  pid?: number;
  startedAt?: string;
  logPath?: string;
  awaitingApproval?: { stepId: string; since: string };
  /** See ExternalRun: runner honours pause requests. */
  supportsPause?: boolean;
  /** See ExternalRun: a pause request for this run exists. */
  pauseRequested?: boolean;
  /** See ExternalRun: suspended by the MCP tool `pause_pipeline`. */
  suspendedByMcp?: boolean;
}

export class PipelineRunSource implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  /** Fires whenever the set of active runs changes. */
  readonly onDidChange = this._onDidChange.event;

  private readonly monitors = new Map<string, ExternalPipelineMonitor>();
  private readonly externalRuns = new Map<string, ExternalRun>();
  private readonly subscriptions: vscode.Disposable[] = [];

  /** Kept so dispose can detach it — PipelineService is a Node EventEmitter. */
  private readonly onServiceStateChange = () => this._onDidChange.fire();

  constructor(
    private readonly pipelineService: PipelineService,
    /** Folder PipelineService itself works in; single-root by design. */
    private readonly primaryRoot: string | null
  ) {
    this.pipelineService.onStateChange(this.onServiceStateChange);
  }

  /** Registers a monitor for one workspace folder and starts it. */
  addMonitor(monitor: ExternalPipelineMonitor): void {
    this.monitors.set(monitor.root, monitor);
    this.subscriptions.push(
      monitor.onDidChangeRun(run => {
        if (run) {
          this.externalRuns.set(monitor.root, run);
        } else {
          this.externalRuns.delete(monitor.root);
        }
        this._onDidChange.fire();
      })
    );
    monitor.start();
  }

  /** Whether a folder is already being watched. */
  hasMonitor(root: string): boolean {
    return this.monitors.has(root);
  }

  /** Folders currently being watched. */
  getMonitoredRoots(): string[] {
    return [...this.monitors.keys()];
  }

  /** Re-reads a folder's run now, e.g. right after a control action on it. */
  refresh(root: string): void {
    this.monitors.get(root)?.refresh();
  }

  /** Stops and forgets the monitor for a folder that left the workspace. */
  removeMonitor(root: string): void {
    const monitor = this.monitors.get(root);
    if (!monitor) { return; }
    monitor.dispose();
    this.monitors.delete(root);
    if (this.externalRuns.delete(root)) {
      this._onDidChange.fire();
    }
  }

  /**
   * The run in the primary folder's slot: ours when PipelineService is busy,
   * otherwise whatever the monitor sees.
   */
  getActiveRun(): ActiveRun | undefined {
    const own = this.getOwnRun();
    if (own) { return own; }
    if (!this.primaryRoot) { return undefined; }
    const external = this.externalRuns.get(this.primaryRoot);
    return external ? toActiveRun(this.primaryRoot, external) : undefined;
  }

  /**
   * Every active run across the workspace, primary folder first.
   * More than one entry means more than one project — never two pipelines in
   * one project.
   */
  getActiveRuns(): ActiveRun[] {
    const runs: ActiveRun[] = [];
    const primary = this.getActiveRun();
    if (primary) { runs.push(primary); }

    for (const [root, run] of this.externalRuns) {
      if (root === this.primaryRoot) { continue; }
      runs.push(toActiveRun(root, run));
    }
    return runs;
  }

  /**
   * Number of projects with a pipeline actually going. Drives the status bar.
   *
   * A stale lock — file left behind by a process that is gone — is not a
   * running pipeline and must not inflate the count.
   */
  getActiveProjectCount(): number {
    return this.getActiveRuns().filter(run => run.state !== 'stale').length;
  }

  /**
   * True when the primary folder's slot is taken by someone else — used to
   * explain a PIPELINE_ALREADY_RUNNING refusal before the CLI even reports it.
   */
  getBlockingExternalRun(): ActiveRun | undefined {
    if (!this.primaryRoot || this.getOwnRun()) { return undefined; }
    const external = this.externalRuns.get(this.primaryRoot);
    return external && external.state !== 'stale'
      ? toActiveRun(this.primaryRoot, external)
      : undefined;
  }

  /** Our own run, when PipelineService is actually busy. */
  private getOwnRun(): ActiveRun | undefined {
    const state = this.pipelineService.getState();
    if (state !== PipelineState.Running && state !== PipelineState.Paused) {
      return undefined;
    }
    return {
      root: this.primaryRoot ?? '',
      source: 'extension',
      state: state === PipelineState.Paused ? 'paused' : 'running'
    };
  }

  dispose(): void {
    // PipelineService — Node EventEmitter, его onStateChange не возвращает
    // Disposable, так что снимаем слушателя вручную.
    this.pipelineService.removeListener('stateChange', this.onServiceStateChange);
    for (const sub of this.subscriptions) { sub.dispose(); }
    this.subscriptions.length = 0;
    for (const monitor of this.monitors.values()) { monitor.dispose(); }
    this.monitors.clear();
    this.externalRuns.clear();
    this._onDidChange.dispose();
  }
}

function toActiveRun(root: string, run: ExternalRun): ActiveRun {
  return {
    root,
    source: run.source,
    state: run.state,
    runId: run.runId,
    pid: run.pid,
    startedAt: run.startedAt,
    logPath: run.logPath,
    awaitingApproval: run.awaitingApproval,
    supportsPause: run.supportsPause,
    pauseRequested: run.pauseRequested,
    suspendedByMcp: run.suspendedByMcp
  };
}
