/**
 * Unit tests for ExternalPipelineControl — stop, pause and resume of a
 * pipeline started outside the extension (MCP server, terminal).
 *
 * The OS side (kill, process start time, pssuspend) is replaced by a fake,
 * except in the last suite, which stops a real child process end to end.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import {
  ExternalPipelineControl,
  ControlDeps,
  defaultControlDeps
} from '../../services/external-pipeline-control';
import { PipelineLock, PAUSE_REQUEST_RELATIVE, MCP_PAUSE_STATE_RELATIVE } from '../../services/external-pipeline-monitor';

const STARTED_AT = '2026-09-21T12:00:00.000Z';
const PID = 4242;

function makeProject(lock?: Partial<PipelineLock>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-control-'));
  fs.mkdirSync(path.join(root, '.workflow', 'logs'), { recursive: true });
  if (lock) {
    fs.writeFileSync(path.join(root, '.workflow', 'logs', '.pipeline.lock'), JSON.stringify({
      pid: PID,
      started_at: STARTED_AT,
      started_by: 'mcp',
      capabilities: ['pause-request'],
      ...lock
    }));
  }
  return root;
}

function cleanup(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

function lockExists(root: string): boolean {
  return fs.existsSync(path.join(root, '.workflow', 'logs', '.pipeline.lock'));
}

function writeState(root: string, relative: string, data: object): void {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
}

interface FakeOs extends ControlDeps {
  alive: Set<number>;
  commands: string[][];
  signals: Array<[number, NodeJS.Signals]>;
  startedAt: Date | null;
  commandOk: boolean;
  /** Signals that make the target exit. */
  lethal: Set<NodeJS.Signals>;
  /** Group signals throw, as for a runner that leads no process group. */
  noGroup: boolean;
  clock: number;
}

function fakeOs(platform: NodeJS.Platform): FakeOs {
  const fake: FakeOs = {
    platform,
    alive: new Set([PID]),
    commands: [],
    signals: [],
    startedAt: new Date(Date.parse(STARTED_AT) - 1000),
    commandOk: true,
    lethal: new Set<NodeJS.Signals>(['SIGTERM', 'SIGKILL']),
    noGroup: false,
    clock: 0,
    isAlive: pid => fake.alive.has(pid),
    processStartedAt: async () => fake.startedAt,
    runCommand: async (command, args) => {
      fake.commands.push([command, ...args]);
      if (command === 'taskkill' && fake.commandOk) { fake.alive.delete(Number(args[args.length - 1])); }
      return fake.commandOk ? { ok: true } : { ok: false, hint: 'not found' };
    },
    signal: (pid, signal) => {
      fake.signals.push([pid, signal]);
      if (pid < 0 && fake.noGroup) { throw new Error('ESRCH'); }
      if (fake.lethal.has(signal)) { fake.alive.delete(Math.abs(pid)); }
    },
    sleep: async ms => { fake.clock += ms; },
    now: () => fake.clock
  };
  return fake;
}

const target = { pid: PID, startedAt: STARTED_AT };

suite('ExternalPipelineControl.stop', () => {
  test('refuses when the lock describes another run', async () => {
    const root = makeProject({ started_at: '2026-09-21T13:00:00.000Z' });
    try {
      const fake = fakeOs('win32');
      const outcome = await new ExternalPipelineControl(fake).stop(root, target);
      assert.deepStrictEqual(outcome, { ok: false, reason: 'run-changed' });
      assert.deepStrictEqual(fake.commands, [], 'ничего не должно быть убито');
    } finally {
      cleanup(root);
    }
  });

  test('refuses when there is no lock at all', async () => {
    const root = makeProject();
    try {
      const outcome = await new ExternalPipelineControl(fakeOs('win32')).stop(root, target);
      assert.strictEqual(outcome.ok, false);
    } finally {
      cleanup(root);
    }
  });

  test('a dead process only has its files cleaned up', async () => {
    const root = makeProject({});
    try {
      const fake = fakeOs('win32');
      fake.alive.clear();
      writeState(root, PAUSE_REQUEST_RELATIVE, { pid: PID });
      const control = new ExternalPipelineControl(fake);
      const outcome = await control.stop(root, target);

      assert.deepStrictEqual(outcome, { ok: true, alreadyGone: true });
      assert.deepStrictEqual(fake.commands, []);
      assert.strictEqual(lockExists(root), false);
      assert.strictEqual(fs.existsSync(path.join(root, PAUSE_REQUEST_RELATIVE)), false);
      assert.strictEqual(control.wasStoppedByUser(target), true);
    } finally {
      cleanup(root);
    }
  });

  test('refuses to kill a PID that was reused by a later process', async () => {
    const root = makeProject({});
    try {
      const fake = fakeOs('win32');
      fake.startedAt = new Date(Date.parse(STARTED_AT) + 60_000);
      const control = new ExternalPipelineControl(fake);
      const outcome = await control.stop(root, target);

      assert.deepStrictEqual(outcome, { ok: false, reason: 'pid-reused', pid: PID });
      assert.deepStrictEqual(fake.commands, []);
      assert.strictEqual(lockExists(root), true, 'чужой lock трогать нельзя');
      assert.strictEqual(control.wasStoppedByUser(target), false);
    } finally {
      cleanup(root);
    }
  });

  test('an unknown start time does not block the stop', async () => {
    const root = makeProject({});
    try {
      const fake = fakeOs('win32');
      fake.startedAt = null;
      const outcome = await new ExternalPipelineControl(fake).stop(root, target);
      assert.deepStrictEqual(outcome, { ok: true });
    } finally {
      cleanup(root);
    }
  });

  test('Windows: kills the tree with taskkill and removes what the runner could not', async () => {
    const root = makeProject({});
    try {
      const fake = fakeOs('win32');
      writeState(root, PAUSE_REQUEST_RELATIVE, { pid: PID });
      writeState(root, MCP_PAUSE_STATE_RELATIVE, { pid: PID, paused_at: STARTED_AT });
      const control = new ExternalPipelineControl(fake);
      const outcome = await control.stop(root, target);

      assert.deepStrictEqual(outcome, { ok: true });
      assert.deepStrictEqual(fake.commands, [['taskkill', '/T', '/F', '/PID', String(PID)]]);
      assert.strictEqual(lockExists(root), false);
      assert.strictEqual(fs.existsSync(path.join(root, PAUSE_REQUEST_RELATIVE)), false);
      assert.strictEqual(fs.existsSync(path.join(root, MCP_PAUSE_STATE_RELATIVE)), false);
      assert.strictEqual(control.wasStoppedByUser(target), true);
    } finally {
      cleanup(root);
    }
  });

  test('state files of another run are left alone', async () => {
    const root = makeProject({});
    try {
      const fake = fakeOs('win32');
      writeState(root, PAUSE_REQUEST_RELATIVE, { pid: PID + 1 });
      await new ExternalPipelineControl(fake).stop(root, target);
      assert.strictEqual(fs.existsSync(path.join(root, PAUSE_REQUEST_RELATIVE)), true);
    } finally {
      cleanup(root);
    }
  });

  test('POSIX: SIGTERM goes to the process group first', async () => {
    const root = makeProject({});
    try {
      const fake = fakeOs('linux');
      const outcome = await new ExternalPipelineControl(fake).stop(root, target);
      assert.deepStrictEqual(outcome, { ok: true });
      assert.deepStrictEqual(fake.signals, [[-PID, 'SIGTERM']]);
    } finally {
      cleanup(root);
    }
  });

  test('POSIX: falls back to the process when it leads no group', async () => {
    const root = makeProject({});
    try {
      const fake = fakeOs('linux');
      fake.noGroup = true;
      await new ExternalPipelineControl(fake).stop(root, target);
      assert.deepStrictEqual(fake.signals, [[-PID, 'SIGTERM'], [PID, 'SIGTERM']]);
    } finally {
      cleanup(root);
    }
  });

  test('POSIX: escalates to SIGKILL after the grace period', async () => {
    const root = makeProject({});
    try {
      const fake = fakeOs('linux');
      fake.lethal = new Set<NodeJS.Signals>(['SIGKILL']);
      const outcome = await new ExternalPipelineControl(fake).stop(root, target);
      assert.deepStrictEqual(outcome, { ok: true });
      assert.deepStrictEqual(fake.signals, [[-PID, 'SIGTERM'], [-PID, 'SIGKILL']]);
      assert.ok(fake.clock >= 10_000, 'SIGKILL только после grace-периода');
    } finally {
      cleanup(root);
    }
  });

  test('a process that survives is reported and not recorded as stopped', async () => {
    const root = makeProject({});
    try {
      const fake = fakeOs('win32');
      fake.commandOk = false;
      const control = new ExternalPipelineControl(fake);
      const outcome = await control.stop(root, target);

      assert.deepStrictEqual(outcome, { ok: false, reason: 'still-alive', pid: PID });
      assert.strictEqual(lockExists(root), true);
      assert.strictEqual(control.wasStoppedByUser(target), false);
    } finally {
      cleanup(root);
    }
  });
});

suite('ExternalPipelineControl.pause', () => {
  test('writes a request addressed to the runner', () => {
    const root = makeProject({});
    try {
      const outcome = new ExternalPipelineControl(fakeOs('win32')).pause(root, target);
      assert.deepStrictEqual(outcome, { ok: true });
      const request = JSON.parse(fs.readFileSync(path.join(root, PAUSE_REQUEST_RELATIVE), 'utf-8'));
      assert.strictEqual(request.pid, PID);
      assert.strictEqual(request.requested_by, 'extension');
      assert.ok(!Number.isNaN(Date.parse(request.requested_at)));
    } finally {
      cleanup(root);
    }
  });

  test('refuses when the runner does not declare pause-request', () => {
    const root = makeProject({ capabilities: undefined });
    try {
      const outcome = new ExternalPipelineControl(fakeOs('win32')).pause(root, target);
      assert.deepStrictEqual(outcome, { ok: false, reason: 'pause-unsupported', pid: PID });
      assert.strictEqual(fs.existsSync(path.join(root, PAUSE_REQUEST_RELATIVE)), false);
    } finally {
      cleanup(root);
    }
  });

  test('refuses for a dead runner', () => {
    const root = makeProject({});
    try {
      const fake = fakeOs('win32');
      fake.alive.clear();
      const outcome = new ExternalPipelineControl(fake).pause(root, target);
      assert.deepStrictEqual(outcome, { ok: false, reason: 'run-changed' });
    } finally {
      cleanup(root);
    }
  });

  test('reports a request that cannot be written', () => {
    const root = makeProject({});
    try {
      // На месте каталога state — файл: mkdir не пройдёт.
      fs.writeFileSync(path.join(root, '.workflow', 'state'), 'not a directory');
      const outcome = new ExternalPipelineControl(fakeOs('win32')).pause(root, target);
      assert.strictEqual(outcome.ok, false);
      assert.strictEqual(!outcome.ok && outcome.reason, 'write-failed');
    } finally {
      cleanup(root);
    }
  });
});

suite('ExternalPipelineControl.resume', () => {
  test('withdraws a pause request', async () => {
    const root = makeProject({});
    try {
      writeState(root, PAUSE_REQUEST_RELATIVE, { pid: PID });
      const fake = fakeOs('win32');
      const outcome = await new ExternalPipelineControl(fake).resume(root, target);
      assert.deepStrictEqual(outcome, { ok: true });
      assert.strictEqual(fs.existsSync(path.join(root, PAUSE_REQUEST_RELATIVE)), false);
      assert.deepStrictEqual(fake.commands, []);
    } finally {
      cleanup(root);
    }
  });

  test('Windows: undoes an MCP suspension with pssuspend -r', async () => {
    const root = makeProject({});
    try {
      writeState(root, MCP_PAUSE_STATE_RELATIVE, { pid: PID, paused_at: STARTED_AT });
      const fake = fakeOs('win32');
      const outcome = await new ExternalPipelineControl(fake).resume(root, target);
      assert.deepStrictEqual(outcome, { ok: true });
      assert.deepStrictEqual(fake.commands, [['pssuspend.exe', '-r', String(PID)]]);
      assert.strictEqual(fs.existsSync(path.join(root, MCP_PAUSE_STATE_RELATIVE)), false);
    } finally {
      cleanup(root);
    }
  });

  test('POSIX: undoes an MCP suspension with SIGCONT', async () => {
    const root = makeProject({});
    try {
      writeState(root, MCP_PAUSE_STATE_RELATIVE, { pid: PID, paused_at: STARTED_AT });
      const fake = fakeOs('linux');
      const outcome = await new ExternalPipelineControl(fake).resume(root, target);
      assert.deepStrictEqual(outcome, { ok: true });
      assert.deepStrictEqual(fake.signals, [[PID, 'SIGCONT']]);
    } finally {
      cleanup(root);
    }
  });

  test('keeps the MCP state when the resume fails', async () => {
    const root = makeProject({});
    try {
      writeState(root, MCP_PAUSE_STATE_RELATIVE, { pid: PID, paused_at: STARTED_AT });
      const fake = fakeOs('win32');
      fake.commandOk = false;
      const outcome = await new ExternalPipelineControl(fake).resume(root, target);
      assert.deepStrictEqual(outcome, { ok: false, reason: 'resume-failed', pid: PID, hint: 'not found' });
      assert.strictEqual(fs.existsSync(path.join(root, MCP_PAUSE_STATE_RELATIVE)), true);
    } finally {
      cleanup(root);
    }
  });

  test('says so when there is nothing to resume', async () => {
    const root = makeProject({});
    try {
      const outcome = await new ExternalPipelineControl(fakeOs('win32')).resume(root, target);
      assert.deepStrictEqual(outcome, { ok: false, reason: 'not-paused', pid: PID });
    } finally {
      cleanup(root);
    }
  });

  test('refuses when the run changed', async () => {
    const root = makeProject({ pid: PID + 1 });
    try {
      const outcome = await new ExternalPipelineControl(fakeOs('win32')).resume(root, target);
      assert.deepStrictEqual(outcome, { ok: false, reason: 'run-changed' });
    } finally {
      cleanup(root);
    }
  });
});

suite('ExternalPipelineControl with the real OS', function () {
  this.timeout(30_000);

  test('stops a live process tree and removes its lock', async () => {
    const root = makeProject();
    // «Раннер» с дочерним процессом, как раннер с агентом: после stop не
    // должно остаться ни того, ни другого.
    const runner = spawn(process.execPath, ['-e',
      'const c = require("child_process").spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });'
      + ' console.log(c.pid); setInterval(() => {}, 1000)'
    ], { stdio: ['ignore', 'pipe', 'ignore'], detached: process.platform !== 'win32' });
    const exited = new Promise<void>(resolve => runner.once('exit', () => resolve()));
    const childPid = await new Promise<number>(resolve => {
      runner.stdout!.once('data', chunk => resolve(Number(String(chunk).trim())));
    });
    try {
      const startedAt = new Date(Date.now() + 1000).toISOString();
      fs.writeFileSync(path.join(root, '.workflow', 'logs', '.pipeline.lock'), JSON.stringify({
        pid: runner.pid, started_at: startedAt, started_by: 'cli'
      }));
      const control = new ExternalPipelineControl(defaultControlDeps);
      const outcome = await control.stop(root, { pid: runner.pid, startedAt });

      assert.deepStrictEqual(outcome, { ok: true });
      await exited;
      assert.strictEqual(lockExists(root), false);
      assert.strictEqual(defaultControlDeps.isAlive(childPid), false, 'дочерний процесс раннера должен умереть вместе с ним');
    } finally {
      for (const pid of [runner.pid, childPid]) {
        try { process.kill(pid!, 'SIGKILL'); } catch { /* уже нет */ }
      }
      cleanup(root);
    }
  });
});
