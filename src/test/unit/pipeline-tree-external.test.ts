/**
 * Unit tests for how the pipeline tree shows and controls a run started
 * outside the extension: its stages come from its own log, and Stop, Pause
 * and Resume go to ExternalPipelineControl instead of PipelineService.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WorkflowStore } from '../../data/workflow-store';
import { PipelineService, PipelineState } from '../../services/pipeline-service';
import { PipelineTreeProvider, describeControlRefusal } from '../../ui/pipeline-tree-provider';
import {
  PipelineTreeDataProvider,
  PipelineDataState,
  buildExternalRunItem,
  StageResult
} from '../../ui/pipeline-tree-data-provider';
import { CompletedStageTreeItem, CurrentStageTreeItem } from '../../ui/pipeline-tree-item-builder';
import { ExternalPipelineControl, ControlOutcome, ControlRefusal } from '../../services/external-pipeline-control';
import { ActiveRun } from '../../services/pipeline-run-source';
import { getPulseTicketId, setPulseTicketId } from '../../ui/kanban-tree-provider';
import { finishedRunResult } from '../../services/external-pipeline-setup';

function baseState(overrides: Partial<PipelineDataState> = {}): PipelineDataState {
  return {
    currentState: PipelineState.Idle,
    currentStage: undefined,
    currentAgent: undefined,
    currentFallbackAgent: undefined,
    currentSkill: undefined,
    currentTicket: undefined,
    currentAttempt: undefined,
    currentMaxAttempts: undefined,
    elapsed: undefined,
    stageElapsed: undefined,
    completedStages: [],
    stagesStarted: 0,
    retries: 0,
    gotos: 0,
    timeouts: 0,
    totalElapsedMs: 0,
    averageElapsedMs: 0,
    runHistory: [],
    ...overrides
  } as PipelineDataState;
}

function completed(stage: string, hint = 0) {
  return {
    stage,
    elapsed: '3s',
    success: true,
    result: StageResult.Success,
    outputLines: [],
    logLineHint: hint
  };
}

suite('buildExternalRunItem: pause', () => {
  test('a pending pause request is spelled out while the stage still runs', () => {
    const item = buildExternalRunItem({ source: 'mcp', state: 'running', pauseRequested: true, runId: 'r' });
    assert.strictEqual(item.label, 'Pipeline: pausing after the current stage');
  });

  test('once the runner holds, the node reads paused', () => {
    const item = buildExternalRunItem({ source: 'mcp', state: 'paused', pauseRequested: true, runId: 'r' });
    assert.strictEqual(item.label, 'Pipeline: paused');
  });

  test('an MCP suspension is named in the tooltip', () => {
    const item = buildExternalRunItem({ source: 'mcp', state: 'paused', suspendedByMcp: true });
    assert.ok((item.tooltip as vscode.MarkdownString).value.includes('Suspended via MCP pause_pipeline'));
  });
});

suite('PipelineTreeDataProvider: external run stages', () => {
  const store = new WorkflowStore();
  const provider = new PipelineTreeDataProvider(store);

  test('shows the current stage and completed stages of the external run', async () => {
    const items = await provider.getRootItemsFromState(baseState({
      currentStage: 'decompose-plan',
      currentAgent: 'claude-sonnet',
      completedStages: [completed('pick-first-task'), completed('check-plan-templates')],
      externalRun: { source: 'mcp', state: 'running', runId: 'r', logPath: '/logs/run.log' }
    }));

    assert.strictEqual(items[0].contextValue, 'pipeline-run-external');
    assert.ok(items[1] instanceof CurrentStageTreeItem);
    assert.strictEqual((items[1] as CurrentStageTreeItem).stage, 'decompose-plan');
    const stages = items.filter((i): i is CompletedStageTreeItem => i instanceof CompletedStageTreeItem);
    assert.deepStrictEqual(stages.map(s => s.stage), ['check-plan-templates', 'pick-first-task'], 'новые сверху');
    assert.ok(stages.every(s => s.logFile === '/logs/run.log'), 'клик по стадии открывает лог внешнего запуска');
    assert.deepStrictEqual(items.slice(-2).map(i => i.itemType), ['statistics', 'history']);
  });

  test('a stale run has no current stage: nothing is executing it', async () => {
    const items = await provider.getRootItemsFromState(baseState({
      currentStage: 'decompose-plan',
      completedStages: [completed('pick-first-task')],
      externalRun: { source: 'mcp', state: 'stale', runId: 'r', logPath: '/logs/run.log' }
    }));
    assert.ok(!items.some(i => i instanceof CurrentStageTreeItem));
    assert.ok(items.some(i => i instanceof CompletedStageTreeItem));
  });
});

/** Control double: records calls, answers with a preset outcome. */
class FakeControl {
  calls: Array<[string, string, ActiveRun]> = [];
  outcome: ControlOutcome = { ok: true };
  async stop(root: string, run: ActiveRun): Promise<ControlOutcome> {
    this.calls.push(['stop', root, run]);
    return this.outcome;
  }
  pause(root: string, run: ActiveRun): ControlOutcome {
    this.calls.push(['pause', root, run]);
    return this.outcome;
  }
  async resume(root: string, run: ActiveRun): Promise<ControlOutcome> {
    this.calls.push(['resume', root, run]);
    return this.outcome;
  }
}

suite('PipelineTreeProvider: external run', () => {
  let root: string;
  let store: WorkflowStore;
  let service: PipelineService;
  let provider: PipelineTreeProvider;
  let control: FakeControl;
  let refreshed: string[];
  const messages: { info: string[]; error: string[]; warning: string[] } = { info: [], error: [], warning: [] };
  let warningAnswer: string | undefined;
  const original = {
    info: vscode.window.showInformationMessage,
    error: vscode.window.showErrorMessage,
    warning: vscode.window.showWarningMessage
  };

  function run(overrides: Partial<ActiveRun> = {}): ActiveRun {
    return {
      root,
      source: 'mcp',
      state: 'running',
      runId: 'pipeline_2026-09-21_12-00-00',
      pid: 4242,
      startedAt: '2026-09-21T12:00:00.000Z',
      ...overrides
    };
  }

  setup(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-tree-external-'));
    fs.mkdirSync(path.join(root, '.workflow', 'logs'), { recursive: true });
    store = new WorkflowStore();
    service = new PipelineService();
    provider = new PipelineTreeProvider(store, service);
    provider.setWorkflowRoot(root);
    control = new FakeControl();
    refreshed = [];
    provider.setExternalRunControl(control as unknown as ExternalPipelineControl, r => refreshed.push(r));
    messages.info = []; messages.error = []; messages.warning = [];
    warningAnswer = 'Stop';
    const w = vscode.window as unknown as Record<string, unknown>;
    w.showInformationMessage = async (m: string) => { messages.info.push(m); return undefined; };
    w.showErrorMessage = async (m: string) => { messages.error.push(m); return undefined; };
    w.showWarningMessage = async (m: string) => { messages.warning.push(m); return warningAnswer; };
  });

  teardown(() => {
    const w = vscode.window as unknown as Record<string, unknown>;
    w.showInformationMessage = original.info;
    w.showErrorMessage = original.error;
    w.showWarningMessage = original.warning;
    provider.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('builds the stage tree from the external run log', async () => {
    const logPath = path.join(root, '.workflow', 'logs', 'pipeline_2026-09-21_12-00-00.log');
    fs.writeFileSync(logPath, [
      '[2026-09-21 12:00:00] [INFO] [a] START stage="a" agent="script-pick" skill="undefined"',
      '[2026-09-21 12:00:04] [INFO] [a] GOTO a → b status="default"',
      '[2026-09-21 12:00:05] [INFO] [b] START stage="b" agent="claude-sonnet" skill="decompose-plan"',
      ''
    ].join('\n'));
    provider.setExternalRun(run({ logPath }));
    await (provider as unknown as { externalTracker: { poll(): Promise<boolean> } }).externalTracker.poll();

    const items = await provider.getChildren();
    assert.strictEqual(items[0].contextValue, 'pipeline-run-external');
    assert.strictEqual((items[1] as CurrentStageTreeItem).stage, 'b');
    const stages = items.filter((i): i is CompletedStageTreeItem => i instanceof CompletedStageTreeItem);
    assert.deepStrictEqual(stages.map(s => s.stage), ['a']);
    assert.strictEqual(stages[0].elapsed, '4s');
  });

  test('without a log the external run shows no stages of our own past run', async () => {
    provider.setExternalRun(run());
    const items = await provider.getChildren();
    assert.ok(!items.some(i => i instanceof CompletedStageTreeItem || i instanceof CurrentStageTreeItem));
  });

  test('the tracker follows the run and is dropped with it', async () => {
    const logPath = path.join(root, '.workflow', 'logs', 'x.log');
    fs.writeFileSync(logPath, '');
    provider.setExternalRun(run({ logPath }));
    const internals = provider as unknown as { externalTracker?: unknown };
    const first = internals.externalTracker;
    assert.ok(first);
    provider.setExternalRun(run({ logPath, state: 'paused' }));
    assert.strictEqual(internals.externalTracker, first, 'тот же запуск — тот же трекер');
    provider.setExternalRun(run({ logPath, pid: 5555 }));
    assert.notStrictEqual(internals.externalTracker, first, 'другой запуск — новый трекер');
    provider.setExternalRun(undefined);
    assert.strictEqual(internals.externalTracker, undefined);
  });

  test('the kanban pulses the ticket the external run works on, and only while it works', async () => {
    setPulseTicketId(undefined);
    const logPath = path.join(root, '.workflow', 'logs', 'pulse.log');
    fs.writeFileSync(logPath, [
      '[2026-09-21 12:00:00] [INFO] [pick-first-task] START stage="pick-first-task" agent="script-pick" skill="undefined"',
      '[2026-09-21 12:00:01] [INFO] [pick-first-task] GOTO pick-first-task → execute-task status="found" params={"ticket_id":"IMPL-90"}',
      '[2026-09-21 12:00:02] [INFO] [execute-task] START stage="execute-task" agent="claude-sonnet" skill="execute-task"',
      ''
    ].join('\n'));
    const internals = provider as unknown as { externalTracker: { poll(): Promise<boolean> }; pollExternalTracker(): void };

    provider.setExternalRun(run({ logPath }));
    await internals.externalTracker.poll();
    internals.pollExternalTracker();
    await internals.externalTracker.poll();
    assert.strictEqual(getPulseTicketId(), 'IMPL-90');

    provider.setExternalRun(run({ logPath, state: 'paused' }));
    assert.strictEqual(getPulseTicketId(), undefined, 'на паузе тикет не в работе');

    provider.setExternalRun(run({ logPath }));
    assert.strictEqual(getPulseTicketId(), 'IMPL-90');
    provider.setExternalRun(undefined);
    assert.strictEqual(getPulseTicketId(), undefined, 'запуск закончился — пульс снят');
  });

  test('the pulse of our own run is not cleared by an external run it never set', () => {
    setPulseTicketId('OWN-1');
    try {
      provider.setExternalRun(run());
      provider.setExternalRun(undefined);
      assert.strictEqual(getPulseTicketId(), 'OWN-1');
    } finally {
      setPulseTicketId(undefined);
    }
  });

  test('a stale run is read once, without a polling timer', () => {
    const logPath = path.join(root, '.workflow', 'logs', 'stale.log');
    fs.writeFileSync(logPath, '');
    const internals = provider as unknown as { externalTracker?: unknown; externalTrackerTimer?: unknown };
    provider.setExternalRun(run({ logPath }));
    assert.ok(internals.externalTrackerTimer, 'живой запуск опрашивается');
    provider.setExternalRun(run({ logPath, state: 'stale' }));
    assert.ok(internals.externalTracker, 'стадии протухшего запуска остаются видны');
    assert.strictEqual(internals.externalTrackerTimer, undefined, 'протухший запуск не опрашивается');
  });

  test('Stop asks first and goes to the external control when our run is idle', async () => {
    provider.setExternalRun(run());
    await provider.stopPipeline();

    assert.strictEqual(messages.warning.length, 1, 'нужно подтверждение');
    assert.deepStrictEqual(control.calls.map(c => c[0]), ['stop']);
    assert.strictEqual(control.calls[0][1], root);
    assert.deepStrictEqual(refreshed, [root]);
    assert.deepStrictEqual(messages.info, ['External pipeline stopped']);
  });

  test('a cancelled confirmation stops nothing', async () => {
    warningAnswer = undefined;
    provider.setExternalRun(run());
    await provider.stopPipeline();
    assert.deepStrictEqual(control.calls, []);
  });

  test('a refused stop is reported', async () => {
    control.outcome = { ok: false, reason: 'pid-reused', pid: 4242 };
    provider.setExternalRun(run());
    await provider.stopPipeline();
    assert.deepStrictEqual(messages.error, [describeControlRefusal(control.outcome)]);
  });

  test('without an external run Stop goes to our own PipelineService', async () => {
    await provider.stopPipeline();
    assert.deepStrictEqual(control.calls, []);
    assert.deepStrictEqual(messages.info, ['Pipeline stopped']);
  });

  test('Pause and Resume go to the external control', async () => {
    provider.setExternalRun(run());
    await provider.pauseExternalPipeline();
    await provider.resumeExternalPipeline();
    assert.deepStrictEqual(control.calls.map(c => c[0]), ['pause', 'resume']);
    assert.deepStrictEqual(refreshed, [root, root]);
    assert.deepStrictEqual(messages.info, [
      'Pause requested: the pipeline will hold before its next stage',
      'Pipeline resumed'
    ]);
  });

  test('Pause and Resume refusals are reported', async () => {
    provider.setExternalRun(run());
    control.outcome = { ok: false, reason: 'pause-unsupported', pid: 4242 };
    await provider.pauseExternalPipeline();
    control.outcome = { ok: false, reason: 'not-paused', pid: 4242 };
    await provider.resumeExternalPipeline();
    assert.deepStrictEqual(messages.error, [
      'This workflow-ai runner cannot pause. Update workflow-ai.',
      'The pipeline is not paused'
    ]);
  });

  test('Pause and Resume without an external run say so', async () => {
    await provider.pauseExternalPipeline();
    await provider.resumeExternalPipeline();
    assert.deepStrictEqual(control.calls, []);
    assert.deepStrictEqual(messages.info, ['No external pipeline is running', 'No external pipeline is running']);
  });

  test('Stop without the control wired in explains itself', async () => {
    // Свой сервис: dispose провайдера закрывает и его.
    const bare = new PipelineTreeProvider(store, new PipelineService());
    try {
      bare.setWorkflowRoot(root);
      bare.setExternalRun(run());
      await bare.stopPipeline();
      assert.deepStrictEqual(messages.error, ['External pipeline control is not available']);
    } finally {
      bare.dispose();
    }
  });
});

suite('finishedRunResult', () => {
  const base: ActiveRun = { root: '/p', source: 'mcp', state: 'running', pid: 1, startedAt: 's' };

  test('a run stopped from here is stopped, whatever the log says', () => {
    assert.strictEqual(finishedRunResult({ ...base, state: 'stale' }, true), 'stopped');
    assert.strictEqual(finishedRunResult(base, true), 'stopped');
  });

  test('a run that died by itself is an error', () => {
    assert.strictEqual(finishedRunResult({ ...base, state: 'stale' }, false), 'error');
  });

  test('otherwise the runner verdict in the log decides', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-finished-'));
    try {
      const logPath = path.join(dir, 'run.log');
      fs.writeFileSync(logPath, '[2026-09-21 12:00:00] [INFO] [PipelineRunner] Pipeline completed successfully!\n');
      assert.strictEqual(finishedRunResult({ ...base, logPath }, false), 'success');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

suite('describeControlRefusal', () => {
  test('every refusal has its own text', () => {
    const reasons: ControlRefusal[] = [
      'run-changed', 'pid-reused', 'still-alive', 'pause-unsupported', 'not-paused', 'resume-failed', 'write-failed'
    ];
    const texts = reasons.map(reason => describeControlRefusal({ ok: false, reason, pid: 7, hint: 'why' }));
    assert.strictEqual(new Set(texts).size, reasons.length);
    assert.ok(texts.every(text => text.length > 0));
    assert.ok(texts[1].includes('7'), 'PID подставляется');
    assert.ok(texts[5].includes('why') && texts[6].includes('why'), 'подсказка подставляется');
    assert.strictEqual(describeControlRefusal({ ok: true }), '');
  });
});
