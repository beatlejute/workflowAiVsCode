/**
 * ExternalPipelineMonitor — sees pipelines this extension did not start.
 *
 * A pipeline launched from a terminal (`workflow run`) or by the MCP server
 * used to be invisible here: PipelineService only knows about the child process
 * it spawned itself. The runner, however, always takes a lock, so the lock is
 * the one signal common to every way of starting a pipeline.
 *
 * Ported from `workflow-mcp/src/resources/pipeline-state.mjs`, which solves the
 * same problem by polling. Here the same reads are driven by FileSystemWatcher
 * events instead. Differences from the original are marked inline.
 *
 * Requires workflow-ai ≥ 1.6.0: the lock carries `started_by`, `run_id` and
 * `pipeline_log`. Older runners write only `{pid, started_at, timestamp}` and
 * are reported through `onUnsupportedRunner` rather than guessed at.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { readGateState, readRunnerPauseState } from './external-run-output';

/** How a pipeline was started. Comes from the lock, never inferred. */
export type PipelineSource = 'cli' | 'mcp' | 'extension';

/**
 * State of an external run.
 * `starting` is ours: the runner takes the lock before it creates the log file,
 * so there is a window with a live pipeline and nothing to tail yet.
 */
export type ExternalRunState = 'starting' | 'running' | 'paused' | 'stale';

/** Contents of `.workflow/logs/.pipeline.lock` as written by workflow-ai ≥ 1.6.0. */
export interface PipelineLock {
  pid: number;
  started_at: string;
  timestamp?: string;
  started_by?: string;
  run_id?: string | null;
  pipeline_log?: string | null;
  project_root?: string;
  pipeline_version?: string;
  /**
   * What the runner supports beyond the base protocol, e.g. `pause-request`.
   * Absent in locks of runners that predate the field.
   */
  capabilities?: string[];
}

/** An external pipeline run as the UI sees it. */
export interface ExternalRun {
  runId: string;
  pid: number;
  startedAt: string;
  source: PipelineSource;
  state: ExternalRunState;
  /** Absolute path to the run's log file, once it exists. */
  logPath?: string;
  /** Ticket waiting for a manual-gate approval, when there is one. */
  awaitingApproval?: { stepId: string; since: string };
  pipelineVersion?: string;
  /** The runner honours `.workflow/state/pause-request.json` (lock `capabilities`). */
  supportsPause?: boolean;
  /** A pause request addressed to this run exists; the runner may still be finishing a stage. */
  pauseRequested?: boolean;
  /** The process was suspended by the MCP tool `pause_pipeline`. */
  suspendedByMcp?: boolean;
}

/** Lock file path relative to a workspace folder. */
const LOCK_RELATIVE = '.workflow/logs/.pipeline.lock';

/**
 * Pause request read by the runner between stages. Same path as
 * `PAUSE_REQUEST_FILE` in `workflowAi/src/lib/pause-request.mjs`.
 */
export const PAUSE_REQUEST_RELATIVE = '.workflow/state/pause-request.json';

/** State written by the MCP tools `pause_pipeline`/`resume_pipeline`. */
export const MCP_PAUSE_STATE_RELATIVE = '.workflow/state/pipeline-pause.json';

/** How long to wait for the log file after the lock appears. */
const LOG_WAIT_MS = 10_000;

/** Poll interval while waiting for the log file to show up. */
const LOG_POLL_MS = 250;

/**
 * How often to re-check that a registered run's process is still alive.
 *
 * A pipeline killed without releasing its lock produces no further file events,
 * so a purely event-driven monitor would keep showing it as running forever.
 * That is the normal outcome of a forced kill on Windows, where the runner's
 * cleanup handler never gets to run.
 */
const LIVENESS_POLL_MS = 5_000;

/**
 * How many times to re-read a lock we could not parse before giving up.
 *
 * A transient unreadable lock is a write in progress and resolves in one tick;
 * a permanently broken one (runner killed between creating the file and filling
 * it) would otherwise keep us polling for the rest of the session.
 */
const MAX_REREAD_ATTEMPTS = 8;

/** Outcome of trying to read the lock, distinguishing "gone" from "unreadable". */
export type LockRead =
  | { present: true; lock: PipelineLock }
  | { present: true; lock: null }
  | { present: false; lock: null };

/**
 * Reads the lock, keeping "no such file" apart from "could not parse it".
 *
 * The difference matters: a missing lock means the pipeline finished, while an
 * unreadable one usually means we caught a rename or a half-written file mid
 * flight. Treating the latter as a finish would end the run, write history and
 * close the output channel, only to re-register a moment later.
 */
export function readLockState(root: string): LockRead {
  const lockPath = path.join(root, LOCK_RELATIVE);
  let raw: string;
  try {
    raw = fs.readFileSync(lockPath, 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'ENOENT' ? { present: false, lock: null } : { present: true, lock: null };
  }

  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const pid = typeof data.pid === 'number' ? data.pid : parseInt(String(data.pid), 10);
    if (!pid || Number.isNaN(pid) || pid <= 0) { return { present: true, lock: null }; }
    const startedAt = typeof data.started_at === 'string'
      ? data.started_at
      : (typeof data.timestamp === 'string' ? data.timestamp : '');
    return { present: true, lock: { ...(data as unknown as PipelineLock), pid, started_at: startedAt } };
  } catch {
    return { present: true, lock: null };
  }
}

/**
 * Reads and validates the lock. Returns null when it is missing or unreadable —
 * a half-written file is a normal transient state, not an error.
 */
export function readPipelineLock(root: string): PipelineLock | null {
  return readLockState(root).lock;
}

/**
 * Liveness by PID. The extension host is a Node process, so signal 0 works the
 * same way it does in the MCP server.
 */
export function isProcessAlive(pid: number): boolean {
  if (!pid || pid <= 0) { return false; }
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM означает «процесс есть, но он не наш» — раннер из терминала с
    // повышенными правами или от другого пользователя. Считать его мёртвым
    // значило бы показать живой пайплайн протухшим и записать ему `error`.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Normalises `started_by` to a known source; anything unexpected counts as CLI. */
function toSource(startedBy: string | undefined): PipelineSource {
  return startedBy === 'mcp' || startedBy === 'extension' ? startedBy : 'cli';
}

/**
 * Pending manual-gate approval, read from `.workflow/approvals/*.json`.
 * Port of `getAwaitingApproval`.
 */
export function readAwaitingApproval(
  root: string,
  /**
   * Ignore approvals created before this moment. The runner reuses approval
   * files by step id and never deletes them, so a `pending` left over from a
   * run weeks ago would otherwise mark every new pipeline as waiting — and, as
   * `paused` runs skip the wait for their log, would also stop the output
   * channel from ever attaching.
   */
  since?: string
): { stepId: string; since: string } | undefined {
  const dir = path.join(root, '.workflow', 'approvals');
  const floor = since ? Date.parse(since) : NaN;

  try {
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
      const full = path.join(dir, file);
      const data = JSON.parse(fs.readFileSync(full, 'utf-8'));
      if (data.status !== 'pending') { continue; }

      const created = data.created_at || data.since || fs.statSync(full).mtime.toISOString();
      if (!Number.isNaN(floor)) {
        const createdMs = Date.parse(created);
        // Неразбираемую дату считаем свежей: лучше показать лишний paused,
        // чем пропустить настоящее ожидание approval.
        if (!Number.isNaN(createdMs) && createdMs < floor) { continue; }
      }

      return {
        stepId: data.step_id || data.id || file.replace('.json', ''),
        since: created
      };
    }
  } catch {
    // Нет каталога или битый JSON — approvals просто нет.
  }
  return undefined;
}

/**
 * Whether the pipeline is paused, from `.workflow/state/pipeline-pause.json`
 * (written by the MCP tools `pause_pipeline`/`resume_pipeline`).
 * Port of `getPausedState`.
 */
export function readPausedState(root: string, pid: number): boolean {
  try {
    const file = path.join(root, MCP_PAUSE_STATE_RELATIVE);
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return data.pid === pid;
  } catch {
    return false;
  }
}

/**
 * Whether a pause request addressed to this runner exists.
 * A request left behind by an earlier run carries another pid and is ignored,
 * exactly as the runner itself ignores it.
 */
export function readPauseRequest(root: string, pid: number): boolean {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(root, PAUSE_REQUEST_RELATIVE), 'utf-8'));
    return data?.pid === pid;
  } catch {
    return false;
  }
}

/** Whether the runner that wrote this lock honours pause requests. */
export function lockSupportsPause(lock: PipelineLock): boolean {
  return Array.isArray(lock.capabilities) && lock.capabilities.includes('pause-request');
}

/**
 * State of a run, given its lock.
 *
 * Deliberately narrower than the original `determinePipelineState`:
 *  - the `logHasExitCode` branch is dropped. It keys off a line `[exit] code=N`
 *    that workflow-ai never writes, so in this context it is dead code;
 *  - `completed` is dropped too. Here the lock disappearing *is* completion, and
 *    a run that finished has no lock to have a state for;
 *  - `aborting`/`killed` are not ported: `.aborting` and `.killed` are only ever
 *    read in workflow-mcp, nothing writes them in either project.
 */
export function determineRunState(
  root: string,
  lock: PipelineLock,
  hasLog: boolean,
  /** Path to the run's log, when it exists — the gate state is read from it. */
  logPath?: string
): ExternalRunState {
  if (!isProcessAlive(lock.pid)) {
    // Lock без живого процесса. На Windows это обычный исход принудительного
    // завершения: сигнал не доставляется, обработчик очистки не отрабатывает.
    return 'stale';
  }
  // Пока лога нет, run считается стартующим независимо от паузы: иначе
  // `paused` перекрыл бы ожидание файла и tail никогда бы не подключился.
  if (!hasLog) {
    return 'starting';
  }
  // Ожидание на manual-gate определяем по логу: раннер переиспользует
  // существующий pending-файл, поэтому дата в approvals/ может быть старше
  // запуска, и фильтр по ней пропустил бы настоящее ожидание.
  // Если лог молчит о gate — падаем на каталог approvals с фильтром по дате
  // запуска. Он менее надёжен (раннер переиспользует файлы), но лучше, чем
  // ничего, когда лог ещё не дописан или обрезан.
  // Пауза по запросу — тоже только по логу: файл запроса лежит и всё то время,
  // пока раннер доделывает текущую стадию, а стоит он лишь после отметки PAUSED.
  if (readPausedState(root, lock.pid)
    || readRunnerPauseState(logPath).paused
    || readGateState(logPath).waiting
    || readAwaitingApproval(root, lock.started_at)) {
    return 'paused';
  }
  return 'running';
}

/**
 * Watches one workspace folder for pipelines started outside the extension.
 */
export class ExternalPipelineMonitor implements vscode.Disposable {
  private readonly _onDidChangeRun = new vscode.EventEmitter<ExternalRun | undefined>();
  /** Fires with the current external run, or undefined when there is none. */
  readonly onDidChangeRun = this._onDidChangeRun.event;

  private readonly _onUnsupportedRunner = new vscode.EventEmitter<string>();
  /** Fires once per session when a lock lacks `started_by` (workflow-ai < 1.6.0). */
  readonly onUnsupportedRunner = this._onUnsupportedRunner.event;

  private watcher: vscode.FileSystemWatcher | undefined;
  private current: ExternalRun | undefined;
  private logWaitTimer: ReturnType<typeof setTimeout> | undefined;
  private livenessTimer: ReturnType<typeof setInterval> | undefined;
  private rereadTimer: ReturnType<typeof setTimeout> | undefined;
  private rereadAttempts = 0;
  private unsupportedReported = false;
  private disposed = false;

  constructor(readonly root: string) {}

  /**
   * Starts watching. Reads any lock that already exists, so a pipeline started
   * before the window opened is picked up too.
   */
  start(): void {
    const pattern = new vscode.RelativePattern(this.root, LOCK_RELATIVE);
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.watcher.onDidCreate(() => this.evaluate());
    this.watcher.onDidChange(() => this.evaluate());
    this.watcher.onDidDelete(() => this.handleLockGone());
    this.evaluate();
  }

  /** The external run currently seen in this folder, if any. */
  getActiveRun(): ExternalRun | undefined {
    return this.current;
  }

  /**
   * Re-reads the run right away instead of at the next liveness tick — after
   * a pause request or a stop sent from the UI, the user should not wait
   * five seconds to see the result.
   */
  refresh(): void {
    if (this.current) {
      this.recheck();
    } else {
      this.evaluate();
    }
  }

  /**
   * Re-reads the lock and publishes the resulting run.
   * Runs started by this extension are not reported: PipelineService already
   * owns them, and showing both would double-count a single pipeline.
   */
  private evaluate(): void {
    if (this.disposed) { return; }

    const { present, lock } = readLockState(this.root);
    if (!present) {
      this.handleLockGone();
      return;
    }
    if (!lock) {
      // Файл есть, но прочитать не удалось — почти всегда это момент записи:
      // `writeMarker` создаёт файл через `wx` и пишет содержимое вторым шагом.
      // Состояние не трогаем и не сбрасываем ожидание лога. Если запуска ещё
      // нет, перечитываем сами: события может больше не быть.
      if (!this.current) { this.scheduleReread(); }
      return;
    }

    // Lock прочитан — прошлые неудачи больше не в счёт.
    this.rereadAttempts = 0;

    // Отменяем незавершённое ожидание только когда точно знаем, чем его
    // заменить: опрос от предыдущего lock'а иначе подставит его путь новому
    // запуску.
    this.cancelLogWait();

    const alive = isProcessAlive(lock.pid);

    // Проверка версии — только для живого пайплайна. Мёртвый lock старого
    // формата это мусор от давнего запуска, а не повод просить обновиться.
    if (lock.started_by === undefined) {
      if (alive) { this.reportUnsupportedRunner(); } else { this.clearCurrent(); }
      return;
    }

    const source = toSource(lock.started_by);
    if (source === 'extension') {
      // Наш собственный запуск — его ведёт PipelineService.
      this.clearCurrent();
      return;
    }

    const logPath = this.resolveLogPath(lock);
    const hasLog = Boolean(logPath && fs.existsSync(logPath));
    const run: ExternalRun = {
      runId: lock.run_id || `pipeline@${lock.pid}`,
      pid: lock.pid,
      startedAt: lock.started_at,
      source,
      state: determineRunState(this.root, lock, hasLog, logPath),
      logPath: hasLog ? logPath : undefined,
      awaitingApproval: this.readGate(logPath, lock, hasLog),
      pipelineVersion: lock.pipeline_version,
      supportsPause: lockSupportsPause(lock),
      pauseRequested: readPauseRequest(this.root, lock.pid),
      suspendedByMcp: readPausedState(this.root, lock.pid)
    };

    this.current = run;
    this._onDidChangeRun.fire(run);

    if (run.state === 'stale') {
      // Процесс мёртв — дальше следить не за чем, lock снимет следующий запуск.
      this.stopLivenessWatch();
      return;
    }

    this.startLivenessWatch();

    // Лог создаётся позже lock'а — ждём его появления, чтобы перейти из
    // `starting` в `running` и начать tail.
    if (!hasLog && run.state === 'starting' && logPath) {
      this.waitForLog(logPath, run.pid, run.startedAt);
    }
  }

  /**
   * Re-checks liveness on a timer while a run is registered.
   *
   * The file watcher alone is not enough: a pipeline killed without releasing
   * its lock generates no further events, and the run would stay `running`
   * indefinitely. The MCP implementation this is ported from does not need a
   * timer because it is polled on every request.
   */
  private startLivenessWatch(): void {
    if (this.livenessTimer || this.disposed) { return; }
    this.livenessTimer = setInterval(() => {
      if (!this.current) {
        this.stopLivenessWatch();
        return;
      }
      this.recheck();
    }, LIVENESS_POLL_MS);
  }

  /**
   * Periodic re-read of everything that can change without touching the lock.
   *
   * Two things do: the process can die (no file event at all), and the pipeline
   * can stop at a manual gate — that writes `.workflow/approvals/*.json` or
   * `state/pipeline-pause.json`, neither of which the lock watcher sees. Without
   * this a pipeline that reaches a gate twenty minutes in still reads as
   * `running`, and one that was killed never leaves it.
   *
   * Deliberately not `evaluate()`: that cancels a pending wait for the log file,
   * and a tick landing in the middle of one would leave the run stuck.
   */
  private recheck(): void {
    const run = this.current;
    if (!run || this.disposed) { return; }

    const { present, lock } = readLockState(this.root);
    if (!present) {
      this.handleLockGone();
      return;
    }
    if (!lock || lock.pid !== run.pid) {
      // Lock подменили или он нечитаем — это уже задача evaluate() по событию.
      return;
    }

    // Путь берём из lock'а, а не из run.logPath: пока запуск в `starting`, там
    // undefined, и без этого он не вышел бы из `starting` после того, как
    // истёк дедлайн ожидания файла.
    const logPath = run.logPath ?? this.resolveLogPath(lock);
    const hasLog = Boolean(logPath && fs.existsSync(logPath));
    const state = determineRunState(this.root, lock, hasLog, logPath);
    const awaitingApproval = this.readGate(logPath, lock, hasLog);
    // Запрос паузы и приостановка через MCP меняют файлы в state/, которых
    // watcher lock'а не видит, — узнаём о них только здесь.
    const pauseRequested = readPauseRequest(this.root, lock.pid);
    const suspendedByMcp = readPausedState(this.root, lock.pid);

    if (state === run.state
      && awaitingApproval?.stepId === run.awaitingApproval?.stepId
      && (hasLog ? logPath : undefined) === run.logPath
      && pauseRequested === run.pauseRequested
      && suspendedByMcp === run.suspendedByMcp) {
      return;
    }

    this.current = {
      ...run,
      state,
      awaitingApproval,
      logPath: hasLog ? logPath : undefined,
      pauseRequested,
      suspendedByMcp
    };
    this._onDidChangeRun.fire(this.current);

    if (state === 'stale') {
      this.stopLivenessWatch();
    }
  }

  private stopLivenessWatch(): void {
    if (this.livenessTimer) {
      clearInterval(this.livenessTimer);
      this.livenessTimer = undefined;
    }
  }

  /**
   * Manual-gate wait for the run, preferring the log over the approvals
   * directory: the log states plainly when waiting began and when it ended.
   */
  private readGate(
    logPath: string | undefined,
    lock: PipelineLock,
    hasLog: boolean
  ): { stepId: string; since: string } | undefined {
    if (!hasLog) { return undefined; }
    const gate = readGateState(logPath);
    if (gate.waiting) {
      return { stepId: gate.stepId ?? 'manual-gate', since: lock.started_at };
    }
    return readAwaitingApproval(this.root, lock.started_at);
  }

  /** Absolute path to the run's log, from the lock's `pipeline_log`. */
  private resolveLogPath(lock: PipelineLock): string | undefined {
    if (!lock.pipeline_log) { return undefined; }
    return path.isAbsolute(lock.pipeline_log)
      ? lock.pipeline_log
      : path.join(this.root, lock.pipeline_log);
  }

  /**
   * Polls for the log file for a bounded time. The same trick `start_pipeline`
   * uses in workflow-mcp: a FileSystemWatcher on the logs directory would also
   * work, but the wait is short and bounded, and this keeps one watcher per
   * monitor instead of two.
   */
  private waitForLog(logPath: string, pid: number, startedAt: string): void {
    this.cancelLogWait();
    const deadline = Date.now() + LOG_WAIT_MS;

    const poll = () => {
      if (this.disposed) { return; }
      // Пока ждали, lock мог смениться — тогда этот опрос уже не про текущий
      // запуск и его результат применять нельзя.
      if (!this.current || this.current.pid !== pid || this.current.startedAt !== startedAt) {
        return;
      }
      if (fs.existsSync(logPath)) {
        // Не выставляем состояние руками: у запуска мог появиться approval или
        // умереть процесс, пока мы ждали файл. Пусть решает общий разбор.
        this.evaluate();
        return;
      }
      if (Date.now() >= deadline) {
        // Пайплайн жив, но лога нет — оставляем `starting`, это не ошибка.
        return;
      }
      this.logWaitTimer = setTimeout(poll, LOG_POLL_MS);
    };

    this.logWaitTimer = setTimeout(poll, LOG_POLL_MS);
  }

  /**
   * One delayed re-read, for when the lock was unreadable and no run is known.
   * Without it a create event that landed on a not-yet-written file would be
   * the only notification we ever get.
   */
  private scheduleReread(): void {
    if (this.rereadTimer || this.disposed) { return; }
    // Ограничение обязательно: `evaluate()` при всё ещё нечитаемом lock'е
    // планирует ретрай снова, и без счётчика это превращается в бесконечный
    // опрос четыре раза в секунду на каждую папку — например, когда раннер
    // упал между созданием файла и записью содержимого и мусор остался лежать.
    if (this.rereadAttempts >= MAX_REREAD_ATTEMPTS) { return; }
    this.rereadAttempts++;
    this.rereadTimer = setTimeout(() => {
      this.rereadTimer = undefined;
      this.evaluate();
    }, LOG_POLL_MS);
  }

  private cancelReread(): void {
    if (this.rereadTimer) {
      clearTimeout(this.rereadTimer);
      this.rereadTimer = undefined;
    }
    this.rereadAttempts = 0;
  }

  private cancelLogWait(): void {
    if (this.logWaitTimer) {
      clearTimeout(this.logWaitTimer);
      this.logWaitTimer = undefined;
    }
  }

  /** The lock is gone: the pipeline finished and cleaned up after itself. */
  private handleLockGone(): void {
    this.cancelLogWait();
    this.cancelReread();
    this.stopLivenessWatch();
    this.clearCurrent();
  }

  private clearCurrent(): void {
    if (this.current !== undefined) {
      this.current = undefined;
      this._onDidChangeRun.fire(undefined);
    }
  }

  private reportUnsupportedRunner(): void {
    this.clearCurrent();
    if (this.unsupportedReported) { return; }
    this.unsupportedReported = true;
    this._onUnsupportedRunner.fire(this.root);
  }

  dispose(): void {
    this.disposed = true;
    this.cancelLogWait();
    this.cancelReread();
    this.stopLivenessWatch();
    this.watcher?.dispose();
    this._onDidChangeRun.dispose();
    this._onUnsupportedRunner.dispose();
  }
}
