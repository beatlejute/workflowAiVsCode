/**
 * ExternalRunOutput — mirrors an external pipeline's log into an OutputChannel.
 *
 * A run started from a terminal or by the MCP server writes to a log file and
 * nowhere the extension can see. This tails that file: a bounded catch-up of
 * what is already there, then the new lines as they arrive.
 *
 * The catch-up is bounded twice over — by bytes and by lines — because a long
 * pipeline's log reaches megabytes, and appending all of it would block the
 * extension host. Batches yield between appends for the same reason.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/** Tail at most this many bytes when attaching to a run already in progress. */
export const CATCHUP_MAX_BYTES = 64 * 1024;

/** …and at most this many lines, whichever is smaller. */
export const CATCHUP_MAX_LINES = 200;

/** Lines appended per batch before yielding to the event loop. */
export const CATCHUP_BATCH_LINES = 100;

/** Yields to the event loop so a long catch-up cannot freeze the UI. */
function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

/**
 * Reads the tail of a file, capped by bytes and lines.
 * Returns the lines plus the offset the tailer should continue from.
 */
export function readLogTail(
  logPath: string,
  maxBytes = CATCHUP_MAX_BYTES,
  maxLines = CATCHUP_MAX_LINES
): { lines: string[]; nextOffset: number; partialTail: Buffer } {
  const stat = fs.statSync(logPath);
  const start = Math.max(0, stat.size - maxBytes);
  const length = stat.size - start;

  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(logPath, 'r');
  try {
    fs.readSync(fd, buffer, 0, length, start);
  } finally {
    fs.closeSync(fd);
  }

  // Обрезанная первая строка — выкидываем, она всё равно неполная.
  let chunk = buffer;
  if (start > 0) {
    const firstBreak = chunk.indexOf(0x0a);
    chunk = firstBreak === -1 ? Buffer.alloc(0) : chunk.subarray(firstBreak + 1);
  }

  // Последняя строка без перевода может быть ещё не дописана — отдаём её
  // отдельно, чтобы вызывающий придержал её до следующего чтения.
  const lastBreak = chunk.lastIndexOf(0x0a);
  const complete = lastBreak === -1 ? Buffer.alloc(0) : chunk.subarray(0, lastBreak);
  const partialTail = lastBreak === -1
    ? Buffer.from(chunk)
    : Buffer.from(chunk.subarray(lastBreak + 1));

  const lines = complete.toString('utf-8').split('\n').filter(line => line.length > 0);
  return {
    lines: lines.length > maxLines ? lines.slice(lines.length - maxLines) : lines,
    nextOffset: stat.size,
    partialTail
  };
}

/**
 * A verdict stated by the runner itself, at the start of its message.
 *
 * Every line is `[ts] [LEVEL] [component] message`, and the runner pipes agent
 * prompts and agent stdout into the same log — tickets in these projects quote
 * the very phrases we look for. Anchoring on the component alone is not enough
 * either: the runner's own `Final context: {...}` dump can contain an earlier
 * error, so the phrase has to open the message.
 *
 * Plus a line anchor: an agent running the runner's own tests dumps whole log
 * lines, prefix and all, into its stderr, and `_formatMessage` indents the
 * continuations of multi-line messages — so a real marker always starts at
 * column zero.
 */
const RUNNER_VERDICT = /^\[[^\]]+\] \[(?:DEBUG|INFO|WARN|ERROR)\] \[PipelineRunner\] (Pipeline completed successfully!|Stopped: reached max steps limit|Error at stage |No error handler defined)/;

/**
 * A manual-gate marker written by the runner itself.
 *
 * The runner logs these with the stage id twice — once as the logger's
 * component tag and once at the start of the message (`runner.mjs:1943`), so
 * `[ts] [INFO] [gate] [gate] manual-gate: …`. The back-reference pins both,
 * and the line anchor rejects that same text echoed inside somebody else's
 * line — see RUNNER_VERDICT.
 */
const GATE_MARKER = /^\[[^\]]+\] \[(?:DEBUG|INFO|WARN|ERROR)\] \[([^\]]+)\] \[\1\] manual-gate: (created pending approval|reusing existing approval|polling, current status=pending|approved by|rejected by|timeout after|aborted)/;

/**
 * Whether the run is parked at a manual gate, judged from its log.
 *
 * The approvals directory alone cannot answer this: the runner reuses an
 * existing pending file for the same step instead of rewriting it
 * (`runner.mjs:1943`), so after a restart the file predates the run and a
 * date filter would discard a gate the pipeline is genuinely waiting on.
 * The log says plainly when waiting starts and when it ends.
 */
export function readGateState(logPath: string | undefined): { waiting: boolean; stepId?: string } {
  if (!logPath) { return { waiting: false }; }
  try {
    const { lines } = readLogTail(logPath, 64 * 1024, 400);
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      const gate = line.match(GATE_MARKER);
      if (!gate) { continue; }
      // `polling` важнее прочего: при долгом ожидании строка о создании
      // approval уходит за окно хвоста, и остаются только эти отметки.
      const waiting = gate[2] === 'created pending approval'
        || gate[2] === 'polling, current status=pending'
        || (gate[2] === 'reusing existing approval' && line.includes('status=pending'));
      return waiting ? { waiting: true, stepId: gate[1] } : { waiting: false };
    }
  } catch {
    // Лог недоступен — про gate ничего не знаем.
  }
  return { waiting: false };
}

/**
 * Works out how a finished run ended, from the tail of its log.
 *
 * The lock disappearing only says the runner exited — it is removed in a
 * `finally`, so a crash and a clean finish look identical from outside. The log
 * is the only place that distinguishes them. Strings come from
 * `workflowAi/src/runner.mjs`: `Pipeline completed successfully!` (:2034),
 * `Stopped: reached max steps limit` (:2099), `=== Pipeline Runner Finished ===`
 * (:2102).
 */
export function readRunResult(logPath: string | undefined): 'success' | 'error' | 'stopped' {
  if (!logPath) { return 'error'; }
  try {
    // Хвост берём с запасом: после «completed successfully» раннер пишет ещё
    // `Final context` и сводку, а контекст бывает большим — на 8 КБ успех
    // уехал бы за границу и прочитался как ошибка.
    const { lines } = readLogTail(logPath, 64 * 1024, 400);

    // Идём с конца и берём первый встреченный маркер: в окно может попасть
    // отметка более раннего этапа, и она не должна перебить итог. Учитываем
    // только строки самого раннера — агентский вывод в этом же логе цитирует
    // те же фразы.
    for (let i = lines.length - 1; i >= 0; i--) {
      const verdict = lines[i].match(RUNNER_VERDICT);
      if (!verdict) { continue; }
      switch (verdict[1]) {
        case 'Stopped: reached max steps limit': return 'stopped';
        case 'Pipeline completed successfully!': return 'success';
        default: return 'error';
      }
    }

    // Ни одного маркера — раннер не дописал финальный блок, значит вывалился.
    return 'error';
  } catch {
    return 'error';
  }
}

/**
 * One OutputChannel per external run, kept in sync with its log file.
 */
export class ExternalRunOutput implements vscode.Disposable {
  private readonly channels = new Map<string, vscode.OutputChannel>();
  private readonly watchers = new Map<string, vscode.FileSystemWatcher>();
  private readonly offsets = new Map<string, number>();
  /** Trailing partial line per run, held back until its newline arrives. */
  private readonly pending = new Map<string, Buffer>();
  private disposed = false;

  /**
   * Starts mirroring a run's log. Safe to call again for the same run: an
   * already attached run is left alone rather than re-read from the start.
   */
  async attach(runId: string, source: string, logPath: string): Promise<void> {
    if (this.disposed) { return; }

    // «Подключён» — это канал И живой watcher. После detach (лог удалён,
    // детекция выключена и снова включена, папка переподключена) канал
    // остаётся, а tail снят; проверка только по каналу делала бы повторный
    // attach пустышкой, и вывод молча замирал бы до конца запуска.
    const existing = this.channels.get(runId);
    if (existing && this.watchers.has(runId)) { return; }

    if (existing) {
      // Восстанавливаем слежение за тем же каналом: смещение сбрасываем, чтобы
      // ветка восстановления показала ограниченный хвост.
      this.offsets.delete(runId);
      this.pending.delete(runId);
      this.watchLog(runId, logPath);
      return;
    }

    const channel = vscode.window.createOutputChannel(`WF: Pipeline (${source} ${runId})`);
    this.channels.set(runId, channel);

    try {
      const { lines, nextOffset, partialTail } = readLogTail(logPath);
      this.offsets.set(runId, nextOffset);
      // Последняя строка могла быть ещё не дописана — придержим её, иначе
      // следующий тик выведет её второй половиной отдельной строкой.
      if (partialTail.length > 0) { this.pending.set(runId, partialTail); }
      await this.appendInBatches(channel, lines);
    } catch {
      // Лог мог исчезнуть между событием и чтением. Смещение не ставим: иначе
      // следующее изменение вывалило бы файл целиком с нуля.
      this.offsets.delete(runId);
    }

    // Пока шёл catch-up, запуск мог завершиться и канал — закрыться. Тогда
    // watcher создавать нельзя: его потом некому будет снять.
    if (this.disposed || this.channels.get(runId) !== channel) {
      return;
    }
    this.watchLog(runId, logPath);
  }

  /**
   * Stops tailing. The channel is kept: a log is most interesting right after
   * the run ends, and closing it then would take it away at exactly that moment.
   */
  detach(runId: string): void {
    this.watchers.get(runId)?.dispose();
    this.watchers.delete(runId);
    this.offsets.delete(runId);
    this.pending.delete(runId);
  }

  /** Stops tailing and closes the channel. */
  close(runId: string): void {
    this.detach(runId);
    this.channels.get(runId)?.dispose();
    this.channels.delete(runId);
  }

  /** Reveals a run's channel, if it is attached. */
  show(runId: string): void {
    this.channels.get(runId)?.show(true);
  }

  /**
   * Reads whatever is left in the log before we stop following it.
   *
   * The log watcher and the lock watcher fire independently, so the last lines
   * can arrive after the run is already considered finished — without this they
   * would never reach the channel.
   */
  flush(runId: string, logPath: string | undefined): void {
    if (!logPath || !this.channels.has(runId)) { return; }
    this.readNewLines(runId, logPath);
  }

  /** Run ids currently mirrored. Exposed for tests. */
  getAttachedRunIds(): string[] {
    return [...this.channels.keys()];
  }

  private watchLog(runId: string, logPath: string): void {
    const pattern = new vscode.RelativePattern(path.dirname(logPath), path.basename(logPath));
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    watcher.onDidChange(() => this.readNewLines(runId, logPath));
    watcher.onDidDelete(() => this.detach(runId));
    this.watchers.set(runId, watcher);
  }

  /** Appends whatever was written since the last read. */
  private readNewLines(runId: string, logPath: string): void {
    const channel = this.channels.get(runId);
    if (!channel) { return; }

    try {
      const stat = fs.statSync(logPath);
      let from = this.offsets.get(runId);

      if (from === undefined) {
        // Первое успешное чтение после неудачного catch-up: показываем
        // ограниченный хвост, а не файл целиком.
        const { lines, nextOffset, partialTail } = readLogTail(logPath);
        this.offsets.set(runId, nextOffset);
        if (partialTail.length > 0) {
          this.pending.set(runId, partialTail);
        } else {
          this.pending.delete(runId);
        }
        for (const line of lines) { channel.appendLine(line); }
        return;
      }

      if (stat.size <= from) {
        // Файл усечён или не вырос. При усечении придержанный обрывок больше
        // ни к чему не приклеится — выбрасываем вместе со смещением.
        if (stat.size < from) {
          this.offsets.set(runId, stat.size);
          this.pending.delete(runId);
        }
        return;
      }

      // Хост мог быть занят, и с прошлого тика накопились мегабайты. Столько в
      // канал не льём — показываем хвост и честно говорим о пропуске.
      let skipped = 0;
      if (stat.size - from > CATCHUP_MAX_BYTES) {
        skipped = stat.size - from - CATCHUP_MAX_BYTES;
        from = stat.size - CATCHUP_MAX_BYTES;
        // После прыжка чтение начинается с середины строки, и придержанный
        // обрывок к ней уже не относится.
        this.pending.delete(runId);
      }

      const length = stat.size - from;
      const buffer = Buffer.alloc(length);
      const fd = fs.openSync(logPath, 'r');
      try {
        fs.readSync(fd, buffer, 0, length, from);
      } finally {
        fs.closeSync(fd);
      }

      // Склейка в Buffer, а не в строке: разрезанный границей чтения
      // многобайтовый символ иначе стал бы двумя U+FFFD.
      const held = this.pending.get(runId);
      let chunk = held ? Buffer.concat([held, buffer]) : buffer;

      if (skipped > 0) {
        // Обрезок первой строки после прыжка не показываем.
        const firstBreak = chunk.indexOf(0x0a);
        chunk = firstBreak === -1 ? Buffer.alloc(0) : chunk.subarray(firstBreak + 1);
      }

      // Последняя строка может быть дописана не до конца — придержим её до
      // следующего тика, иначе она выведется разрезанной надвое.
      const lastBreak = chunk.lastIndexOf(0x0a);
      this.offsets.set(runId, stat.size);

      if (lastBreak === -1) {
        this.pending.set(runId, chunk);
        return;
      }
      this.pending.set(runId, Buffer.from(chunk.subarray(lastBreak + 1)));

      if (skipped > 0) {
        channel.appendLine(`… [${skipped} bytes skipped]`);
      }
      for (const line of chunk.subarray(0, lastBreak).toString('utf-8').split('\n')) {
        if (line.length > 0) { channel.appendLine(line); }
      }
    } catch {
      // Гонка с ротацией или удалением лога — пропускаем тик.
    }
  }

  private async appendInBatches(channel: vscode.OutputChannel, lines: string[]): Promise<void> {
    for (let i = 0; i < lines.length; i += CATCHUP_BATCH_LINES) {
      for (const line of lines.slice(i, i + CATCHUP_BATCH_LINES)) {
        channel.appendLine(line);
      }
      if (i + CATCHUP_BATCH_LINES < lines.length) {
        await yieldToEventLoop();
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    // Обходим объединение ключей: watcher мог пережить свой канал, если run
    // завершился во время catch-up.
    for (const runId of new Set([...this.channels.keys(), ...this.watchers.keys()])) {
      this.close(runId);
    }
    this.pending.clear();
  }
}
