/**
 * PipelineService - Launch, stop, and monitor workflow run CLI
 *
 * Spawns `workflow run` via child_process.spawn, parses stdout for
 * stage transitions ([GOTO], [INFO], [CTX]), and emits state/log events.
 *
 * ADR-003: Child process spawning for CLI execution
 * ADR-005: Event-driven architecture for reactive UI updates
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

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
  type: 'goto' | 'info' | 'ctx' | 'raw';
  raw: string;
  stage?: string;
  agent?: string;
  ticket?: string;
  elapsed?: string;
  retry?: number;
  maxAttempts?: number;
  timestamp?: string;
}

/**
 * Pipeline execution mode
 */
export type PipelineMode = 'single-cycle' | 'continuous' | 'n-tasks';

/**
 * Event emitter type for state changes
 */
export type StateChangeListener = (state: PipelineState) => void;

/**
 * Event emitter type for log entries
 */
export type LogListener = (log: string) => void;

/**
 * Spawn function type for dependency injection (testing)
 */
export type SpawnFunction = (
  command: string,
  args: readonly string[],
  options?: any
) => ChildProcess;

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
  private spawnFn: SpawnFunction;

  /**
   * Create PipelineService
   * @param spawnFn - Optional spawn function for dependency injection (testing)
   */
  constructor(spawnFn?: SpawnFunction) {
    super();
    this.spawnFn = spawnFn || spawn;
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
   * @param mode - Execution mode: single-cycle, continuous, or n-tasks
   * @param n - Number of tasks (only for n-tasks mode)
   */
  async start(mode: PipelineMode, n?: number): Promise<void> {
    if (this.currentState === PipelineState.Running) {
      throw new Error('Pipeline is already running');
    }

    this.setState(PipelineState.Running);
    this.retryCount = 0;
    this.currentStage = undefined;
    this.currentAgent = undefined;
    this.currentTicket = undefined;

    const args = ['run'];
    if (mode === 'single-cycle') {
      args.push('--mode', 'single-cycle');
    } else if (mode === 'continuous') {
      args.push('--mode', 'continuous');
    } else if (mode === 'n-tasks' && n !== undefined) {
      args.push('--mode', 'n-tasks', '--count', n.toString());
    }

    try {
      const child = this.spawnFn('workflow', args, {
        stdio: ['ignore', 'pipe', 'pipe']
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
        if (code === 0) {
          this.setState(PipelineState.Completed);
        } else {
          this.setState(PipelineState.Error);
        }
      });

      // Handle process errors
      child.on('error', (err: Error) => {
        this.childProcess = null;
        this.setState(PipelineState.Error);
        this.emit('log', `[FATAL] ${err.message}`);
      });

    } catch (error) {
      this.setState(PipelineState.Error);
      throw error;
    }
  }

  /**
   * Stop pipeline execution (graceful shutdown via SIGTERM)
   */
  stop(): void {
    if (!this.childProcess) {
      return;
    }

    // Send SIGTERM for graceful shutdown
    this.childProcess.kill('SIGTERM');
    this.childProcess = null;
    this.setState(PipelineState.Idle);
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
      if (parsed.stage) {
        this.currentStage = parsed.stage;
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
   */
  private parseLine(line: string): ParsedLogEntry {
    // Try [GOTO] pattern: [GOTO] stage-name (elapsed: 1.2s)
    const gotoMatch = line.match(/\[GOTO\]\s+([^\s(]+)(?:\s*\(elapsed:\s*([^)]+)\))?/);
    if (gotoMatch) {
      return {
        type: 'goto',
        raw: line,
        stage: gotoMatch[1],
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
   * Dispose resources
   */
  dispose(): void {
    this.stop();
    this.removeAllListeners();
  }
}
