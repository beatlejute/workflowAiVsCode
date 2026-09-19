/**
 * Unit tests for reading and interpreting `.workflow/logs/.pipeline.lock`.
 *
 * These cover the pure functions rather than the watcher: FileSystemWatcher
 * events are not delivered by the vscode mock, so wiring is exercised by the
 * suite tests instead.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  readPipelineLock,
  isProcessAlive,
  determineRunState,
  readAwaitingApproval,
  readPausedState,
  PipelineLock
} from '../../services/external-pipeline-monitor';

function makeProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-monitor-'));
  fs.mkdirSync(path.join(root, '.workflow', 'logs'), { recursive: true });
  return root;
}

function writeLock(root: string, lock: Partial<PipelineLock>): void {
  fs.writeFileSync(
    path.join(root, '.workflow', 'logs', '.pipeline.lock'),
    JSON.stringify(lock, null, 2)
  );
}

function cleanup(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

/** A lock as workflow-ai ≥ 1.6.0 writes it for a live process. */
function liveLock(root: string): PipelineLock {
  return {
    pid: process.pid,
    started_at: '2026-09-19T05:16:55.954Z',
    timestamp: '2026-09-19T05:16:55.954Z',
    started_by: 'cli',
    run_id: 'pipeline_2026-09-19_05-16-55',
    pipeline_log: '.workflow/logs/pipeline_2026-09-19_05-16-55.log',
    project_root: root,
    pipeline_version: '1.6.0'
  };
}

suite('readPipelineLock', () => {

  test('reads the full payload written by workflow-ai 1.6.0', () => {
    const root = makeProject();
    try {
      writeLock(root, liveLock(root));
      const lock = readPipelineLock(root);

      assert.ok(lock);
      assert.strictEqual(lock.pid, process.pid);
      assert.strictEqual(lock.started_by, 'cli');
      assert.strictEqual(lock.run_id, 'pipeline_2026-09-19_05-16-55');
      assert.strictEqual(lock.pipeline_log, '.workflow/logs/pipeline_2026-09-19_05-16-55.log');
      assert.strictEqual(lock.pipeline_version, '1.6.0');
    } finally {
      cleanup(root);
    }
  });

  test('returns null when there is no lock', () => {
    const root = makeProject();
    try {
      assert.strictEqual(readPipelineLock(root), null);
    } finally {
      cleanup(root);
    }
  });

  test('returns null for a half-written lock rather than throwing', () => {
    const root = makeProject();
    try {
      fs.writeFileSync(path.join(root, '.workflow', 'logs', '.pipeline.lock'), '{"pid": 12');
      assert.strictEqual(readPipelineLock(root), null);
    } finally {
      cleanup(root);
    }
  });

  test('rejects a lock without a usable pid', () => {
    const root = makeProject();
    try {
      writeLock(root, { pid: 0, started_at: 'x' });
      assert.strictEqual(readPipelineLock(root), null);
    } finally {
      cleanup(root);
    }
  });

  test('falls back to timestamp when started_at is absent (pre-1.6.0 lock)', () => {
    const root = makeProject();
    try {
      writeLock(root, { pid: process.pid, timestamp: '2026-05-02T10:00:00.000Z' });
      const lock = readPipelineLock(root);

      assert.ok(lock);
      assert.strictEqual(lock.started_at, '2026-05-02T10:00:00.000Z');
      // Отсутствие started_by — признак старого раннера.
      assert.strictEqual(lock.started_by, undefined);
    } finally {
      cleanup(root);
    }
  });
});

suite('isProcessAlive', () => {

  test('our own process is alive', () => {
    assert.strictEqual(isProcessAlive(process.pid), true);
  });

  test('an implausible pid is not', () => {
    assert.strictEqual(isProcessAlive(99999999), false);
  });

  test('a nonsense pid is rejected without throwing', () => {
    assert.strictEqual(isProcessAlive(0), false);
    assert.strictEqual(isProcessAlive(-1), false);
  });
});

suite('determineRunState', () => {

  test('live process with a log is running', () => {
    const root = makeProject();
    try {
      assert.strictEqual(determineRunState(root, liveLock(root), true), 'running');
    } finally {
      cleanup(root);
    }
  });

  test('live process before its log exists is starting', () => {
    const root = makeProject();
    try {
      // Раннер берёт lock до создания лога, поэтому это нормальное окно.
      assert.strictEqual(determineRunState(root, liveLock(root), false), 'starting');
    } finally {
      cleanup(root);
    }
  });

  test('dead process with a leftover lock is stale, not running', () => {
    const root = makeProject();
    try {
      const lock = { ...liveLock(root), pid: 99999999 };
      // На Windows убитый раннер не получает сигнал и lock остаётся — это
      // обычный исход, а не экзотика.
      assert.strictEqual(determineRunState(root, lock, true), 'stale');
    } finally {
      cleanup(root);
    }
  });

  test('a pending approval makes a running pipeline paused', () => {
    const root = makeProject();
    try {
      fs.mkdirSync(path.join(root, '.workflow', 'approvals'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.workflow', 'approvals', 'step-7.json'),
        JSON.stringify({ status: 'pending', step_id: 'manual-gate', created_at: '2026-09-19T06:00:00Z' })
      );

      assert.strictEqual(determineRunState(root, liveLock(root), true), 'paused');
    } finally {
      cleanup(root);
    }
  });

  test('an explicit pause file makes it paused', () => {
    const root = makeProject();
    try {
      fs.mkdirSync(path.join(root, '.workflow', 'state'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.workflow', 'state', 'pipeline-pause.json'),
        JSON.stringify({ pid: process.pid })
      );

      assert.strictEqual(readPausedState(root, process.pid), true);
      assert.strictEqual(determineRunState(root, liveLock(root), true), 'paused');
    } finally {
      cleanup(root);
    }
  });

  test('a pause file for a different pid does not apply', () => {
    const root = makeProject();
    try {
      fs.mkdirSync(path.join(root, '.workflow', 'state'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.workflow', 'state', 'pipeline-pause.json'),
        JSON.stringify({ pid: 424242 })
      );

      assert.strictEqual(readPausedState(root, process.pid), false);
    } finally {
      cleanup(root);
    }
  });
});

suite('readAwaitingApproval', () => {

  test('finds a pending approval', () => {
    const root = makeProject();
    try {
      fs.mkdirSync(path.join(root, '.workflow', 'approvals'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.workflow', 'approvals', 'a.json'),
        JSON.stringify({ status: 'pending', step_id: 'manual-gate', created_at: '2026-09-19T06:00:00Z' })
      );

      const awaiting = readAwaitingApproval(root);
      assert.ok(awaiting);
      assert.strictEqual(awaiting.stepId, 'manual-gate');
      assert.strictEqual(awaiting.since, '2026-09-19T06:00:00Z');
    } finally {
      cleanup(root);
    }
  });

  test('ignores approvals that are already decided', () => {
    const root = makeProject();
    try {
      fs.mkdirSync(path.join(root, '.workflow', 'approvals'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.workflow', 'approvals', 'a.json'),
        JSON.stringify({ status: 'approved', step_id: 'manual-gate' })
      );

      assert.strictEqual(readAwaitingApproval(root), undefined);
    } finally {
      cleanup(root);
    }
  });

  test('a missing approvals directory is not an error', () => {
    const root = makeProject();
    try {
      assert.strictEqual(readAwaitingApproval(root), undefined);
    } finally {
      cleanup(root);
    }
  });
});
