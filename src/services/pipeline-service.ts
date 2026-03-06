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
  private workflowRoot: string | undefined;

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
   */
  async start(): Promise<void> {
    if (this.currentState === PipelineState.Running) {
      throw new Error('Pipeline is already running');
    }

    this.setState(PipelineState.Running);
    this.retryCount = 0;
    this.currentStage = undefined;
    this.currentAgent = undefined;
    this.currentTicket = undefined;

    const args = ['run'];

    try {
      // Remove CLAUDECODE env var to allow nested claude CLI calls from pipeline
      const env = { ...process.env };
      delete env.CLAUDECODE;

      this.emit('log', `[PIPELINE] Starting: workflow run (shell: ${process.platform === 'win32'})\n`);

      const child = this.spawnFn('workflow', args, {
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
        this.emit('log', `[STDERR] ${output}`);
      });

      // Handle process exit
      child.on('close', (code: number | null) => {
        this.childProcess = null;
        this.emit('log', `[PIPELINE] Process exited with code: ${code}\n`);
        if (code === 0) {
          this.setState(PipelineState.Completed);
        } else {
          this.setState(PipelineState.Error);
        }
      });

      // Handle process errors (e.g. ENOENT)
      child.on('error', (err: NodeJS.ErrnoException) => {
        this.emit('log', `[PIPELINE] Spawn error: ${err.message} (code: ${err.code})\n`);
        this.childProcess = null;
        this.setState(PipelineState.Error);
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
   * 
   * Real CLI format:
   * [2024-01-01T12:00:00] [INFO] [stage-name] message
   * [2024-01-01T12:00:00] [INFO] [Runner] GOTO next-stage
   * [2024-01-01T12:00:00] [INFO] [Runner] START stage="X" agent="Y" skill="Z"
   * [2024-01-01T12:00:00] [WARN] [stage] RETRY stage="X" attempt=N/M
   */
  private parseLine(line: string): ParsedLogEntry {
    // Pattern: [timestamp] [LEVEL] [stage] message
    const basePattern = /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\]\s+\[(\w+)\]\s+\[([^\]]+)\]\s+(.*)$/;
    const baseMatch = line.match(basePattern);
    
    if (!baseMatch) {
      // Fallback to old format or raw
      return this.parseLineLegacy(line);
    }

    const [, timestamp, level, stage, message] = baseMatch;

    // Parse GOTO: [timestamp] [INFO] [stage] GOTO next-stage
    const gotoMatch = message.match(/^GOTO\s+([^\s(]+)(?:\s*\(elapsed:\s*([^)]+)\))?/);
    if (gotoMatch) {
      return {
        type: 'goto',
        raw: line,
        timestamp,
        stage: gotoMatch[1],
        elapsed: gotoMatch[2]
      };
    }

    // Parse START: [timestamp] [INFO] [stage] START stage="X" agent="Y" skill="Z"
    const startMatch = message.match(/^START(?:\s+stage="([^"]*)")?(?:\s+agent="([^"]*)")?(?:\s+skill="([^"]*)")?/);
    if (startMatch) {
      return {
        type: 'info',
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
      return {
        type: 'info',
        raw: line,
        timestamp,
        stage: retryMatch[1],
        retry: parseInt(retryMatch[2], 10),
        maxAttempts: parseInt(retryMatch[3], 10)
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
