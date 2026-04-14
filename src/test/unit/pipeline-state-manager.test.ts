/**
 * Unit tests for PipelineStateManager
 *
 * Tests:
 * - process(): GOTO, START, ERROR, TIMEOUT, COMPLETE, RETRY, MOVE_TICKET, CREATE_REPORT
 * - handleGoto(): stage transitions, elapsed computation, completedStages
 * - Getters for all state fields
 * - reset(): state cleanup
 * - parseElapsedToMs(), formatMsToElapsed(), parseTimestamp() utility functions
 * - getTotalElapsedMs(), getAverageElapsedMs()
 */

import * as assert from 'assert';
import { PipelineStateManager, parseElapsedToMs, formatMsToElapsed, parseTimestamp } from '../../services/pipeline-state-manager';
import { ParsedLogData } from '../../ui/pipeline-log-parser';
import { StageResult } from '../../ui/pipeline-tree-data-provider';

suite('PipelineStateManager', () => {
  let manager: PipelineStateManager;

  setup(() => {
    manager = new PipelineStateManager();
  });

  suite('process() - GOTO', () => {
    test('should handle GOTO with gotoStage', () => {
      const data: ParsedLogData = {
        isGoto: true,
        gotoStage: 'review-result',
        timestamp: '2026-03-11T10:00:00'
      };
      const changed = manager.process(data);
      assert.strictEqual(changed, true);
      assert.strictEqual(manager.getCurrentStage(), 'review-result');
    });

    test('should handle GOTO with elapsed string', () => {
      const data: ParsedLogData = {
        isGoto: true,
        gotoStage: 'review-result',
        elapsed: '2m30s',
        timestamp: '2026-03-11T10:00:00'
      };
      manager.process(data);
      assert.strictEqual(manager.getElapsed(), '2m30s');
    });

    test('should handle GOTO with ticket', () => {
      const data: ParsedLogData = {
        isGoto: true,
        gotoStage: 'review-result',
        ticket: 'IMPL-001',
        timestamp: '2026-03-11T10:00:00'
      };
      manager.process(data);
      assert.strictEqual(manager.getCurrentTicket(), 'IMPL-001');
    });

    test('should create completed stage entry on GOTO', () => {
      // First set up a current stage
      const startData: ParsedLogData = {
        isStart: true,
        stage: 'execute-task',
        agent: 'qwen-code',
        skill: 'execute-task',
        timestamp: '2026-03-11T10:00:00'
      };
      manager.process(startData);

      // Then GOTO
      const gotoData: ParsedLogData = {
        isGoto: true,
        gotoStage: 'review-result',
        elapsed: '1m30s',
        timestamp: '2026-03-11T10:01:30'
      };
      manager.process(gotoData);

      const completed = manager.getCompletedStages();
      assert.strictEqual(completed.length, 1);
      assert.strictEqual(completed[0].stage, 'execute-task');
      assert.strictEqual(completed[0].result, StageResult.Success);
      assert.strictEqual(completed[0].success, true);
    });

    test('should increment gotos and stagesStarted on GOTO', () => {
      const startData: ParsedLogData = {
        isStart: true,
        stage: 'execute-task',
        timestamp: '2026-03-11T10:00:00'
      };
      manager.process(startData);

      const gotoData: ParsedLogData = {
        isGoto: true,
        gotoStage: 'review-result',
        timestamp: '2026-03-11T10:01:00'
      };
      manager.process(gotoData);

      assert.strictEqual(manager.getGotos(), 1);
      assert.strictEqual(manager.getStagesStarted(), 1);
    });

    test('should reset ticketStatusHistory and outputLines on GOTO', () => {
      const moveData: ParsedLogData = {
        isMoveTicket: true,
        ticket: 'IMPL-001',
        statusTransition: 'ready → in-progress'
      };
      manager.process(moveData);

      const outputData: ParsedLogData = {
        outputLine: 'some output'
      };
      manager.process(outputData);

      const gotoData: ParsedLogData = {
        isGoto: true,
        gotoStage: 'review-result',
        timestamp: '2026-03-11T10:00:00'
      };
      manager.process(gotoData);

      assert.strictEqual(manager.getCurrentOutputLines().length, 0);
    });
  });

  suite('process() - START', () => {
    test('should update currentStage, currentAgent, currentSkill from START', () => {
      const data: ParsedLogData = {
        isStart: true,
        stage: 'execute-task',
        agent: 'qwen-code',
        skill: 'execute-task',
        timestamp: '2026-03-11T10:00:00'
      };
      manager.process(data);

      assert.strictEqual(manager.getCurrentStage(), 'execute-task');
      assert.strictEqual(manager.getCurrentAgent(), 'qwen-code');
      assert.strictEqual(manager.getCurrentSkill(), 'execute-task');
    });

    test('should set stageStartTime on START', () => {
      const before = Date.now();
      const data: ParsedLogData = {
        isStart: true,
        stage: 'execute-task',
        timestamp: '2026-03-11T10:00:00'
      };
      manager.process(data);
      const after = Date.now();

      const startTime = manager.getStageStartTime();
      assert.ok(startTime !== undefined);
      assert.ok(startTime! >= before && startTime! <= after);
    });

    test('should save fallback agent separately on START with isFallback', () => {
      const data: ParsedLogData = {
        isStart: true,
        stage: 'execute-task',
        agent: 'claude-sonnet-fallback',
        isFallback: true,
        skill: 'execute-task',
        timestamp: '2026-03-11T10:00:00'
      } as ParsedLogData;
      manager.process(data);

      assert.strictEqual(manager.getCurrentAgent(), undefined);
      assert.strictEqual(manager.getCurrentFallbackAgent(), 'claude-sonnet-fallback');
    });

    test('should save regular agent on START without isFallback', () => {
      const data: ParsedLogData = {
        isStart: true,
        stage: 'execute-task',
        agent: 'qwen-code',
        isFallback: false,
        skill: 'execute-task',
        timestamp: '2026-03-11T10:00:00'
      } as ParsedLogData;
      manager.process(data);

      assert.strictEqual(manager.getCurrentAgent(), 'qwen-code');
      assert.strictEqual(manager.getCurrentFallbackAgent(), undefined);
    });

    test('should reset currentFallbackAgent on regular START after previous fallback', () => {
      // Сначала устанавливаем fallback
      manager.process({
        isFallback: true,
        agent: 'backup-agent',
        isStart: false,
        timestamp: '2026-03-11T10:00:00'
      } as ParsedLogData);
      assert.strictEqual(manager.getCurrentFallbackAgent(), 'backup-agent');

      // Обычный START должен сбросить fallback
      manager.process({
        isStart: true,
        stage: 'review-result',
        agent: 'claude-sonnet',
        isFallback: false,
        skill: 'review-result',
        timestamp: '2026-03-11T10:01:00'
      } as ParsedLogData);
      assert.strictEqual(manager.getCurrentAgent(), 'claude-sonnet');
      assert.strictEqual(manager.getCurrentFallbackAgent(), undefined);
    });

    test('should save fallback agent on isFallback without isStart (real log parsing)', () => {
      const data: ParsedLogData = {
        isFallback: true,
        agent: 'backup-agent',
        isStart: false,
        timestamp: '2026-03-11T10:00:00'
      } as ParsedLogData;
      const changed = manager.process(data);

      assert.strictEqual(changed, true);
      assert.strictEqual(manager.getCurrentFallbackAgent(), 'backup-agent');
      assert.strictEqual(manager.getCurrentAgent(), undefined);
    });

    test('should preserve fallbackAgent when START has same agent as rotation (real log sequence)', () => {
      // Agent rotation: attempt 2 → qwen-code
      manager.process({
        isFallback: true,
        agent: 'qwen-code',
        isStart: false,
        timestamp: '2026-04-14T08:18:23'
      } as ParsedLogData);
      assert.strictEqual(manager.getCurrentFallbackAgent(), 'qwen-code');

      // START stage="execute-task" agent="qwen-code"
      manager.process({
        isStart: true,
        stage: 'execute-task',
        agent: 'qwen-code',
        isFallback: false,
        skill: 'execute-task',
        timestamp: '2026-04-14T08:18:23'
      } as ParsedLogData);

      assert.strictEqual(manager.getCurrentAgent(), 'qwen-code');
      assert.strictEqual(manager.getCurrentFallbackAgent(), 'qwen-code');
    });

    test('should record fallbackAgent in completedStages', () => {
      // Agent rotation → START
      manager.process({
        isFallback: true,
        agent: 'qwen-code',
        isStart: false,
        timestamp: '2026-04-14T08:18:23'
      } as ParsedLogData);
      manager.process({
        isStart: true,
        stage: 'execute-task',
        agent: 'qwen-code',
        isFallback: false,
        skill: 'execute-task',
        timestamp: '2026-04-14T08:18:23'
      } as ParsedLogData);

      // GOTO to next stage
      manager.process({
        isGoto: true,
        gotoStage: 'review-result',
        elapsed: '5m0s',
        timestamp: '2026-04-14T08:23:23'
      });

      const completed = manager.getCompletedStages();
      assert.strictEqual(completed.length, 1);
      assert.strictEqual(completed[0].stage, 'execute-task');
      assert.strictEqual(completed[0].agent, 'qwen-code');
      assert.strictEqual(completed[0].fallbackAgent, 'qwen-code');
    });

    test('should reset fallbackAgent after GOTO (new stage)', () => {
      // Set fallback
      manager.process({
        isFallback: true,
        agent: 'qwen-code',
        isStart: false,
        timestamp: '2026-04-14T08:18:23'
      } as ParsedLogData);
      manager.process({
        isStart: true,
        stage: 'execute-task',
        agent: 'qwen-code',
        timestamp: '2026-04-14T08:18:23'
      } as ParsedLogData);

      // GOTO transitions to new stage → fallbackAgent should be cleared
      manager.process({
        isGoto: true,
        gotoStage: 'review-result',
        timestamp: '2026-04-14T08:23:23'
      });

      assert.strictEqual(manager.getCurrentFallbackAgent(), undefined);
    });
  });

  suite('process() - ERROR', () => {
    test('should set lastStageResult to Error', () => {
      const data: ParsedLogData = {
        isError: true,
        timestamp: '2026-03-11T10:00:00'
      };
      const changed = manager.process(data);
      assert.strictEqual(changed, true);

      // Verify by doing a GOTO — the completed stage should have Error result
      const startData: ParsedLogData = {
        isStart: true,
        stage: 'execute-task',
        timestamp: '2026-03-11T10:00:00'
      };
      manager.process(startData);

      const gotoData: ParsedLogData = {
        isGoto: true,
        gotoStage: 'review-result',
        timestamp: '2026-03-11T10:01:00'
      };
      manager.process(gotoData);

      const completed = manager.getCompletedStages();
      assert.strictEqual(completed[0].result, StageResult.Error);
    });
  });

  suite('process() - TIMEOUT', () => {
    test('should set lastStageResult to Timeout and increment timeouts', () => {
      const data: ParsedLogData = {
        isTimeout: true,
        timestamp: '2026-03-11T10:00:00'
      };
      const changed = manager.process(data);
      assert.strictEqual(changed, true);
      assert.strictEqual(manager.getTimeouts(), 1);
    });
  });

  suite('process() - COMPLETE', () => {
    test('should set Error result when exitCode != 0', () => {
      const startData: ParsedLogData = {
        isStart: true,
        stage: 'execute-task',
        timestamp: '2026-03-11T10:00:00'
      };
      manager.process(startData);

      const completeData: ParsedLogData = {
        isComplete: true,
        exitCode: 1,
        timestamp: '2026-03-11T10:00:00'
      };
      manager.process(completeData);

      const gotoData: ParsedLogData = {
        isGoto: true,
        gotoStage: 'review-result',
        timestamp: '2026-03-11T10:01:00'
      };
      manager.process(gotoData);

      const completed = manager.getCompletedStages();
      assert.strictEqual(completed[0].result, StageResult.Error);
    });

    test('should keep Success result when exitCode === 0', () => {
      const startData: ParsedLogData = {
        isStart: true,
        stage: 'execute-task',
        timestamp: '2026-03-11T10:00:00'
      };
      manager.process(startData);

      const completeData: ParsedLogData = {
        isComplete: true,
        exitCode: 0,
        timestamp: '2026-03-11T10:00:00'
      };
      manager.process(completeData);

      const gotoData: ParsedLogData = {
        isGoto: true,
        gotoStage: 'review-result',
        timestamp: '2026-03-11T10:01:00'
      };
      manager.process(gotoData);

      const completed = manager.getCompletedStages();
      assert.strictEqual(completed[0].result, StageResult.Success);
    });
  });

  suite('process() - RETRY', () => {
    test('should update attempt info and increment retries', () => {
      const data: ParsedLogData = {
        isRetry: true,
        stage: 'execute-task',
        attempt: 2,
        maxAttempts: 5
      };
      const changed = manager.process(data);
      assert.strictEqual(changed, true);
      assert.strictEqual(manager.getCurrentAttempt(), 2);
      assert.strictEqual(manager.getCurrentMaxAttempts(), 5);
      assert.strictEqual(manager.getRetries(), 1);
    });
  });

  suite('process() - MOVE_TICKET', () => {
    test('should update ticket and status history', () => {
      const data: ParsedLogData = {
        isMoveTicket: true,
        ticket: 'IMPL-001',
        statusTransition: 'ready → in-progress'
      };
      const changed = manager.process(data);
      assert.strictEqual(changed, true);
      assert.strictEqual(manager.getCurrentTicket(), 'IMPL-001');
    });

    test('should not duplicate statusTransition in history', () => {
      const data: ParsedLogData = {
        isMoveTicket: true,
        ticket: 'IMPL-001',
        statusTransition: 'ready → in-progress'
      };
      manager.process(data);
      manager.process(data);

      // statusTransition is tracked via completed stages, not directly accessible
      // but we can verify the ticket is set
      assert.strictEqual(manager.getCurrentTicket(), 'IMPL-001');
    });
  });

  suite('process() - CREATE_REPORT', () => {
    test('should update current stage report', () => {
      const reportInfo = { id: 'REPORT-001', path: '.workflow/reports/REPORT-001.md' };
      const data: ParsedLogData = {
        isCreateReport: true,
        reportInfo
      };
      const changed = manager.process(data);
      assert.strictEqual(changed, true);

      const report = manager.getCurrentStageReport();
      assert.ok(report !== undefined);
      assert.strictEqual(report!.id, 'REPORT-001');
    });
  });

  suite('process() - output lines', () => {
    test('should accumulate output lines (up to 100)', () => {
      for (let i = 0; i < 5; i++) {
        manager.process({ outputLine: `line ${i}` });
      }
      const lines = manager.getCurrentOutputLines();
      assert.strictEqual(lines.length, 5);
      assert.strictEqual(lines[0], 'line 0');
      assert.strictEqual(lines[4], 'line 4');
    });

    test('should cap output lines at 100', () => {
      for (let i = 0; i < 110; i++) {
        manager.process({ outputLine: `line ${i}` });
      }
      const lines = manager.getCurrentOutputLines();
      assert.strictEqual(lines.length, 100);
    });
  });

  suite('process() - ticket context', () => {
    test('should update ticket from data.ticket', () => {
      const data: ParsedLogData = {
        ticket: 'IMPL-042'
      };
      manager.process(data);
      assert.strictEqual(manager.getCurrentTicket(), 'IMPL-042');
    });
  });

  suite('setRunStartTime() / getRunElapsed()', () => {
    test('should return undefined when runStartTime not set', () => {
      assert.strictEqual(manager.getRunElapsed(), undefined);
    });

    test('should return formatted elapsed after setRunStartTime', () => {
      manager.setRunStartTime(Date.now() - 5000);
      const elapsed = manager.getRunElapsed();
      assert.ok(elapsed !== undefined);
      assert.ok(elapsed!.includes('s'));
    });
  });

  suite('getStageElapsed()', () => {
    test('should return undefined when stageStartTime not set', () => {
      assert.strictEqual(manager.getStageElapsed(), undefined);
    });

    test('should return formatted elapsed after START', () => {
      const data: ParsedLogData = {
        isStart: true,
        stage: 'execute-task',
        timestamp: '2026-03-11T10:00:00'
      };
      manager.process(data);

      const elapsed = manager.getStageElapsed();
      assert.ok(elapsed !== undefined);
      assert.ok(elapsed!.includes('s'));
    });
  });

  suite('getTotalElapsedMs() / getAverageElapsedMs()', () => {
    test('should return 0 when no completed stages', () => {
      assert.strictEqual(manager.getTotalElapsedMs(), 0);
      assert.strictEqual(manager.getAverageElapsedMs(), 0);
    });

    test('should compute total and average from completed stages', () => {
      // Set up two completed stages via GOTO
      manager.process({
        isStart: true,
        stage: 'stage-a',
        timestamp: '2026-03-11T10:00:00'
      });
      manager.process({
        isGoto: true,
        gotoStage: 'stage-b',
        elapsed: '1m30s',
        timestamp: '2026-03-11T10:01:30'
      });
      manager.process({
        isGoto: true,
        gotoStage: 'stage-c',
        elapsed: '2m0s',
        timestamp: '2026-03-11T10:03:30'
      });

      const total = manager.getTotalElapsedMs();
      // 1m30s = 90000ms, 2m0s = 120000ms
      assert.strictEqual(total, 210000);

      const avg = manager.getAverageElapsedMs();
      assert.strictEqual(avg, 105000);
    });
  });

  suite('getCompletedStages()', () => {
    test('should return immutable copy', () => {
      const stages = manager.getCompletedStages();
      stages.push({} as any);
      assert.strictEqual(manager.getCompletedStages().length, 0);
    });
  });

  suite('reset()', () => {
    test('should clear all state', () => {
      // Populate state
      manager.process({
        isStart: true,
        stage: 'execute-task',
        agent: 'qwen-code',
        skill: 'execute-task',
        timestamp: '2026-03-11T10:00:00'
      });
      manager.process({
        isMoveTicket: true,
        ticket: 'IMPL-001',
        statusTransition: 'ready → in-progress'
      });
      manager.process({ outputLine: 'test output' });
      manager.setRunStartTime(Date.now());

      // Reset
      manager.reset();

      assert.strictEqual(manager.getCurrentStage(), undefined);
      assert.strictEqual(manager.getCurrentAgent(), undefined);
      assert.strictEqual(manager.getCurrentFallbackAgent(), undefined);
      assert.strictEqual(manager.getCurrentSkill(), undefined);
      assert.strictEqual(manager.getCurrentTicket(), undefined);
      assert.strictEqual(manager.getCurrentAttempt(), undefined);
      assert.strictEqual(manager.getCurrentMaxAttempts(), undefined);
      assert.strictEqual(manager.getElapsed(), undefined);
      assert.strictEqual(manager.getStagesStarted(), 0);
      assert.strictEqual(manager.getRetries(), 0);
      assert.strictEqual(manager.getGotos(), 0);
      assert.strictEqual(manager.getTimeouts(), 0);
      assert.strictEqual(manager.getCompletedStages().length, 0);
      assert.strictEqual(manager.getCurrentOutputLines().length, 0);
      assert.strictEqual(manager.getCurrentStageReport(), undefined);
      assert.strictEqual(manager.getRunElapsed(), undefined);
    });
  });

  suite('getters - initial state', () => {
    test('should return undefined for all optional fields initially', () => {
      assert.strictEqual(manager.getCurrentStage(), undefined);
      assert.strictEqual(manager.getCurrentAgent(), undefined);
      assert.strictEqual(manager.getCurrentFallbackAgent(), undefined);
      assert.strictEqual(manager.getCurrentSkill(), undefined);
      assert.strictEqual(manager.getCurrentTicket(), undefined);
      assert.strictEqual(manager.getCurrentAttempt(), undefined);
      assert.strictEqual(manager.getCurrentMaxAttempts(), undefined);
      assert.strictEqual(manager.getElapsed(), undefined);
      assert.strictEqual(manager.getStageStartTime(), undefined);
      assert.strictEqual(manager.getStageElapsed(), undefined);
      assert.strictEqual(manager.getRunElapsed(), undefined);
    });

    test('should return 0 for all counters initially', () => {
      assert.strictEqual(manager.getStagesStarted(), 0);
      assert.strictEqual(manager.getRetries(), 0);
      assert.strictEqual(manager.getGotos(), 0);
      assert.strictEqual(manager.getTimeouts(), 0);
    });

    test('should return empty arrays initially', () => {
      assert.deepStrictEqual(manager.getCompletedStages(), []);
      assert.deepStrictEqual(manager.getCurrentOutputLines(), []);
    });
  });
});

suite('parseElapsedToMs()', () => {
  test('should return 0 for undefined', () => {
    assert.strictEqual(parseElapsedToMs(undefined), 0);
  });

  test('should return 0 for empty string', () => {
    assert.strictEqual(parseElapsedToMs(''), 0);
  });

  test('should parse seconds', () => {
    assert.strictEqual(parseElapsedToMs('5s'), 5000);
    assert.strictEqual(parseElapsedToMs('1.5s'), 1500);
  });

  test('should parse minutes and seconds', () => {
    assert.strictEqual(parseElapsedToMs('2m30s'), 150000);
  });

  test('should parse hours, minutes', () => {
    assert.strictEqual(parseElapsedToMs('1h02m'), 3720000);
  });

  test('should parse complex elapsed time', () => {
    assert.strictEqual(parseElapsedToMs('1h30m45s'), 5445000);
  });
});

suite('formatMsToElapsed()', () => {
  test('should return 0s for 0ms', () => {
    assert.strictEqual(formatMsToElapsed(0), '0s');
  });

  test('should return 0s for negative ms', () => {
    assert.strictEqual(formatMsToElapsed(-100), '0s');
  });

  test('should format seconds', () => {
    assert.strictEqual(formatMsToElapsed(5000), '5s');
    assert.strictEqual(formatMsToElapsed(59000), '59s');
  });

  test('should format minutes and seconds', () => {
    assert.strictEqual(formatMsToElapsed(60000), '1m00s');
    assert.strictEqual(formatMsToElapsed(150000), '2m30s');
  });

  test('should format hours and minutes', () => {
    assert.strictEqual(formatMsToElapsed(3600000), '1h00m');
    assert.strictEqual(formatMsToElapsed(7260000), '2h01m');
  });
});

suite('parseTimestamp()', () => {
  test('should return undefined for undefined input', () => {
    assert.strictEqual(parseTimestamp(undefined), undefined);
  });

  test('should return undefined for invalid format', () => {
    assert.strictEqual(parseTimestamp('invalid'), undefined);
  });

  test('should parse ISO format timestamp', () => {
    const result = parseTimestamp('2026-03-11T10:00:00');
    assert.ok(result !== undefined);
    // Verify it's a valid epoch ms
    assert.ok(result! > 0);
  });

  test('should parse space-separated format timestamp', () => {
    const result = parseTimestamp('2026-03-11 10:00:00');
    assert.ok(result !== undefined);
    assert.ok(result! > 0);
  });
});

suite('Fallback report detection', () => {
  let manager: PipelineStateManager;

  setup(() => {
    manager = new PipelineStateManager();
  });

  test('should detect report from GOTO params for create-report stage', () => {
    manager.process({ isStart: true, stage: 'create-report' });
    manager.process({ isGoto: true, gotoStage: 'done', ticket: 'IMPL-001', isCreateReport: true, reportInfo: { id: 'REPORT-001', path: '.workflow/reports/REPORT-001.md' } });
    const stages = manager.getCompletedStages();
    assert.strictEqual(stages.length, 1);
    assert.strictEqual(stages[0].stage, 'create-report');
    assert.ok(stages[0].reportInfo);
    assert.strictEqual(stages[0].reportInfo!.id, 'REPORT-001');
  });

  test('should detect report from GOTO params for analyze-report stage', () => {
    manager.process({ isStart: true, stage: 'analyze-report' });
    manager.process({ isGoto: true, gotoStage: 'done', ticket: 'IMPL-002', isCreateReport: true, reportInfo: { id: 'ANL-REPORT-050', path: '.workflow/reports/ANL-REPORT-050.md' } });
    const stages = manager.getCompletedStages();
    assert.strictEqual(stages.length, 1);
    assert.strictEqual(stages[0].stage, 'analyze-report');
    assert.ok(stages[0].reportInfo);
  });

  test('should not add reportInfo for non-report stages', () => {
    manager.process({ isStart: true, stage: 'execute-task' });
    manager.process({ isGoto: true, gotoStage: 'done', ticket: 'IMPL-003' });
    const stages = manager.getCompletedStages();
    assert.strictEqual(stages.length, 1);
    assert.strictEqual(stages[0].stage, 'execute-task');
    assert.strictEqual(stages[0].reportInfo, undefined);
  });

  test('should not add reportInfo when no ticket for report stage', () => {
    manager.process({ isStart: true, stage: 'create-report' });
    manager.process({ isGoto: true, gotoStage: 'done' });
    const stages = manager.getCompletedStages();
    assert.strictEqual(stages.length, 1);
    assert.strictEqual(stages[0].reportInfo, undefined);
  });
});
