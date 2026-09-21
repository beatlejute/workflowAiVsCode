/**
 * ExternalRunTracker — the stages of a pipeline this extension did not start.
 *
 * Our own run feeds PipelineStateManager from the runner's stdout. A run
 * started by the MCP server or from a terminal has no stdout we can see, but
 * the runner's Logger writes the very same lines to the run's log file. This
 * reads that file through the same parser and state manager, so an external
 * run gets the same stage tree as our own.
 *
 * Unlike ExternalRunOutput it reads the log from the very start rather than a
 * bounded tail: a stage is known from its START to its GOTO, and a cut-off
 * beginning would drop every stage before the cut. Long logs (tens of MB on a
 * day-long pipeline) are read in chunks with a yield in between, so the
 * extension host is never blocked for the whole file.
 */

import * as fs from 'fs';
import { PipelineLogParser } from '../ui/pipeline-log-parser';
import { PipelineStateManager } from './pipeline-state-manager';

/** Bytes read per step before yielding to the event loop. */
export const TRACKER_CHUNK_BYTES = 1024 * 1024;

function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

/**
 * A log line's timestamp as epoch ms.
 *
 * The runner stamps lines with `toISOString()` — UTC, written as
 * `YYYY-MM-DD HH:MM:SS`. `parseTimestamp` in the state manager reads the same
 * text as local time, which is harmless for the differences it takes but
 * would shift a stage's start by the UTC offset once compared with `Date.now()`.
 */
export function parseLogTimestampUtc(timestamp?: string): number | undefined {
  if (!timestamp) { return undefined; }
  const match = timestamp.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (!match) { return undefined; }
  const [, y, mo, d, h, mi, s] = match;
  const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  return Number.isNaN(ms) ? undefined : ms;
}

export class ExternalRunTracker {
  /** Stage state of the run, in the form the pipeline tree already renders. */
  readonly state: PipelineStateManager;

  private readonly parser = new PipelineLogParser();
  private offset = 0;
  /** Trailing partial line, held back until its newline arrives. */
  private pending: Buffer = Buffer.alloc(0);
  private reading: Promise<boolean> | undefined;
  private disposed = false;

  constructor(
    readonly logPath: string,
    /** `started_at` from the lock — the run's own start, not when we noticed it. */
    private readonly startedAt?: string
  ) {
    // Время событий — из самих строк лога: при подключении к идущему запуску
    // весь прочитанный хвост пришёл бы «сейчас», и у каждой стадии вышло бы 0s.
    this.state = new PipelineStateManager(ts => parseLogTimestampUtc(ts) ?? Date.now());
    this.resetState();
  }

  /**
   * Reads whatever was appended since the last call.
   * Resolves true when the stage state changed. Concurrent calls share one read.
   */
  poll(): Promise<boolean> {
    if (!this.reading) {
      this.reading = this.readNew().finally(() => { this.reading = undefined; });
    }
    return this.reading;
  }

  dispose(): void {
    this.disposed = true;
  }

  private resetState(): void {
    this.state.reset();
    const started = this.startedAt ? Date.parse(this.startedAt) : NaN;
    this.state.setRunStartTime(Number.isNaN(started) ? Date.now() : started);
    this.offset = 0;
    this.pending = Buffer.alloc(0);
  }

  private async readNew(): Promise<boolean> {
    let changed = false;

    while (!this.disposed) {
      let size: number;
      try {
        size = fs.statSync(this.logPath).size;
      } catch {
        // Лога нет или он недоступен — прочитаем в следующий раз.
        return changed;
      }

      if (size < this.offset) {
        // Файл усечён или подменён: всё прочитанное относится к другому
        // содержимому, начинаем заново.
        this.resetState();
        changed = true;
      }
      if (size === this.offset) { return changed; }

      const length = Math.min(size - this.offset, TRACKER_CHUNK_BYTES);
      let buffer = Buffer.alloc(length);
      let bytesRead: number;
      try {
        const fd = fs.openSync(this.logPath, 'r');
        try {
          bytesRead = fs.readSync(fd, buffer, 0, length, this.offset);
        } finally {
          fs.closeSync(fd);
        }
      } catch {
        return changed;
      }
      // Файл могли усечь между stat и чтением: берём только прочитанное, иначе
      // в строку ушли бы нули, а смещение перескочило бы конец файла.
      if (bytesRead === 0) { return changed; }
      buffer = buffer.subarray(0, bytesRead);
      this.offset += bytesRead;

      // Склейка в Buffer, а не в строке: многобайтовый символ на границе
      // чтения иначе распался бы на два U+FFFD.
      const chunk = this.pending.length > 0 ? Buffer.concat([this.pending, buffer]) : buffer;
      const lastBreak = chunk.lastIndexOf(0x0a);
      if (lastBreak === -1) {
        this.pending = Buffer.from(chunk);
      } else {
        this.pending = Buffer.from(chunk.subarray(lastBreak + 1));
        for (const line of chunk.subarray(0, lastBreak).toString('utf-8').split('\n')) {
          if (this.processLine(line)) { changed = true; }
        }
      }

      if (this.offset < size) {
        await yieldToEventLoop();
      }
    }
    return changed;
  }

  /** Same handling as PipelineExecutionListener gives a line of our own run. */
  private processLine(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) { return false; }
    return this.state.process(this.parser.parse(trimmed));
  }
}
