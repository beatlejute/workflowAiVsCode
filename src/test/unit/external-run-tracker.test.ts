/**
 * Unit tests for ExternalRunTracker — the stage tree of a run started outside
 * the extension, rebuilt from its log file.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ExternalRunTracker,
  parseLogTimestampUtc,
  TRACKER_CHUNK_BYTES
} from '../../services/external-run-tracker';
import { PipelineStateManager } from '../../services/pipeline-state-manager';
import { ParsedLogData } from '../../ui/pipeline-log-parser';

/** Lines as workflowAi's Logger writes them (UTC timestamps). */
function stage(name: string, start: string, end: string, next: string, extra: string[] = []): string[] {
  return [
    `[2026-09-21 ${start}] [INFO] [PipelineRunner] Current stage: ${name}`,
    `[2026-09-21 ${start}] [INFO] [${name}] START stage="${name}" agent="script-pick" skill="undefined"`,
    ...extra,
    `[2026-09-21 ${end}] [INFO] [${name}] COMPLETE stage="${name}" status="default" exitCode=0`,
    `[2026-09-21 ${end}] [INFO] [PipelineRunner] Stage ${name} completed with status: default`,
    `[2026-09-21 ${end}] [INFO] [${name}] GOTO ${name} → ${next} status="default"`
  ];
}

function makeLog(lines: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-tracker-'));
  const file = path.join(dir, 'pipeline_2026-09-21_12-00-00.log');
  fs.writeFileSync(file, lines.map(l => l + '\n').join(''));
  return file;
}

function cleanup(file: string): void {
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}

suite('parseLogTimestampUtc', () => {
  test('reads the runner timestamp as UTC', () => {
    assert.strictEqual(parseLogTimestampUtc('2026-09-21 12:56:22'), Date.UTC(2026, 8, 21, 12, 56, 22));
    assert.strictEqual(parseLogTimestampUtc('2026-09-21T12:56:22'), Date.UTC(2026, 8, 21, 12, 56, 22));
  });

  test('returns undefined for anything else', () => {
    assert.strictEqual(parseLogTimestampUtc(undefined), undefined);
    assert.strictEqual(parseLogTimestampUtc('yesterday'), undefined);
  });
});

suite('PipelineStateManager with an event clock', () => {
  test('stage elapsed comes from log timestamps, not from the moment of reading', () => {
    const clock = (ts?: string) => parseLogTimestampUtc(ts) ?? 0;
    const manager = new PipelineStateManager(clock);
    const start: ParsedLogData = { isStart: true, stage: 'a', timestamp: '2026-09-21 12:00:00' };
    const gotoB: ParsedLogData = { isGoto: true, gotoStage: 'b', timestamp: '2026-09-21 12:01:30' };
    manager.process(start);
    manager.process(gotoB);

    const [done] = manager.getCompletedStages();
    assert.strictEqual(done.stage, 'a');
    assert.strictEqual(done.elapsed, '1m30s');
  });

  test('without a clock the manager keeps using the time of arrival', () => {
    const manager = new PipelineStateManager();
    const before = Date.now();
    manager.process({ isStart: true, stage: 'a', timestamp: '2000-01-01 00:00:00' });
    const started = (manager as unknown as { state: { stageStartTime: number } }).state.stageStartTime;
    assert.ok(started >= before, 'stageStartTime должен быть моментом прихода строки');
  });
});

suite('ExternalRunTracker', () => {
  test('rebuilds completed stages and the current stage from the whole log', async () => {
    const file = makeLog([
      '[2026-09-21 12:00:00] [INFO] [PipelineRunner] === Pipeline Runner Started ===',
      ...stage('pick-first-task', '12:00:00', '12:00:02', 'check-plan-templates'),
      ...stage('check-plan-templates', '12:00:07', '12:00:37', 'decompose-plan'),
      '[2026-09-21 12:00:42] [INFO] [PipelineRunner] Current stage: decompose-plan',
      '[2026-09-21 12:00:42] [INFO] [decompose-plan] START stage="decompose-plan" agent="claude-sonnet" skill="decompose-plan"'
    ]);
    try {
      const tracker = new ExternalRunTracker(file, '2026-09-21T12:00:00.000Z');
      assert.strictEqual(await tracker.poll(), true);

      const completed = tracker.state.getCompletedStages();
      assert.deepStrictEqual(completed.map(s => s.stage), ['pick-first-task', 'check-plan-templates']);
      assert.strictEqual(completed[0].elapsed, '2s');
      assert.strictEqual(completed[1].elapsed, '30s');
      assert.strictEqual(tracker.state.getCurrentStage(), 'decompose-plan');
      assert.strictEqual(tracker.state.getCurrentAgent(), 'claude-sonnet');
      assert.strictEqual(tracker.state.getCurrentSkill(), 'decompose-plan');
      assert.strictEqual(tracker.state.getStagesStarted(), 2);
    } finally {
      cleanup(file);
    }
  });

  test('picks up appended lines on the next poll and holds a partial line back', async () => {
    const file = makeLog(stage('a', '12:00:00', '12:00:05', 'b'));
    try {
      const tracker = new ExternalRunTracker(file);
      await tracker.poll();
      assert.deepStrictEqual(tracker.state.getCompletedStages().map(s => s.stage), ['a']);

      // Строка GOTO дописана без перевода строки — её ещё нельзя разбирать.
      fs.appendFileSync(file, '[2026-09-21 12:00:06] [INFO] [b] START stage="b" agent="x" skill="y"\n');
      fs.appendFileSync(file, '[2026-09-21 12:00:09] [INFO] [b] GOTO b → c status="def');
      await tracker.poll();
      assert.strictEqual(tracker.state.getCurrentStage(), 'b');
      assert.strictEqual(tracker.state.getCompletedStages().length, 1);

      fs.appendFileSync(file, 'ault"\n');
      assert.strictEqual(await tracker.poll(), true);
      assert.deepStrictEqual(tracker.state.getCompletedStages().map(s => s.stage), ['a', 'b']);
      assert.strictEqual(tracker.state.getCurrentStage(), 'c');
    } finally {
      cleanup(file);
    }
  });

  test('a poll with nothing new reports no change', async () => {
    const file = makeLog(stage('a', '12:00:00', '12:00:05', 'b'));
    try {
      const tracker = new ExternalRunTracker(file);
      await tracker.poll();
      assert.strictEqual(await tracker.poll(), false);
    } finally {
      cleanup(file);
    }
  });

  test('reads a log larger than one chunk completely', async () => {
    // Вывод агента между START и GOTO раздувает лог за границу одного чтения.
    const filler = Array.from({ length: 4000 }, (_, i) =>
      `[2026-09-21 12:00:01] [INFO] [a]   agent output line ${i} ${'x'.repeat(400)}`);
    const file = makeLog([
      ...stage('a', '12:00:00', '12:00:05', 'b', filler),
      ...stage('b', '12:00:10', '12:00:12', 'end')
    ]);
    try {
      assert.ok(fs.statSync(file).size > TRACKER_CHUNK_BYTES, 'лог должен быть больше одного чанка');
      const tracker = new ExternalRunTracker(file);
      await tracker.poll();
      assert.deepStrictEqual(tracker.state.getCompletedStages().map(s => s.stage), ['a', 'b']);
    } finally {
      cleanup(file);
    }
  });

  test('a multi-byte character split by the chunk boundary survives', async () => {
    const start = '[2026-09-21 12:00:00] [INFO] [a] START stage="a" agent="x" skill="y"\n';
    const fillerPrefix = '[2026-09-21 12:00:01] [INFO] [a]   ';
    const textPrefix = '[2026-09-21 12:00:02] [INFO] [a]   ';
    // Первый байт «Д» — последний байт первого чтения, второй — первый байт следующего.
    const fillerLength = TRACKER_CHUNK_BYTES - 1
      - Buffer.byteLength(start) - Buffer.byteLength(fillerPrefix) - 1 - Buffer.byteLength(textPrefix);
    const file = makeLog([
      start.trimEnd(),
      fillerPrefix + 'x'.repeat(fillerLength),
      textPrefix + 'Декомпозиция готова',
      '[2026-09-21 12:00:03] [INFO] [a] GOTO a → b status="default"'
    ]);
    try {
      const bytes = fs.readFileSync(file);
      assert.strictEqual(bytes[TRACKER_CHUNK_BYTES - 1], Buffer.from('Д')[0], 'граница чтения должна резать «Д»');
      const tracker = new ExternalRunTracker(file);
      await tracker.poll();
      const [done] = tracker.state.getCompletedStages();
      assert.ok(done.outputLines?.some(l => l.includes('Декомпозиция готова')), 'кириллица не должна побиться');
    } finally {
      cleanup(file);
    }
  });

  test('starts over when the log is truncated', async () => {
    const file = makeLog([...stage('a', '12:00:00', '12:00:05', 'b'), ...stage('b', '12:00:06', '12:00:08', 'c')]);
    try {
      const tracker = new ExternalRunTracker(file);
      await tracker.poll();
      assert.strictEqual(tracker.state.getCompletedStages().length, 2);

      fs.writeFileSync(file, stage('z', '13:00:00', '13:00:01', 'end').map(l => l + '\n').join(''));
      await tracker.poll();
      assert.deepStrictEqual(tracker.state.getCompletedStages().map(s => s.stage), ['z']);
    } finally {
      cleanup(file);
    }
  });

  test('a missing log is not an error', async () => {
    const tracker = new ExternalRunTracker(path.join(os.tmpdir(), 'wf-tracker-missing', 'nope.log'));
    assert.strictEqual(await tracker.poll(), false);
  });

  test('run elapsed counts from the lock start time', () => {
    const startedAt = new Date(Date.now() - 90_000).toISOString();
    const tracker = new ExternalRunTracker('unused.log', startedAt);
    // Секунда запаса: между созданием и чтением может пройти тик.
    assert.match(tracker.state.getRunElapsed() ?? '', /^1m3[01]s$/);
  });

  test('concurrent polls share one read', async () => {
    const file = makeLog(stage('a', '12:00:00', '12:00:05', 'b'));
    try {
      const tracker = new ExternalRunTracker(file);
      const [first, second] = await Promise.all([tracker.poll(), tracker.poll()]);
      assert.strictEqual(first, true);
      assert.strictEqual(second, true);
      assert.strictEqual(tracker.state.getCompletedStages().length, 1, 'стадия не должна задвоиться');
    } finally {
      cleanup(file);
    }
  });

  test('stops reading after dispose', async () => {
    const file = makeLog(stage('a', '12:00:00', '12:00:05', 'b'));
    try {
      const tracker = new ExternalRunTracker(file);
      tracker.dispose();
      assert.strictEqual(await tracker.poll(), false);
      assert.strictEqual(tracker.state.getCompletedStages().length, 0);
    } finally {
      cleanup(file);
    }
  });
});
