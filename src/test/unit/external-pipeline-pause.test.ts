/**
 * Unit tests for how an external run's pause is seen: the request file, the
 * runner's own PAUSED/RESUMED marks in the log, the MCP suspension, and the
 * lock's `capabilities`.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ExternalPipelineMonitor,
  PipelineLock,
  determineRunState,
  lockSupportsPause,
  readPauseRequest,
  PAUSE_REQUEST_RELATIVE,
  MCP_PAUSE_STATE_RELATIVE
} from '../../services/external-pipeline-monitor';
import { readRunnerPauseState } from '../../services/external-run-output';

const LOG = '.workflow/logs/pipeline_2026-09-21_12-00-00.log';

function makeProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-pause-'));
  fs.mkdirSync(path.join(root, '.workflow', 'logs'), { recursive: true });
  return root;
}

function cleanup(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

function liveLock(root: string, extra: Partial<PipelineLock> = {}): PipelineLock {
  const lock: PipelineLock = {
    pid: process.pid,
    started_at: '2026-09-21T12:00:00.000Z',
    started_by: 'mcp',
    run_id: 'pipeline_2026-09-21_12-00-00',
    pipeline_log: LOG,
    capabilities: ['pause-request'],
    ...extra
  };
  fs.writeFileSync(path.join(root, '.workflow', 'logs', '.pipeline.lock'), JSON.stringify(lock));
  return lock;
}

function writeLog(root: string, lines: string[]): string {
  const file = path.join(root, LOG);
  fs.writeFileSync(file, lines.map(l => l + '\n').join(''));
  return file;
}

function writeState(root: string, relative: string, data: object): void {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
}

const PAUSED = '[2026-09-21 12:05:00] [INFO] [PipelineRunner] PAUSED before stage="execute-task"';
/** A pause request written after the run in liveLock() started. */
const REQUEST = { pid: process.pid, requested_at: '2026-09-21T12:04:00.000Z' };
const RESUMED = '[2026-09-21 12:09:00] [INFO] [PipelineRunner] RESUMED stage="execute-task"';

suite('readRunnerPauseState', () => {
  test('the last runner mark decides', () => {
    const root = makeProject();
    try {
      const file = writeLog(root, [PAUSED]);
      assert.deepStrictEqual(readRunnerPauseState(file), { paused: true, stage: 'execute-task' });
      writeLog(root, [PAUSED, RESUMED, '[2026-09-21 12:09:01] [INFO] [PipelineRunner] Step 7']);
      assert.deepStrictEqual(readRunnerPauseState(file), { paused: false });
    } finally {
      cleanup(root);
    }
  });

  test('ignores the phrase quoted by an agent', () => {
    const root = makeProject();
    try {
      // Вывод агента идёт с отступом и под тегом стадии, а не PipelineRunner.
      const file = writeLog(root, [
        '[2026-09-21 12:05:00] [INFO] [execute-task]   PAUSED before stage="x"',
        '    [2026-09-21 12:05:00] [INFO] [PipelineRunner] PAUSED before stage="x"'
      ]);
      assert.deepStrictEqual(readRunnerPauseState(file), { paused: false });
    } finally {
      cleanup(root);
    }
  });

  test('no log, no pause', () => {
    assert.deepStrictEqual(readRunnerPauseState(undefined), { paused: false });
    assert.deepStrictEqual(readRunnerPauseState(path.join(os.tmpdir(), 'wf-none', 'x.log')), { paused: false });
  });
});

suite('pause request and capabilities', () => {
  test('a request counts only for the pid it names', () => {
    const root = makeProject();
    try {
      assert.strictEqual(readPauseRequest(root, 10), false);
      writeState(root, PAUSE_REQUEST_RELATIVE, { pid: 11 });
      assert.strictEqual(readPauseRequest(root, 10), false);
      writeState(root, PAUSE_REQUEST_RELATIVE, { pid: 10 });
      assert.strictEqual(readPauseRequest(root, 10), true);
    } finally {
      cleanup(root);
    }
  });

  test('with the run start given, only a younger request counts', () => {
    const root = makeProject();
    try {
      writeState(root, PAUSE_REQUEST_RELATIVE, { pid: 10, requested_at: '2026-09-21T11:00:00.000Z' });
      assert.strictEqual(readPauseRequest(root, 10, '2026-09-21T12:00:00.000Z'), false, 'от прошлого запуска');
      assert.strictEqual(readPauseRequest(root, 10, '2026-09-21T10:00:00.000Z'), true);
      writeState(root, PAUSE_REQUEST_RELATIVE, { pid: 10 });
      assert.strictEqual(readPauseRequest(root, 10, '2026-09-21T10:00:00.000Z'), false, 'без даты возраст не проверить');
    } finally {
      cleanup(root);
    }
  });

  test('pause support comes from the lock capabilities', () => {
    assert.strictEqual(lockSupportsPause({ pid: 1, started_at: '', capabilities: ['pause-request'] }), true);
    assert.strictEqual(lockSupportsPause({ pid: 1, started_at: '', capabilities: [] }), false);
    assert.strictEqual(lockSupportsPause({ pid: 1, started_at: '' }), false);
  });

  test('a run holding on a pause request is paused; one still finishing its stage is running', () => {
    const root = makeProject();
    try {
      const lock = liveLock(root);
      writeState(root, PAUSE_REQUEST_RELATIVE, REQUEST);
      const file = writeLog(root, ['[2026-09-21 12:00:01] [INFO] [a] START stage="a" agent="x" skill="y"']);
      assert.strictEqual(determineRunState(root, lock, true, file), 'running', 'пока нет PAUSED — стадия ещё идёт');

      writeLog(root, [PAUSED]);
      assert.strictEqual(determineRunState(root, lock, true, file), 'paused');

      // Resume снял запрос, а RESUMED раннер допишет только через секунду:
      // запуск уже идёт, а не стоит без кнопок.
      fs.unlinkSync(path.join(root, PAUSE_REQUEST_RELATIVE));
      assert.strictEqual(determineRunState(root, lock, true, file), 'running');
    } finally {
      cleanup(root);
    }
  });
});

suite('ExternalPipelineMonitor pause fields', () => {
  test('publishes support, request and MCP suspension, and refresh() picks up changes', () => {
    const root = makeProject();
    const monitor = new ExternalPipelineMonitor(root);
    try {
      liveLock(root);
      writeLog(root, ['[2026-09-21 12:00:01] [INFO] [a] START stage="a" agent="x" skill="y"']);
      monitor.start();

      let run = monitor.getActiveRun();
      assert.ok(run);
      assert.strictEqual(run.supportsPause, true);
      assert.strictEqual(run.pauseRequested, false);
      assert.strictEqual(run.suspendedByMcp, false);
      assert.strictEqual(run.state, 'running');

      const seen: Array<boolean | undefined> = [];
      monitor.onDidChangeRun(r => seen.push(r?.pauseRequested));

      writeState(root, PAUSE_REQUEST_RELATIVE, REQUEST);
      monitor.refresh();
      run = monitor.getActiveRun();
      assert.strictEqual(run?.pauseRequested, true);
      assert.strictEqual(run?.state, 'running');
      assert.deepStrictEqual(seen, [true], 'изменение запроса должно публиковаться');

      writeState(root, MCP_PAUSE_STATE_RELATIVE, { pid: process.pid });
      monitor.refresh();
      assert.strictEqual(monitor.getActiveRun()?.suspendedByMcp, true);
      assert.strictEqual(monitor.getActiveRun()?.state, 'paused');
    } finally {
      monitor.dispose();
      cleanup(root);
    }
  });

  test('a runner without capabilities cannot be paused', () => {
    const root = makeProject();
    const monitor = new ExternalPipelineMonitor(root);
    try {
      liveLock(root, { capabilities: undefined });
      writeLog(root, ['[2026-09-21 12:00:01] [INFO] [a] START stage="a" agent="x" skill="y"']);
      monitor.start();
      assert.strictEqual(monitor.getActiveRun()?.supportsPause, false);
    } finally {
      monitor.dispose();
      cleanup(root);
    }
  });

  test('refresh() without a known run reads the lock', () => {
    const root = makeProject();
    const monitor = new ExternalPipelineMonitor(root);
    try {
      monitor.start();
      assert.strictEqual(monitor.getActiveRun(), undefined);
      liveLock(root);
      writeLog(root, []);
      monitor.refresh();
      assert.ok(monitor.getActiveRun(), 'после refresh запуск должен появиться');
    } finally {
      monitor.dispose();
      cleanup(root);
    }
  });
});
