/**
 * ExternalPipelineControl — stop, pause and resume a pipeline this extension
 * did not start.
 *
 * Our own run is a child process, and PipelineService kills it directly. A run
 * started by the MCP server or from a terminal is known only through its lock,
 * so every action here begins by re-reading the lock and checking that it
 * still describes the run the user clicked on — a click can land a moment
 * after that run ended and another one took the slot.
 *
 * Pause is cooperative: the request file is honoured by the runner between
 * stages (`workflowAi/src/runner.mjs`, `waitWhilePauseRequested`), so the
 * current stage and its agent finish first. The MCP tool `pause_pipeline`
 * suspends the process instead; resume undoes that too, the same way the MCP
 * tool does, so a run paused there can be resumed from here.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import {
  PipelineLock,
  readPipelineLock,
  isProcessAlive,
  lockSupportsPause,
  readPauseRequest,
  readPausedState,
  PAUSE_REQUEST_RELATIVE,
  MCP_PAUSE_STATE_RELATIVE
} from './external-pipeline-monitor';

/** Identifies the run being acted on; fields as in ActiveRun. */
export interface ControlTarget {
  pid?: number;
  startedAt?: string;
}

export type ControlRefusal =
  /** The lock no longer describes this run: it ended or another run took the slot. */
  | 'run-changed'
  /** The PID now belongs to a process started after the lock was written. */
  | 'pid-reused'
  /** The process survived the stop attempt. */
  | 'still-alive'
  /** The runner does not read pause requests (lock has no `pause-request` capability). */
  | 'pause-unsupported'
  /** There is nothing to resume. */
  | 'not-paused'
  /** Undoing an MCP suspension failed. */
  | 'resume-failed'
  /** The pause request could not be written. */
  | 'write-failed';

export type ControlOutcome =
  | { ok: true; alreadyGone?: boolean }
  | { ok: false; reason: ControlRefusal; pid?: number; hint?: string };

export interface CommandResult {
  ok: boolean;
  hint?: string;
}

/** What the controller needs from the OS — replaceable in tests. */
export interface ControlDeps {
  platform: NodeJS.Platform;
  isAlive(pid: number): boolean;
  /** Start time of a live process, or null when the OS cannot tell. */
  processStartedAt(pid: number): Promise<Date | null>;
  runCommand(command: string, args: string[]): Promise<CommandResult>;
  signal(pid: number, signal: NodeJS.Signals): void;
  sleep(ms: number): Promise<void>;
  now(): number;
}

/** How long a stopped runner gets to exit before we escalate or give up. */
const STOP_GRACE_MS = 10_000;

/** Poll interval while waiting for a stopped process to disappear. */
const EXIT_POLL_MS = 200;

/**
 * Slack for comparing a process start time with the lock's `started_at`:
 * `ps` reports whole seconds. Any wider and a reused PID slips through.
 */
const START_TOLERANCE_MS = 5000;

function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise(resolve => {
    // windowsHide: у хоста расширения может не быть консоли, и без флага
    // taskkill/pssuspend открыли бы своё окно терминала.
    execFile(command, args, { windowsHide: true, timeout: 15_000 }, (error, _stdout, stderr) => {
      if (!error) {
        resolve({ ok: true });
        return;
      }
      resolve({ ok: false, hint: String(stderr || error.message).trim() });
    });
  });
}

function processStartedAt(pid: number): Promise<Date | null> {
  return new Promise(resolve => {
    const done = (error: Error | null, stdout: string) => {
      if (error) { resolve(null); return; }
      const parsed = new Date(stdout.trim());
      resolve(Number.isNaN(parsed.getTime()) ? null : parsed);
    };
    if (process.platform === 'win32') {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command',
          `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`],
        { windowsHide: true, timeout: 5000 },
        (error, stdout) => done(error, String(stdout))
      );
    } else {
      // `ps -o lstart=` отдаёт локальное время вида «Mon Sep 21 18:04:11 2026».
      execFile('ps', ['-o', 'lstart=', '-p', String(pid)], { timeout: 5000 },
        (error, stdout) => done(error, String(stdout)));
    }
  });
}

export const defaultControlDeps: ControlDeps = {
  platform: process.platform,
  isAlive: isProcessAlive,
  processStartedAt,
  runCommand,
  signal: (pid, signal) => { process.kill(pid, signal); },
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  now: () => Date.now()
};

function removeFileIf(file: string, predicate: (data: { pid?: unknown; started_at?: unknown }) => boolean): void {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (predicate(data)) { fs.unlinkSync(file); }
  } catch {
    // Файла нет или он нечитаем — трогать нечего.
  }
}

export class ExternalPipelineControl {
  /** Runs stopped from here, so their history entry reads `stopped`, not `error`. */
  private readonly stopped = new Set<string>();

  constructor(private readonly deps: ControlDeps = defaultControlDeps) {}

  /** Whether this run was stopped by the user through the extension. */
  wasStoppedByUser(target: ControlTarget): boolean {
    return this.stopped.has(`${target.pid}|${target.startedAt}`);
  }

  /** Drops what is known about a finished run, once its history is written. */
  forget(target: ControlTarget): void {
    this.stopped.delete(`${target.pid}|${target.startedAt}`);
  }

  /**
   * Stops the run and its whole process tree.
   *
   * Windows: `taskkill /T /F`, the same as our own run's stop. POSIX: SIGTERM
   * to the process group first — a runner started by MCP leads its own group,
   * so the agent goes with it — and SIGKILL if it is still there after the
   * grace period.
   */
  async stop(root: string, target: ControlTarget): Promise<ControlOutcome> {
    const lock = this.sameRunLock(root, target);
    if (!lock) { return { ok: false, reason: 'run-changed' }; }
    const key = `${lock.pid}|${lock.started_at}`;

    if (!this.deps.isAlive(lock.pid)) {
      // Процесс умер сам, до нажатия: остановкой пользователя это не было, и
      // в истории он останется протухшим (`error`). Убираем только файлы.
      this.cleanUpAfter(root, lock);
      return { ok: true, alreadyGone: true };
    }

    if (!(await this.couldBeRunner(lock))) {
      return { ok: false, reason: 'pid-reused', pid: lock.pid };
    }

    this.stopped.add(key);
    if (this.deps.platform === 'win32') {
      await this.deps.runCommand('taskkill', ['/T', '/F', '/PID', String(lock.pid)]);
    } else {
      this.sendToGroup(lock.pid, 'SIGTERM');
    }

    let dead = await this.waitForExit(lock.pid, STOP_GRACE_MS);
    if (!dead && this.deps.platform !== 'win32') {
      this.sendToGroup(lock.pid, 'SIGKILL');
      dead = await this.waitForExit(lock.pid, 2000);
    }
    if (!dead) {
      this.stopped.delete(key);
      return { ok: false, reason: 'still-alive', pid: lock.pid };
    }

    this.cleanUpAfter(root, lock);
    return { ok: true };
  }

  /** Asks the runner to hold before its next stage. */
  pause(root: string, target: ControlTarget): ControlOutcome {
    const lock = this.sameRunLock(root, target);
    if (!lock || !this.deps.isAlive(lock.pid)) { return { ok: false, reason: 'run-changed' }; }
    if (!lockSupportsPause(lock)) { return { ok: false, reason: 'pause-unsupported', pid: lock.pid }; }

    const file = path.join(root, PAUSE_REQUEST_RELATIVE);
    const payload = JSON.stringify({
      pid: lock.pid,
      requested_at: new Date().toISOString(),
      requested_by: 'extension'
    }, null, 2);
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      // Через временный файл: раннер не должен застать запрос недописанным.
      const temp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(temp, payload, 'utf-8');
      fs.renameSync(temp, file);
    } catch (err) {
      return { ok: false, reason: 'write-failed', pid: lock.pid, hint: (err as Error).message };
    }
    return { ok: true };
  }

  /**
   * Withdraws a pause request, and undoes an MCP suspension if there is one.
   */
  async resume(root: string, target: ControlTarget): Promise<ControlOutcome> {
    const lock = this.sameRunLock(root, target);
    if (!lock) { return { ok: false, reason: 'run-changed' }; }

    let resumed = false;
    if (readPauseRequest(root, lock.pid, lock.started_at)) {
      removeFileIf(path.join(root, PAUSE_REQUEST_RELATIVE), data => data.pid === lock.pid);
      resumed = true;
    }

    if (readPausedState(root, lock.pid)) {
      // Приостановка через MCP `pause_pipeline` — снимаем тем же способом, что
      // и MCP `resume_pipeline`: pssuspend -r на Windows, SIGCONT на POSIX.
      let result: CommandResult;
      if (this.deps.platform === 'win32') {
        result = await this.deps.runCommand('pssuspend.exe', ['-r', String(lock.pid)]);
      } else {
        try {
          this.deps.signal(lock.pid, 'SIGCONT');
          result = { ok: true };
        } catch (err) {
          result = { ok: false, hint: (err as Error).message };
        }
      }
      if (!result.ok) {
        return { ok: false, reason: 'resume-failed', pid: lock.pid, hint: result.hint };
      }
      removeFileIf(path.join(root, MCP_PAUSE_STATE_RELATIVE), data => data.pid === lock.pid);
      resumed = true;
    }

    return resumed ? { ok: true } : { ok: false, reason: 'not-paused', pid: lock.pid };
  }

  /** The lock, if it still belongs to the run the action was aimed at. */
  private sameRunLock(root: string, target: ControlTarget): PipelineLock | null {
    const lock = readPipelineLock(root);
    if (!lock || lock.pid !== target.pid || lock.started_at !== target.startedAt) {
      return null;
    }
    return lock;
  }

  /**
   * Whether the live process with the lock's PID can be the runner that wrote
   * it. A runner killed without releasing its lock leaves a PID the OS may hand
   * to anything — and `taskkill /T /F` would take that process's whole tree.
   * When the OS cannot say, we allow the action (same trade-off as workflow-mcp).
   */
  private async couldBeRunner(lock: PipelineLock): Promise<boolean> {
    const lockTime = Date.parse(lock.started_at);
    if (Number.isNaN(lockTime)) { return true; }
    const started = await this.deps.processStartedAt(lock.pid);
    if (!started) { return true; }
    return started.getTime() <= lockTime + START_TOLERANCE_MS;
  }

  /**
   * Signals the process group led by `pid`, or the process alone when it
   * leads none (a runner started from a shell belongs to the shell's job).
   */
  private sendToGroup(pid: number, signal: NodeJS.Signals): void {
    try {
      this.deps.signal(-pid, signal);
      return;
    } catch {
      // Раннер не лидер группы — шлём ему одному.
    }
    try {
      this.deps.signal(pid, signal);
    } catch {
      // Уже завершился.
    }
  }

  private async waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
    const deadline = this.deps.now() + timeoutMs;
    while (this.deps.isAlive(pid)) {
      if (this.deps.now() >= deadline) { return false; }
      await this.deps.sleep(EXIT_POLL_MS);
    }
    return true;
  }

  /**
   * Removes what a force-killed runner could not: its lock (its cleanup handler
   * never ran), a pause request addressed to it, and an MCP pause state.
   * Each file is removed only while it still refers to this run.
   */
  private cleanUpAfter(root: string, lock: PipelineLock): void {
    removeFileIf(
      path.join(root, '.workflow', 'logs', '.pipeline.lock'),
      data => data.pid === lock.pid && data.started_at === lock.started_at
    );
    removeFileIf(path.join(root, PAUSE_REQUEST_RELATIVE), data => data.pid === lock.pid);
    removeFileIf(path.join(root, MCP_PAUSE_STATE_RELATIVE), data => data.pid === lock.pid);
  }
}
