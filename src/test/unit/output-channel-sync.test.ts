/**
 * Unit tests for the bounded catch-up used when attaching to a running
 * external pipeline. A long run's log reaches megabytes; appending all of it
 * would block the extension host, so the tail is capped by bytes and by lines.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  readLogTail,
  CATCHUP_MAX_BYTES,
  CATCHUP_MAX_LINES,
  CATCHUP_BATCH_LINES
} from '../../services/external-run-output';

function writeLog(lines: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-log-'));
  const file = path.join(dir, 'pipeline_2026-09-19_05-16-55.log');
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return file;
}

function cleanup(file: string): void {
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}

suite('readLogTail', () => {

  test('a short log is returned whole', () => {
    const file = writeLog(['line 1', 'line 2', 'line 3']);
    try {
      const { lines } = readLogTail(file);
      assert.deepStrictEqual(lines, ['line 1', 'line 2', 'line 3']);
    } finally {
      cleanup(file);
    }
  });

  test('the line cap keeps only the newest lines', () => {
    const file = writeLog(Array.from({ length: 500 }, (_, i) => `line ${i}`));
    try {
      const { lines } = readLogTail(file);
      assert.strictEqual(lines.length, CATCHUP_MAX_LINES);
      assert.strictEqual(lines[lines.length - 1], 'line 499');
    } finally {
      cleanup(file);
    }
  });

  test('the byte cap bounds how much is read from a large log', () => {
    // ~400 KB — заметно больше лимита в 64 KB.
    const file = writeLog(Array.from({ length: 4000 }, (_, i) => `${i}: ${'x'.repeat(90)}`));
    try {
      const { lines, nextOffset } = readLogTail(file);
      assert.ok(lines.length <= CATCHUP_MAX_LINES);
      // Смещение — конец файла, чтобы tail продолжил ровно с него.
      assert.strictEqual(nextOffset, fs.statSync(file).size);
      // Последняя строка должна быть именно последней, а не из середины.
      assert.ok(lines[lines.length - 1].startsWith('3999:'));
    } finally {
      cleanup(file);
    }
  });

  test('a truncated first line is dropped rather than shown mangled', () => {
    const file = writeLog(Array.from({ length: 200 }, (_, i) => `line ${i} ${'y'.repeat(50)}`));
    try {
      // Читаем всего 500 байт — начало обязательно попадёт на середину строки.
      const { lines } = readLogTail(file, 500, CATCHUP_MAX_LINES);
      assert.ok(lines.length > 0);
      assert.ok(lines[0].startsWith('line '), `обрезок не отброшен: ${lines[0]}`);
    } finally {
      cleanup(file);
    }
  });

  test('an empty log yields no lines', () => {
    const file = writeLog([]);
    try {
      const { lines } = readLogTail(file);
      assert.deepStrictEqual(lines.filter(l => l.length > 0), []);
    } finally {
      cleanup(file);
    }
  });

  test('caps are set so that batching actually happens on a full catch-up', () => {
    // 200 строк по 100 в батче — ровно два батча с уступкой между ними.
    assert.ok(CATCHUP_MAX_LINES > CATCHUP_BATCH_LINES);
    assert.strictEqual(Math.ceil(CATCHUP_MAX_LINES / CATCHUP_BATCH_LINES), 2);
    assert.strictEqual(CATCHUP_MAX_BYTES, 64 * 1024);
  });
});
