/**
 * Unit tests for the context keys that show Stop, Pause and Resume for a run
 * started outside the extension.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { updateExternalContextKeys } from '../../services/external-pipeline-setup';
import { ActiveRun } from '../../services/pipeline-run-source';

suite('updateExternalContextKeys', () => {
  let keys: Record<string, unknown>;
  let registration: vscode.Disposable;

  setup(() => {
    keys = {};
    registration = vscode.commands.registerCommand('setContext', (key: string, value: unknown) => {
      keys[key] = value;
    });
  });

  teardown(() => {
    registration.dispose();
  });

  function run(overrides: Partial<ActiveRun> = {}): ActiveRun {
    return { root: '/p', source: 'mcp', state: 'running', pid: 1, startedAt: 's', supportsPause: true, ...overrides };
  }

  test('a running external run can be stopped and paused', async () => {
    await updateExternalContextKeys(run());
    assert.deepStrictEqual(keys, {
      'workflow.externalPipelineActive': true,
      'workflow.externalPipelineCanPause': true,
      'workflow.externalPipelineCanResume': false
    });
  });

  test('a requested pause offers Resume instead of Pause', async () => {
    await updateExternalContextKeys(run({ pauseRequested: true }));
    assert.strictEqual(keys['workflow.externalPipelineCanPause'], false);
    assert.strictEqual(keys['workflow.externalPipelineCanResume'], true);
  });

  test('an MCP suspension offers Resume', async () => {
    await updateExternalContextKeys(run({ state: 'paused', suspendedByMcp: true }));
    assert.strictEqual(keys['workflow.externalPipelineCanPause'], false);
    assert.strictEqual(keys['workflow.externalPipelineCanResume'], true);
  });

  test('a run parked at a manual gate cannot be paused again', async () => {
    await updateExternalContextKeys(run({ state: 'paused' }));
    assert.strictEqual(keys['workflow.externalPipelineCanPause'], false);
    assert.strictEqual(keys['workflow.externalPipelineCanResume'], false);
  });

  test('an old runner offers no Pause', async () => {
    await updateExternalContextKeys(run({ supportsPause: false }));
    assert.strictEqual(keys['workflow.externalPipelineActive'], true);
    assert.strictEqual(keys['workflow.externalPipelineCanPause'], false);
  });

  test('a stale lock, our own run and no run at all turn everything off', async () => {
    for (const active of [run({ state: 'stale' }), run({ source: 'extension' }), undefined]) {
      await updateExternalContextKeys(active);
      assert.deepStrictEqual(keys, {
        'workflow.externalPipelineActive': false,
        'workflow.externalPipelineCanPause': false,
        'workflow.externalPipelineCanResume': false
      });
    }
  });
});
