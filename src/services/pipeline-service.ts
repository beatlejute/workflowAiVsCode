/**
 * PipelineService - Launch, stop, and monitor workflow run CLI
 *
 * Spawns `workflow run` via child_process.spawn, parses stdout for
 * stage transitions ([GOTO], [INFO], [CTX]), and emits state/log events.
 *
 * ADR-003: Child process spawning for CLI execution
 * ADR-005: Event-driven architecture for reactive UI updates
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import { EventEmitter } from 'events';
import * as vscode from 'vscode';
import { SpawnFunction } from '../types/process-types';

/**
 * Pipeline execution state
 */
export enum PipelineState {
  Idle = 'idle',
  Running = 'running',
  Error = 'error',
  Completed = 'completed'
}

/**
 * Parsed log entry from stdout
 */
export interface ParsedLogEntry {
  type: 'goto' | 'start' | 'info' | 'ctx' | 'raw';
  raw: string;
  stage?: string;
  fromStage?: string; // For GOTO: the completed stage (new format with arrow)
  agent?: string;
  ticket?: string;
  elapsed?: string;
  retry?: number;
  maxAttempts?: number;
  timestamp?: string;
  skill?: string;
}


/**
 * Event emitter type for state changes
 */
export type StateChangeListener = (state: PipelineState) => void;

/**
 * Event emitter type for log entries
 */
export type LogListener = (log: string) => void;

/**
 * Event emitter type for stage changes (GOTO)
 */
export type StageChangeListener = (stage: string | undefined) => void;


/**
 * PipelineService - Manages workflow run execution
 *
 * Provides start/stop control, state tracking, and stdout parsing.
 */
export class PipelineService extends EventEmitter {
  private currentState: PipelineState = PipelineState.Idle;
  private childProcess: ChildProcess | null = null;
  private currentStage: string | undefined;
  private currentAgent: string | undefined;
  private currentTicket: string | undefined;
  private retryCount: number = 0;
  private stopping = false;
  private hasStageErrors = false;
  private stageWithRetryError: string | undefined; // Track which stage had error+retry
  private spawnFn: SpawnFunction;
  private workflowRoot: string | undefined;
  private progress?: vscode.Progress<{ message?: string; increment?: number }>;
  private progressCancellationToken?: vscode.CancellationTokenSource;
  private startTime?: number;
  private totalStages: number = 0;
  private completedStages: number = 0;
  private fallbackUsed = false;

  private readonly _onStageChange = new vscode.EventEmitter<string | undefined>();
  readonly onStageChange = this._onStageChange.event;

  /**
   * Create PipelineService
   * @param spawnFn - Optional spawn function for dependency injection (testing)
   */
  constructor(spawnFn?: SpawnFunction) {
    super();
    this.spawnFn = spawnFn || spawn;
  }

  /**
   * Set the project root directory (used as cwd for spawned processes)
   */
  setWorkflowRoot(root: string): void {
    this.workflowRoot = root;
  }

  /**
   * Get current pipeline state
   */
  getState(): PipelineState {
    return this.currentState;
  }

  /**
   * Get current stage being executed
   */
  getCurrentStage(): string | undefined {
    return this.currentStage;
  }

  /**
   * Get current agent
   */
  getCurrentAgent(): string | undefined {
    return this.currentAgent;
  }

  /**
   * Get current ticket ID
   */
  getCurrentTicket(): string | undefined {
    return this.currentTicket;
  }

  /**
   * Get retry count
   */
  getRetryCount(): number {
    return this.retryCount;
  }

  /**
   * Register state change listener
   */
  onStateChange(listener: StateChangeListener): this {
    this.on('stateChange', listener);
    return this;
  }

  /**
   * Register log listener
   */
  onLog(listener: LogListener): this {
    this.on('log', listener);
    return this;
  }

  /**
   * Start pipeline execution
   * @param planId - Optional plan ID to run pipeline for a specific plan
   */
  async start(planId?: string): Promise<void> {
    if (this.currentState === PipelineState.Running) {
      throw new Error('Pipeline is already running');
    }

    // Reset state before transitioning to Running to avoid showing stale stage
    this.stopping = false;
    this.retryCount = 0;
    this.fallbackUsed = false;
    this.hasStageErrors = false;
    this.stageWithRetryError = undefined;
    this.currentStage = undefined;
    this._onStageChange.fire(undefined);
    this.currentAgent = undefined;
    this.currentTicket = undefined;

    this.setState(PipelineState.Running);

    const args = ['run'];
    if (planId) {
      args.push('--plan', planId);
    }

    try {
      // Remove CLAUDECODE env var to allow nested claude CLI calls from pipeline
      const env = { ...process.env };
      delete env.CLAUDECODE;

      // Create progress bar with cancellation support
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Pipeline',
          cancellable: true
        },
        async (progress, token) => {
          this.progress = progress;
          this.startTime = Date.now();
          this.completedStages = 0;

          // Handle cancellation
          token.onCancellationRequested(() => {
            this.emit('log', '[PIPELINE] Cancellation requested\n');
            this.stop().catch(() => { /* stop errors are non-critical */ });
          });

          this.progressCancellationToken = new vscode.CancellationTokenSource();
          token.onCancellationRequested(() => {
            this.progressCancellationToken?.cancel();
          });

          // Initial progress report
          this.reportProgress('Starting pipeline...', 0);

          this.spawnWithFallback('workflow', args, env);
        }
      );

    } catch (error) {
      this.setState(PipelineState.Error);
      throw error;
    }
  }

  /**
   * Spawn process with fallback to workflow-ai on ENOENT
   */
  private spawnWithFallback(command: string, args: readonly string[], env: NodeJS.ProcessEnv): void {
    const child = this.spawnFn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
      cwd: this.workflowRoot,
      shell: process.platform === 'win32'
    });

    this.childProcess = child;

    // Handle stdout
    child.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      this.emit('log', output);
      this.parseStdout(output);
    });

    // Handle stderr
    child.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      this.emit('log', `[ERROR] ${output}`);
    });

    // Handle process exit
    child.on('close', (code: number | null) => {
      this.childProcess = null;
      this.emit('log', `[PIPELINE] Process exited with code: ${code}\n`);

      // Complete progress
      if (this.progressCancellationToken) {
        this.progressCancellationToken.dispose();
        this.progressCancellationToken = undefined;
      }

      // If stop() was called, state is already Idle — don't override
      if (this.stopping) {
        this.stopping = false;
        return;
      }

      // Check for stage errors even if exit code is 0
      // CLI may exit with 0 even when a stage fails (e.g., exit 1 in script)
      if (code === 0 && this.hasStageErrors) {
        this.reportProgress('Pipeline failed', 100);
        this.setState(PipelineState.Error);
      } else if (code === 0) {
        this.reportProgress('Pipeline completed', 100);
        this.setState(PipelineState.Completed);
      } else {
        this.reportProgress('Pipeline failed', 100);
        this.setState(PipelineState.Error);
      }
    });

    // Handle process errors (e.g. ENOENT)
    child.on('error', (err: NodeJS.ErrnoException) => {
      this.emit('log', `[PIPELINE] Spawn error: ${err.message} (code: ${err.code})\n`);
      this.childProcess = null;

      if (this.progressCancellationToken) {
        this.progressCancellationToken.dispose();
        this.progressCancellationToken = undefined;
      }

      // Fallback to workflow-ai on ENOENT from primary command
      if (err.code === 'ENOENT' && command === 'workflow' && !this.fallbackUsed) {
        this.fallbackUsed = true;
        this.emit('log', '[PIPELINE] workflow not found, trying workflow-ai...\n');
        this.spawnWithFallback('workflow-ai', args, env);
      } else {
        this.setState(PipelineState.Error);
      }
    });
  }

  /**
   * Stop pipeline execution (graceful shutdown → force kill)
   *
   * Windows two-level kill:
   *   1. taskkill /T /F (kill process tree)
   *   2. Wait 1s, check if process is still alive
   *   3. If alive — PowerShell Stop-Process -Force as fallback
   */
  async stop(): Promise<void> {
    if (!this.childProcess) {
      return;
    }

    this.stopping = true;
    const pid = this.childProcess.pid;

    if (process.platform === 'win32' && pid) {
      // Level 1: kill the entire process tree (shell: true spawns cmd.exe)
      try {
        execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
      } catch {
        // Process may have already exited
      }

      // Level 2: wait and verify, then force kill if still alive
      await this.forceKillIfAlive(pid);
    } else {
      this.childProcess.kill('SIGTERM');
    }

    this.childProcess = null;
    this.setState(PipelineState.Idle);
  }

  /**
   * Check if process is still alive and force kill if needed (Windows fallback)
   */
  private async forceKillIfAlive(pid: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      process.kill(pid, 0);
      // Process is still alive — use PowerShell force kill
      try {
        execSync(
          `powershell -Command "Stop-Process -Id ${pid} -Force"`,
          { stdio: 'ignore' }
        );
      } catch {
        // PowerShell may also fail if process died between checks
      }
    } catch {
      // Process is already dead — nothing to do
    }
  }

  /**
   * Parse stdout for stage transitions and metadata
   */
  private parseStdout(output: string): void {
    const lines = output.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      const parsed = this.parseLine(trimmedLine);

      // Update state based on parsed data
      // Only update currentStage from START and GOTO messages,
      // not from generic log lines where stage is just the logger name (e.g. "Runner")
      if (parsed.stage && (parsed.type === 'goto' || parsed.type === 'start')) {
        this.currentStage = parsed.stage;
        this._onStageChange.fire(this.currentStage);
      }
      if (parsed.type === 'goto') {
        // completedStages++ counts the completed fromStage, not the current toStage
        const completedStage = parsed.fromStage || parsed.stage;
        if (completedStage) {
          this.completedStages++;
          this.updateStageProgress(completedStage, parsed.elapsed);
        }
      }
      if (parsed.agent) {
        this.currentAgent = parsed.agent;
      }
      if (parsed.ticket) {
        this.currentTicket = parsed.ticket;
      }
      if (parsed.retry !== undefined) {
        this.retryCount = parsed.retry;
      }
    }
  }

  /**
   * Parse a single line of stdout
   * 
   * Real CLI format:
   * [2024-01-01T12:00:00] [INFO] [stage-name] message
   * [2024-01-01T12:00:00] [INFO] [Runner] GOTO next-stage
   * [2024-01-01T12:00:00] [INFO] [Runner] START stage="X" agent="Y" skill="Z"
   * [2024-01-01T12:00:00] [WARN] [stage] RETRY stage="X" attempt=N/M
   */
  private parseLine(line: string): ParsedLogEntry {
    // Strip ANSI escape codes (CLI outputs colored text)
    const clean = line.replace(/\x1b\[[0-9;]*m/g, '');

    // Pattern: [timestamp] [LEVEL] [stage] message (date separator: T or space)
    const basePattern = /^\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})\]\s+\[(\w+)\]\s+\[([^\]]+)\]\s+(.*)$/;
    const baseMatch = clean.match(basePattern);
    
    if (!baseMatch) {
      // Fallback to old format or raw
      return this.parseLineLegacy(line);
    }

    const [, timestamp, level, stage, message] = baseMatch;

    // Parse GOTO: [timestamp] [INFO] [stage] GOTO next-stage
    // New format: GOTO fromStage → toStage status="success"
    // Old format: GOTO next-stage (elapsed: 1.2s)
    const gotoMatch = message.match(/^GOTO\s+(\S+)\s*→\s*(\S+)(?:\s+status="([^"]*)")?(?:\s*\(elapsed:\s*([^)]+)\))?/);
    if (gotoMatch) {
      const fromStage = gotoMatch[1];
      const toStage = gotoMatch[2];
      const status = gotoMatch[3]; // "success" or undefined

      // Retry edge case: if a stage had error+retry and now completes successfully, clear hasStageErrors
      // Status "success" on GOTO means the fromStage completed successfully
      if (status === 'success' && this.stageWithRetryError === fromStage) {
        this.hasStageErrors = false;
        this.stageWithRetryError = undefined;
      }

      return {
        type: 'goto',
        raw: line,
        timestamp,
        stage: toStage, // toStage is the current active stage
        fromStage: fromStage, // fromStage is the completed stage
        elapsed: gotoMatch[4]
      };
    }

    // Legacy format without arrow: GOTO next-stage (elapsed: 1.2s)
    const legacyGotoMatch = message.match(/^GOTO\s+(\S+)(?:\s*\(elapsed:\s*([^)]+)\))?/);
    if (legacyGotoMatch) {
      return {
        type: 'goto',
        raw: line,
        timestamp,
        stage: legacyGotoMatch[1],
        elapsed: legacyGotoMatch[2]
      };
    }

    // Parse START: [timestamp] [INFO] [stage] START stage="X" agent="Y" skill="Z"
    const startMatch = message.match(/^START(?:\s+stage="([^"]*)")?(?:\s+agent="([^"]*)")?(?:\s+skill="([^"]*)")?/);
    if (startMatch) {
      return {
        type: 'start',
        raw: line,
        timestamp,
        stage: startMatch[1],
        agent: startMatch[2],
        skill: startMatch[3]
      };
    }

    // Parse RETRY: [timestamp] [WARN] [stage] RETRY stage="X" attempt=N/M
    const retryMatch = message.match(/^RETRY\s+stage="([^"]+)"\s+attempt=(\d+)\/(\d+)/);
    if (retryMatch) {
      // Mark this stage as having a retry scenario - error will be cleared if stage succeeds
      this.stageWithRetryError = retryMatch[1];
      return {
        type: 'info',
        raw: line,
        timestamp,
        stage: retryMatch[1],
        retry: parseInt(retryMatch[2], 10),
        maxAttempts: parseInt(retryMatch[3], 10)
      };
    }

    // Parse fallback switch: [timestamp] [WARN] [stage] Primary agent failed, switching to fallback: <agentId>
    const fallbackMatch = message.match(/switching to fallback:\s*(\S+)/);
    if (fallbackMatch) {
      return {
        type: 'info',
        raw: line,
        timestamp,
        stage,
        agent: fallbackMatch[1]
      };
    }

    // Generic info message
    if (level === 'INFO') {
      return {
        type: 'info',
        raw: line,
        timestamp,
        stage
      };
    }

    // Detect stage errors: look for FAIL/ERROR patterns in the message
    if (/(FAIL|ERROR|failed|failure)/i.test(message)) {
      this.hasStageErrors = true;
    }

    // Warn/Error level
    return {
      type: level.toLowerCase() as 'info' | 'raw',
      raw: line,
      timestamp,
      stage
    };
  }

  /**
   * Legacy parser for old format (fallback)
   */
  private parseLineLegacy(line: string): ParsedLogEntry {
    // Try [GOTO] pattern: [GOTO] stage-name (elapsed: 1.2s)
    const gotoMatch = line.match(/\[GOTO\]\s+([^\s(]+)(?:\s*\(elapsed:\s*([^)]+)\))?/);
    if (gotoMatch) {
      const stage = gotoMatch[1];
      // Legacy format doesn't have status, so we can't clear hasStageErrors here
      // It will be cleared on next successful pipeline completion without errors
      return {
        type: 'goto',
        raw: line,
        stage,
        elapsed: gotoMatch[2]
      };
    }

    // Try [INFO] pattern: [INFO] agent: agent-name, ticket: TICKET-ID, retry: N/M
    // Each field is optional and can appear in any order
    const infoMatch = line.match(/\[INFO\](?:\s+agent:\s*([^,]+))?(?:\s*,?\s*ticket:\s*([A-Z]+-\d+))?(?:\s*,?\s*retry:\s*(\d+)\/(\d+))?/);
    if (infoMatch) {
      return {
        type: 'info',
        raw: line,
        agent: infoMatch[1]?.trim(),
        ticket: infoMatch[2],
        retry: infoMatch[3] ? parseInt(infoMatch[3], 10) : undefined,
        maxAttempts: infoMatch[4] ? parseInt(infoMatch[4], 10) : undefined
      };
    }

    // Try [INFO] with retry only: [INFO] retry: N/M
    const retryOnlyMatch = line.match(/\[INFO\]\s*retry:\s*(\d+)\/(\d+)/);
    if (retryOnlyMatch) {
      // Mark this stage as having a retry scenario - we don't know the stage name in legacy format
      this.stageWithRetryError = 'unknown';
      return {
        type: 'info',
        raw: line,
        retry: parseInt(retryOnlyMatch[1], 10),
        maxAttempts: parseInt(retryOnlyMatch[2], 10)
      };
    }

    // Try [CTX] pattern: [CTX] key: value
    const ctxMatch = line.match(/\[CTX\]\s+([^:]+):\s*(.+)/);
    if (ctxMatch) {
      return {
        type: 'ctx',
        raw: line,
        stage: ctxMatch[1].trim(),
        elapsed: ctxMatch[2].trim()
      };
    }

    // Detect stage errors in legacy format
    if (/(FAIL|ERROR|failed|failure)/i.test(line)) {
      this.hasStageErrors = true;
    }

    // Defensive parsing: fallback to raw log for unknown format
    return {
      type: 'raw',
      raw: line
    };
  }

  /**
   * Update state and emit event
   */
  private setState(newState: PipelineState): void {
    if (this.currentState !== newState) {
      this.currentState = newState;
      this.emit('stateChange', newState);
    }
  }

  /**
   * Report progress to the progress bar
   */
  private reportProgress(message: string, increment?: number): void {
    if (this.progress && !this.progressCancellationToken?.token.isCancellationRequested) {
      this.progress.report({ message, increment });
    }
  }

  /**
   * Update progress when transitioning to a new stage
   */
  private updateStageProgress(stageName: string, elapsed?: string): void {
    const elapsedText = elapsed ? ` • ${elapsed}` : '';
    const timeText = this.startTime ? ` • ${(Date.now() - this.startTime) / 1000}s` : '';
    const message = `Stage: ${stageName}${elapsedText}${timeText}`;
    
    // Increment progress (each stage adds ~10%)
    this.reportProgress(message, 10);
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.stop().catch(() => { /* stop errors are non-critical */ });
    this.removeAllListeners();
    this._onStageChange.dispose();
    if (this.progressCancellationToken) {
      this.progressCancellationToken.dispose();
      this.progressCancellationToken = undefined;
    }
  }
}
