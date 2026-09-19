/**
 * Unit tests for working out how a finished external run ended.
 *
 * The lock disappearing says only that the runner exited: it is removed in a
 * `finally`, so a crash and a clean finish leave the same trace. Recording
 * every finished run as a success — which is what the first implementation did
 * — makes the history useless precisely when something went wrong.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readRunResult, readGateState } from '../../services/external-run-output';

function writeLog(lines: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-result-'));
  const file = path.join(dir, 'pipeline_2026-09-19_05-16-55.log');
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return file;
}

function cleanup(file: string): void {
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}

/** Tail of a log from a run that finished normally, as the runner writes it. */
const CLEAN_FINISH = [
  '[2026-09-19 06:40:00] [INFO] [PipelineRunner] Pipeline completed successfully!',
  '[2026-09-19 06:41:19] [INFO] [PipelineRunner] === Pipeline Runner Finished ===',
  '[2026-09-19 06:41:19] [INFO] [PipelineRunner] Total steps: 42',
  '[2026-09-19 06:41:19] [INFO] [PipelineRunner] Tasks executed: 7'
];

suite('readRunResult', () => {

  test('a clean finish is a success', () => {
    const file = writeLog(CLEAN_FINISH);
    try {
      assert.strictEqual(readRunResult(file), 'success');
    } finally {
      cleanup(file);
    }
  });

  test('hitting the step limit is "stopped", not a success', () => {
    const file = writeLog([
      '[2026-09-19 06:41:19] [ERROR] [PipelineRunner] Stopped: reached max steps limit (1500)',
      '[2026-09-19 06:41:19] [INFO] [PipelineRunner] === Pipeline Runner Finished ===',
      '[2026-09-19 06:41:19] [INFO] [PipelineRunner] Total steps: 1500'
    ]);
    try {
      assert.strictEqual(readRunResult(file), 'stopped');
    } finally {
      cleanup(file);
    }
  });

  test('a log without the finish marker is an error', () => {
    // Исключение, всплывшее из run(), обрывает лог на полуслове.
    const file = writeLog([
      '[2026-09-19 06:30:00] [INFO] [PipelineRunner] === Pipeline Runner Started ===',
      '[2026-09-19 06:35:00] [ERROR] [PipelineRunner] Error at stage "verify": ENOENT'
    ]);
    try {
      assert.strictEqual(readRunResult(file), 'error');
    } finally {
      cleanup(file);
    }
  });

  test('a finish marker without a success line is an error', () => {
    const file = writeLog([
      '[2026-09-19 06:40:00] [ERROR] [PipelineRunner] No error handler defined. Stopping.',
      '[2026-09-19 06:41:19] [INFO] [PipelineRunner] === Pipeline Runner Finished ===',
      '[2026-09-19 06:41:19] [INFO] [PipelineRunner] Total steps: 3'
    ]);
    try {
      assert.strictEqual(readRunResult(file), 'error');
    } finally {
      cleanup(file);
    }
  });

  test('no log at all is an error, not a success', () => {
    assert.strictEqual(readRunResult(undefined), 'error');
  });

  test('an unreadable log is an error rather than a throw', () => {
    assert.strictEqual(readRunResult('C:/nope/does-not-exist.log'), 'error');
  });

  test('the verdict comes from the tail, not from earlier noise', () => {
    // «Pipeline completed successfully!» из прошлого прогона в начале файла не
    // должно перебить настоящий исход в конце.
    const file = writeLog([
      '[2026-09-19 05:00:00] [INFO] [PipelineRunner] Pipeline completed successfully!',
      ...Array.from({ length: 300 }, (_, i) => `[2026-09-19 05:0${i % 10}:00] [INFO] [Stage] шаг ${i}`),
      '[2026-09-19 06:35:00] [ERROR] [PipelineRunner] Error at stage "verify": ENOENT'
    ]);
    try {
      assert.strictEqual(readRunResult(file), 'error');
    } finally {
      cleanup(file);
    }
  });
});

suite('readRunResult — only the runner speaks', () => {

  test("an agent echoing the success line is not the run's verdict", () => {
    // Раннер пишет в тот же лог промпты агентов и их вывод, а тикеты в этих
    // проектах цитируют ровно эти фразы.
    const file = writeLog([
      '[2026-09-19 06:30:00] [INFO] [PipelineRunner] === Pipeline Runner Started ===',
      '[2026-09-19 06:35:00] [INFO] [execute-task]   Pipeline completed successfully!',
      '[2026-09-19 06:36:00] [ERROR] [PipelineRunner] Error at stage "verify": ENOENT'
    ]);
    try {
      assert.strictEqual(readRunResult(file), 'error');
    } finally {
      cleanup(file);
    }
  });

  test('an error quoted in the final context does not overturn a success', () => {
    const file = writeLog([
      '[2026-09-19 06:40:00] [INFO] [PipelineRunner] Pipeline completed successfully!',
      '[2026-09-19 06:41:19] [INFO] [PipelineRunner] === Pipeline Runner Finished ===',
      '[2026-09-19 06:41:19] [INFO] [PipelineRunner] Final context: {"last_error":"Error at stage \\"verify\\""}'
    ]);
    try {
      // «Final context» — строка раннера, но это не вердикт; вердикт выше.
      assert.strictEqual(readRunResult(file), 'success');
    } finally {
      cleanup(file);
    }
  });
});

suite('readGateState', () => {

  test('a freshly created pending approval means waiting', () => {
    const file = writeLog([
      '[2026-09-19 06:30:00] [INFO] [manual-gate-human] [manual-gate-human] manual-gate: created pending approval at .workflow/approvals/QA-1_manual-gate-human_0.json'
    ]);
    try {
      const gate = readGateState(file);
      assert.strictEqual(gate.waiting, true);
      assert.strictEqual(gate.stepId, 'manual-gate-human');
    } finally {
      cleanup(file);
    }
  });

  test('a reused pending approval also means waiting', () => {
    // Раннер переиспользует файл после перезапуска — дата в approvals/ старше
    // запуска, и фильтр по ней пропустил бы это ожидание.
    const file = writeLog([
      '[2026-09-19 06:30:00] [INFO] [gate] [gate] manual-gate: reusing existing approval at .workflow/approvals/QA-1_gate_0.json (status=pending)'
    ]);
    try {
      assert.strictEqual(readGateState(file).waiting, true);
    } finally {
      cleanup(file);
    }
  });

  test('an approved gate is no longer waiting', () => {
    const file = writeLog([
      '[2026-09-19 06:30:00] [INFO] [gate] [gate] manual-gate: created pending approval at x.json',
      '[2026-09-19 06:40:00] [INFO] [gate] [gate] manual-gate: approved by human'
    ]);
    try {
      assert.strictEqual(readGateState(file).waiting, false);
    } finally {
      cleanup(file);
    }
  });

  test('a log without gates says nothing about waiting', () => {
    const file = writeLog(CLEAN_FINISH);
    try {
      assert.strictEqual(readGateState(file).waiting, false);
    } finally {
      cleanup(file);
    }
  });
});

suite('readGateState — only the runner speaks', () => {

  test("an agent's stderr echoing a whole runner line is not our gate", () => {
    // Форма взята из реального лога workflowAi
    // (pipeline_2026-05-01_07-13-25.log): агент прогонял тесты раннера, и его
    // stderr попал в лог целиком — вместе с чужим префиксом и ANSI-кодами.
    const file = writeLog([
      '[2026-09-19 06:30:00] [INFO] [PipelineRunner] === Pipeline Runner Started ===',
      '[2026-05-01 08:01:39] [WARN] [execute-task]   [36m[2026-05-01 07:58:03] [INFO] [gate] [gate] manual-gate: created pending approval at approvals/QA-1_gate_0.json'
    ]);
    try {
      // Двойной тег внутри строки есть, но сама строка — не от раннера.
      assert.strictEqual(readGateState(file).waiting, false);
    } finally {
      cleanup(file);
    }
  });

  test("an agent echoing a whole runner verdict line does not decide the run", () => {
    const file = writeLog([
      '[2026-05-01 08:01:39] [WARN] [execute-task]   [36m[2026-05-01 07:58:03] [INFO] [PipelineRunner] Pipeline completed successfully!',
      '[2026-09-19 06:36:00] [ERROR] [PipelineRunner] Error at stage "verify": ENOENT'
    ]);
    try {
      assert.strictEqual(readRunResult(file), 'error');
    } finally {
      cleanup(file);
    }
  });

  test('the runner writes the stage tag twice and that is what we match', () => {
    const file = writeLog([
      '[2026-09-19 06:30:00] [INFO] [approve] [approve] manual-gate: created pending approval at x.json'
    ]);
    try {
      const gate = readGateState(file);
      assert.strictEqual(gate.waiting, true);
      assert.strictEqual(gate.stepId, 'approve');
    } finally {
      cleanup(file);
    }
  });

  test('a long wait is still detected from the polling lines alone', () => {
    // При долгом ожидании отметка о создании approval уходит за окно хвоста.
    const file = writeLog([
      ...Array.from({ length: 500 }, (_, i) =>
        `[2026-09-19 07:${String(i % 60).padStart(2, '0')}:00] [DEBUG] [gate] [gate] manual-gate: polling, current status=pending`)
    ]);
    try {
      assert.strictEqual(readGateState(file).waiting, true);
    } finally {
      cleanup(file);
    }
  });
});
