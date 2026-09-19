/**
 * Lifecycle tests for external pipeline detection.
 *
 * The first review round found that the classes here were covered only through
 * their pure functions, and the second round found a blocker that any test
 * instantiating the monitor would have caught: a pipeline already running when
 * the window opened stayed invisible, because the subscription was registered
 * after the monitors had already published their first state.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  ExternalPipelineMonitor,
  PipelineLock,
  readLockState
} from '../../services/external-pipeline-monitor';
import { ExternalRunOutput, readLogTail } from '../../services/external-run-output';

function makeProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-lifecycle-'));
  fs.mkdirSync(path.join(root, '.workflow', 'logs'), { recursive: true });
  return root;
}

function cleanup(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

function writeLock(root: string, extra: Partial<PipelineLock> = {}): PipelineLock {
  const lock: PipelineLock = {
    pid: process.pid,
    started_at: new Date().toISOString(),
    timestamp: new Date().toISOString(),
    started_by: 'cli',
    run_id: 'pipeline_2026-09-19_05-16-55',
    pipeline_log: '.workflow/logs/pipeline_2026-09-19_05-16-55.log',
    project_root: root,
    pipeline_version: '1.6.0',
    ...extra
  };
  fs.writeFileSync(path.join(root, '.workflow', 'logs', '.pipeline.lock'), JSON.stringify(lock, null, 2));
  return lock;
}

function writeLog(root: string, lock: PipelineLock, lines: string[] = ['первая строка']): void {
  fs.writeFileSync(path.join(root, lock.pipeline_log as string), lines.join('\n') + '\n');
}

suite('ExternalPipelineMonitor — lifecycle', () => {

  test('a pipeline already running when we start is reported immediately', () => {
    const root = makeProject();
    const monitor = new ExternalPipelineMonitor(root);
    try {
      const lock = writeLock(root);
      writeLog(root, lock);

      const seen: Array<string | undefined> = [];
      monitor.onDidChangeRun(run => seen.push(run?.state));

      // Подписка до start(): именно порядок «сначала слушатель, потом монитор»
      // и был сломан — первое состояние уходило в пустоту.
      monitor.start();

      assert.deepStrictEqual(seen, ['running']);
      assert.strictEqual(monitor.getActiveRun()?.runId, lock.run_id);
    } finally {
      monitor.dispose();
      cleanup(root);
    }
  });

  test('a run without its log yet is starting, not running', () => {
    const root = makeProject();
    const monitor = new ExternalPipelineMonitor(root);
    try {
      writeLock(root);
      monitor.start();
      assert.strictEqual(monitor.getActiveRun()?.state, 'starting');
    } finally {
      monitor.dispose();
      cleanup(root);
    }
  });

  test('our own run is not reported as external', () => {
    const root = makeProject();
    const monitor = new ExternalPipelineMonitor(root);
    try {
      writeLock(root, { started_by: 'extension' });
      monitor.start();
      assert.strictEqual(monitor.getActiveRun(), undefined);
    } finally {
      monitor.dispose();
      cleanup(root);
    }
  });

  test('a dead process gives a stale run, not a running one', () => {
    const root = makeProject();
    const monitor = new ExternalPipelineMonitor(root);
    try {
      const lock = writeLock(root, { pid: 99999999 });
      writeLog(root, lock);
      monitor.start();
      assert.strictEqual(monitor.getActiveRun()?.state, 'stale');
    } finally {
      monitor.dispose();
      cleanup(root);
    }
  });

  test('a lock from a runner older than 1.6.0 is refused, not guessed at', () => {
    const root = makeProject();
    const monitor = new ExternalPipelineMonitor(root);
    try {
      fs.writeFileSync(
        path.join(root, '.workflow', 'logs', '.pipeline.lock'),
        JSON.stringify({ pid: process.pid, timestamp: new Date().toISOString() })
      );

      let warned = 0;
      monitor.onUnsupportedRunner(() => warned++);
      monitor.start();

      assert.strictEqual(warned, 1);
      assert.strictEqual(monitor.getActiveRun(), undefined);
    } finally {
      monitor.dispose();
      cleanup(root);
    }
  });

  test('a dead old-format lock is ignored silently', () => {
    const root = makeProject();
    const monitor = new ExternalPipelineMonitor(root);
    try {
      fs.writeFileSync(
        path.join(root, '.workflow', 'logs', '.pipeline.lock'),
        JSON.stringify({ pid: 99999999, timestamp: new Date().toISOString() })
      );

      let warned = 0;
      monitor.onUnsupportedRunner(() => warned++);
      monitor.start();

      // Мусор от давнего запуска — не повод просить обновить workflow-ai.
      assert.strictEqual(warned, 0);
    } finally {
      monitor.dispose();
      cleanup(root);
    }
  });

  test('no lock at all means no run', () => {
    const root = makeProject();
    const monitor = new ExternalPipelineMonitor(root);
    try {
      monitor.start();
      assert.strictEqual(monitor.getActiveRun(), undefined);
    } finally {
      monitor.dispose();
      cleanup(root);
    }
  });

  test('dispose stops the timers it started', () => {
    const root = makeProject();
    const monitor = new ExternalPipelineMonitor(root);
    try {
      writeLock(root);
      monitor.start();

      // Запуск в `starting` держит и ожидание лога, и таймер живости.
      const internals = monitor as unknown as {
        logWaitTimer?: unknown;
        livenessTimer?: unknown;
        rereadTimer?: unknown;
      };
      assert.ok(internals.logWaitTimer !== undefined, 'ожидание лога не заведено');
      assert.ok(internals.livenessTimer !== undefined, 'таймер живости не заведён');

      monitor.dispose();

      assert.strictEqual(internals.logWaitTimer, undefined, 'ожидание лога пережило dispose');
      assert.strictEqual(internals.livenessTimer, undefined, 'таймер живости пережил dispose');
      assert.strictEqual(internals.rereadTimer, undefined, 'ретрай пережил dispose');
    } finally {
      cleanup(root);
    }
  });
});

suite('readLockState', () => {

  test('missing file and unreadable file are different answers', () => {
    const root = makeProject();
    try {
      assert.deepStrictEqual(readLockState(root), { present: false, lock: null });

      fs.writeFileSync(path.join(root, '.workflow', 'logs', '.pipeline.lock'), '{"pid": 12');
      const half = readLockState(root);
      // Недописанный файл — не «пайплайн закончился»: состояние трогать нельзя.
      assert.strictEqual(half.present, true);
      assert.strictEqual(half.lock, null);
    } finally {
      cleanup(root);
    }
  });
});

suite('ExternalRunOutput — tailing', () => {

  test('an unfinished last line is held back until its newline arrives', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-tail-'));
    const file = path.join(dir, 'pipeline.log');
    try {
      fs.writeFileSync(file, 'полная строка\nнедописанн');
      const { lines, partialTail } = readLogTail(file);

      assert.deepStrictEqual(lines, ['полная строка']);
      assert.strictEqual(partialTail.toString('utf-8'), 'недописанн');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a fully terminated file leaves nothing pending', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-tail-'));
    const file = path.join(dir, 'pipeline.log');
    try {
      fs.writeFileSync(file, 'раз\nдва\n');
      const { lines, partialTail } = readLogTail(file);

      assert.deepStrictEqual(lines, ['раз', 'два']);
      assert.strictEqual(partialTail.length, 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a multibyte character split by the byte cap is not mangled', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-tail-'));
    const file = path.join(dir, 'pipeline.log');
    try {
      // Кириллица — два байта на символ; режем ровно по границе.
      const line = 'я'.repeat(100);
      fs.writeFileSync(file, `${line}\n${line}\n`);
      const { lines } = readLogTail(file, 101, 10);

      // Обрезанная первая строка выбрасывается целиком, остаток читается верно.
      for (const l of lines) {
        assert.ok(!l.includes('�'), `порча кодировки: ${l}`);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('attach and close manage the channel list', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-tail-'));
    const file = path.join(dir, 'pipeline.log');
    const output = new ExternalRunOutput();
    try {
      fs.writeFileSync(file, 'строка\n');
      await output.attach('run-1', 'cli', file);
      assert.deepStrictEqual(output.getAttachedRunIds(), ['run-1']);

      // detach снимает tail, но канал оставляет: лог нужен сразу после финиша.
      output.detach('run-1');
      assert.deepStrictEqual(output.getAttachedRunIds(), ['run-1']);

      output.close('run-1');
      assert.deepStrictEqual(output.getAttachedRunIds(), []);
    } finally {
      output.dispose();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('attaching the same run twice does not duplicate the channel', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-tail-'));
    const file = path.join(dir, 'pipeline.log');
    const output = new ExternalRunOutput();
    try {
      fs.writeFileSync(file, 'строка\n');
      await output.attach('run-1', 'cli', file);
      await output.attach('run-1', 'cli', file);
      assert.strictEqual(output.getAttachedRunIds().length, 1);
    } finally {
      output.dispose();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

suite('vscode mock sanity', () => {
  test('EventEmitter used by the monitor actually delivers', () => {
    const emitter = new vscode.EventEmitter<number>();
    const seen: number[] = [];
    emitter.event(v => seen.push(v));
    emitter.fire(42);
    assert.deepStrictEqual(seen, [42]);
    emitter.dispose();
  });
});
