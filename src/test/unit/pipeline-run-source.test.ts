/**
 * Unit tests for PipelineRunSource — one active run per project.
 *
 * The runner refuses a second `workflow run` for a project whose lock is held
 * by a live process, and the extension starts pipelines through that same CLI.
 * So "our run" and "an external run" are two alternatives for one slot, and the
 * UI must never show both.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { PipelineRunSource } from '../../services/pipeline-run-source';
import { PipelineService, PipelineState } from '../../services/pipeline-service';
import { ExternalPipelineMonitor, ExternalRun } from '../../services/external-pipeline-monitor';

/** Minimal stand-in for PipelineService: state plus a state-change hook. */
function fakePipelineService(state: PipelineState = PipelineState.Idle) {
  let listeners: Array<() => void> = [];
  const service = {
    getState: () => state,
    onStateChange: (cb: () => void) => { listeners.push(cb); },
    // PipelineService наследует EventEmitter; dispose снимает слушателя через
    // removeListener, поэтому заглушка обязана его иметь.
    removeListener: (_event: string, cb: () => void) => {
      listeners = listeners.filter(l => l !== cb);
    },
    // Имя отличается от `setState` намеренно: в `PipelineService` этот метод
    // приватный, и пересечение `PipelineService & { setState… }` схлопывалось
    // в `never` — тип заглушки переставал иметь любые поля (TS2339).
    forceState(next: PipelineState) {
      state = next;
      for (const cb of listeners) { cb(); }
    },
    listenerCount: () => listeners.length
  };
  return service as unknown as PipelineService & {
    forceState(next: PipelineState): void;
    listenerCount(): number;
  };
}

/** Monitor stand-in whose run can be pushed from the test. */
function fakeMonitor(root: string) {
  const emitter = new vscode.EventEmitter<ExternalRun | undefined>();
  let started = false;
  const monitor = {
    root,
    onDidChangeRun: emitter.event,
    onUnsupportedRunner: new vscode.EventEmitter<string>().event,
    start: () => { started = true; },
    getActiveRun: () => undefined,
    dispose: () => emitter.dispose(),
    emit: (run: ExternalRun | undefined) => emitter.fire(run),
    wasStarted: () => started
  };
  return monitor as unknown as ExternalPipelineMonitor & {
    emit(run: ExternalRun | undefined): void;
    wasStarted(): boolean;
  };
}

function externalRun(overrides: Partial<ExternalRun> = {}): ExternalRun {
  return {
    runId: 'pipeline_2026-09-19_05-16-55',
    pid: 4242,
    startedAt: '2026-09-19T05:16:55.954Z',
    source: 'cli',
    state: 'running',
    ...overrides
  };
}

suite('PipelineRunSource', () => {

  test('no runs at all', () => {
    const source = new PipelineRunSource(fakePipelineService(), 'C:/project');
    assert.strictEqual(source.getActiveRun(), undefined);
    assert.strictEqual(source.getActiveProjectCount(), 0);
    source.dispose();
  });

  test('adding a monitor starts it', () => {
    const source = new PipelineRunSource(fakePipelineService(), 'C:/project');
    const monitor = fakeMonitor('C:/project');
    source.addMonitor(monitor);

    assert.strictEqual(monitor.wasStarted(), true);
    source.dispose();
  });

  test('an external run fills the slot while we are idle', () => {
    const source = new PipelineRunSource(fakePipelineService(), 'C:/project');
    const monitor = fakeMonitor('C:/project');
    source.addMonitor(monitor);

    monitor.emit(externalRun());
    const run = source.getActiveRun();

    assert.ok(run);
    assert.strictEqual(run.source, 'cli');
    assert.strictEqual(run.runId, 'pipeline_2026-09-19_05-16-55');
    assert.strictEqual(source.getActiveProjectCount(), 1);
    source.dispose();
  });

  test('our own run wins the slot — never two runs in one project', () => {
    const service = fakePipelineService(PipelineState.Running);
    const source = new PipelineRunSource(service, 'C:/project');
    const monitor = fakeMonitor('C:/project');
    source.addMonitor(monitor);

    // Такого в жизни быть не должно (singleton раннера), но если lock вдруг
    // виден одновременно с нашим запуском — показываем один узел, не два.
    monitor.emit(externalRun());

    assert.strictEqual(source.getActiveProjectCount(), 1);
    assert.strictEqual(source.getActiveRun()?.source, 'extension');
    source.dispose();
  });

  test('the slot changes hands when our run ends', () => {
    const service = fakePipelineService(PipelineState.Running);
    const source = new PipelineRunSource(service, 'C:/project');
    const monitor = fakeMonitor('C:/project');
    source.addMonitor(monitor);
    monitor.emit(externalRun());

    assert.strictEqual(source.getActiveRun()?.source, 'extension');
    service.forceState(PipelineState.Idle);
    assert.strictEqual(source.getActiveRun()?.source, 'cli');
    source.dispose();
  });

  test('the run disappears when the lock is released', () => {
    const source = new PipelineRunSource(fakePipelineService(), 'C:/project');
    const monitor = fakeMonitor('C:/project');
    source.addMonitor(monitor);

    monitor.emit(externalRun());
    monitor.emit(undefined);

    assert.strictEqual(source.getActiveRun(), undefined);
    assert.strictEqual(source.getActiveProjectCount(), 0);
    source.dispose();
  });

  test('two folders give two runs — parallelism lives between projects', () => {
    const source = new PipelineRunSource(fakePipelineService(), 'C:/a');
    const first = fakeMonitor('C:/a');
    const second = fakeMonitor('C:/b');
    source.addMonitor(first);
    source.addMonitor(second);

    first.emit(externalRun({ runId: 'run-a' }));
    second.emit(externalRun({ runId: 'run-b', source: 'mcp' }));

    const runs = source.getActiveRuns();
    assert.strictEqual(runs.length, 2);
    // Первый фолдер идёт первым.
    assert.strictEqual(runs[0].root, 'C:/a');
    assert.deepStrictEqual(runs.map(r => r.source).sort(), ['cli', 'mcp']);
    source.dispose();
  });

  test('a removed folder takes its run with it', () => {
    const source = new PipelineRunSource(fakePipelineService(), 'C:/a');
    const first = fakeMonitor('C:/a');
    const second = fakeMonitor('C:/b');
    source.addMonitor(first);
    source.addMonitor(second);
    first.emit(externalRun({ runId: 'run-a' }));
    second.emit(externalRun({ runId: 'run-b' }));

    source.removeMonitor('C:/b');

    assert.strictEqual(source.getActiveProjectCount(), 1);
    source.dispose();
  });

  test('a live external run is reported as the reason our start would be refused', () => {
    const source = new PipelineRunSource(fakePipelineService(), 'C:/project');
    const monitor = fakeMonitor('C:/project');
    source.addMonitor(monitor);

    monitor.emit(externalRun());
    const blocking = source.getBlockingExternalRun();

    assert.ok(blocking);
    assert.strictEqual(blocking.pid, 4242);
    source.dispose();
  });

  test('a stale lock is not counted as an active project', () => {
    const source = new PipelineRunSource(fakePipelineService(), 'C:/a');
    const first = fakeMonitor('C:/a');
    const second = fakeMonitor('C:/b');
    source.addMonitor(first);
    source.addMonitor(second);

    first.emit(externalRun({ runId: 'run-a' }));
    second.emit(externalRun({ runId: 'run-b', state: 'stale' }));

    // Мусорный lock от умершего процесса — не идущий пайплайн, и в счётчике
    // статус-бара ему не место.
    assert.strictEqual(source.getActiveRuns().length, 2);
    assert.strictEqual(source.getActiveProjectCount(), 1);
    source.dispose();
  });

  test('dispose detaches the pipeline service listener', () => {
    const service = fakePipelineService();
    const source = new PipelineRunSource(service, 'C:/project');
    assert.strictEqual(service.listenerCount(), 1);

    source.dispose();
    assert.strictEqual(service.listenerCount(), 0);
  });

  test('a stale lock does not block us — the runner will clear it', () => {
    const source = new PipelineRunSource(fakePipelineService(), 'C:/project');
    const monitor = fakeMonitor('C:/project');
    source.addMonitor(monitor);

    monitor.emit(externalRun({ state: 'stale' }));

    assert.strictEqual(source.getBlockingExternalRun(), undefined);
    source.dispose();
  });

  test('changes are announced to listeners', () => {
    const source = new PipelineRunSource(fakePipelineService(), 'C:/project');
    const monitor = fakeMonitor('C:/project');
    source.addMonitor(monitor);

    let fired = 0;
    source.onDidChange(() => { fired++; });

    monitor.emit(externalRun());
    monitor.emit(undefined);

    assert.strictEqual(fired, 2);
    source.dispose();
  });
});
