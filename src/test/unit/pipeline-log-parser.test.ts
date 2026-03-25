/**
 * Unit tests for PipelineLogParser
 *
 * Tests:
 * - parse(): GOTO, START, RETRY, MOVE_TICKET, CREATE_REPORT patterns
 * - parse(): context ticket_id / plan_id extraction
 * - parse(): OUTPUT line extraction
 * - parseLegacy(): old [GOTO], [INFO], [CTX] format
 * - updateState(): state accumulation
 * - reset(): state cleanup
 * - Getters for all state fields
 */

import * as assert from 'assert';
import { PipelineLogParser } from '../../ui/pipeline-log-parser';

suite('PipelineLogParser', () => {
  let parser: PipelineLogParser;

  setup(() => {
    parser = new PipelineLogParser();
  });

  suite('parse() - GOTO pattern', () => {
    test('should parse standard GOTO with arrow format', () => {
      const line = '[2026-03-11T10:00:00] [INFO] [execute-task] GOTO execute-task → review-result status="default" params={"ticket_id":"IMPL-001","target":"review"}';
      const result = parser.parse(line);
      assert.strictEqual(result.isGoto, true);
      assert.strictEqual(result.gotoStage, 'review-result');
    });

    test('should parse GOTO with elapsed time', () => {
      const line = '[2026-03-11T10:00:00] [INFO] [execute-task] GOTO review-result (elapsed: 2m30s)';
      const result = parser.parse(line);
      assert.strictEqual(result.isGoto, true);
      assert.strictEqual(result.gotoStage, 'review-result');
      assert.strictEqual(result.elapsed, '2m30s');
    });

    test('should extract ticket_id from GOTO params', () => {
      const line = '[2026-03-11T10:00:00] [INFO] [execute-task] GOTO move-ticket → done status="passed" params={"ticket_id":"IMPL-042","target":"done"}';
      const result = parser.parse(line);
      assert.strictEqual(result.isGoto, true);
      assert.strictEqual(result.ticket, 'IMPL-042');
      assert.strictEqual(result.gotoTarget, 'done');
    });

    test('should ignore invalid ticket_id in params', () => {
      const line = '[2026-03-11T10:00:00] [INFO] [execute-task] GOTO done status="passed" params={"ticket_id":"invalid-id","target":"done"}';
      const result = parser.parse(line);
      assert.strictEqual(result.isGoto, true);
      assert.strictEqual(result.ticket, undefined);
    });

    test('isGoto=false for non-GOTO lines', () => {
      const line = '[2026-03-11T10:00:00] [INFO] [Runner] Some info message';
      const result = parser.parse(line);
      assert.strictEqual(result.isGoto, false);
    });
  });

  suite('parse() - START pattern', () => {
    test('should parse START with stage/agent/skill', () => {
      const line = '[2026-03-11T10:00:00] [INFO] [execute-task] START stage="execute-task" agent="qwen-code" skill="execute-task"';
      const result = parser.parse(line);
      assert.strictEqual(result.isStart, true);
      assert.strictEqual(result.stage, 'execute-task');
      assert.strictEqual(result.agent, 'qwen-code');
      assert.strictEqual(result.skill, 'execute-task');
    });

    test('should parse START with only agent', () => {
      const line = '[2026-03-11T10:00:00] [INFO] [execute-task] START agent="claude-sonnet"';
      const result = parser.parse(line);
      assert.strictEqual(result.isStart, true);
      assert.strictEqual(result.agent, 'claude-sonnet');
      assert.strictEqual(result.stage, undefined);
    });

    test('should not mark isStart=true for bare START without params', () => {
      const line = '[2026-03-11T10:00:00] [INFO] [execute-task] START';
      const result = parser.parse(line);
      assert.strictEqual(result.isStart, false);
    });
  });

  suite('parse() - RETRY pattern', () => {
    test('should parse RETRY with attempt info', () => {
      const line = '[2026-03-11T10:00:00] [INFO] [execute-task] RETRY stage="execute-task" attempt=2/5';
      const result = parser.parse(line);
      assert.strictEqual(result.isRetry, true);
      assert.strictEqual(result.stage, 'execute-task');
      assert.strictEqual(result.attempt, 2);
      assert.strictEqual(result.maxAttempts, 5);
    });
  });

  suite('parse() - MOVE_TICKET pattern', () => {
    test('should parse MOVE_TICKET with from/to status', () => {
      const line = '[2026-03-11T10:00:00] [INFO] [move-ticket] MOVE_TICKET ticket="IMPL-042" from="in-progress" to="review"';
      const result = parser.parse(line);
      assert.strictEqual(result.isMoveTicket, true);
      assert.strictEqual(result.ticket, 'IMPL-042');
      assert.strictEqual(result.statusTransition, 'in-progress → review');
    });

    test('should not repeat the same transition in history', () => {
      const line = '[2026-03-11T10:00:00] [INFO] [move-ticket] MOVE_TICKET ticket="IMPL-042" from="in-progress" to="review"';
      const data1 = parser.parse(line);
      const data2 = parser.parse(line);
      parser.updateState(data1);
      parser.updateState(data2);
      assert.strictEqual(parser.getTicketStatusHistory().length, 1);
    });
  });

  suite('parse() - CREATE_REPORT pattern', () => {
    test('should parse CREATE_REPORT with id and path', () => {
      const line = '[2026-03-11T10:00:00] [INFO] [create-report] CREATE_REPORT id="REPORT-001" path=".workflow/reports/REPORT-001.md"';
      const result = parser.parse(line);
      assert.strictEqual(result.isCreateReport, true);
      assert.ok(result.reportInfo);
      assert.strictEqual(result.reportInfo!.id, 'REPORT-001');
      assert.strictEqual(result.reportInfo!.path, '.workflow/reports/REPORT-001.md');
    });
  });

  suite('parse() - context extraction', () => {
    test('should extract ticket_id from context line', () => {
      const line = '[2026-03-11T10:00:00] [INFO] [Runner] ticket_id: IMPL-042';
      const result = parser.parse(line);
      assert.strictEqual(result.ticket, 'IMPL-042');
    });

    test('should extract plan_id from context line', () => {
      const line = '[2026-03-11T10:00:00] [INFO] [Runner] plan_id: PLAN-015';
      const result = parser.parse(line);
      assert.strictEqual(result.planId, 'PLAN-015');
    });
  });

  suite('parse() - OUTPUT lines', () => {
    test('should extract OUTPUT line content', () => {
      const line = '[2026-03-11T10:00:00] [INFO] [execute-task] OUTPUT: Task completed successfully';
      const result = parser.parse(line);
      assert.strictEqual(result.outputLine, 'Task completed successfully');
    });
  });

  suite('parse() - ANSI color stripping', () => {
    test('should strip ANSI escape codes before parsing', () => {
      const line = '\x1b[32m[2026-03-11T10:00:00] [INFO] [execute-task] OUTPUT: colored text\x1b[0m';
      const result = parser.parse(line);
      assert.strictEqual(result.outputLine, 'colored text');
    });
  });

  suite('parse() - ERROR pattern', () => {
    test('should parse ERROR with stage and message', () => {
      const line = '[2026-03-11T10:00:00] [ERROR] [execute-task] ERROR stage="execute-task" message="Agent process crashed"';
      const result = parser.parse(line);
      assert.strictEqual(result.isError, true);
      assert.strictEqual(result.stage, 'execute-task');
      assert.strictEqual(result.errorMessage, 'Agent process crashed');
    });

    test('isError=false for non-ERROR lines', () => {
      const line = '[2026-03-11T10:00:00] [INFO] [execute-task] GOTO review-result (elapsed: 2m)';
      const result = parser.parse(line);
      assert.strictEqual(result.isError, false);
    });
  });

  suite('parse() - TIMEOUT pattern', () => {
    test('should parse TIMEOUT with stage and seconds', () => {
      const line = '[2026-03-11T10:00:00] [ERROR] [execute-task] TIMEOUT stage="execute-task" after 120s';
      const result = parser.parse(line);
      assert.strictEqual(result.isTimeout, true);
      assert.strictEqual(result.stage, 'execute-task');
      assert.strictEqual(result.timeoutSeconds, 120);
    });

    test('isTimeout=false for non-TIMEOUT lines', () => {
      const line = '[2026-03-11T10:00:00] [INFO] [execute-task] OUTPUT: some text';
      const result = parser.parse(line);
      assert.strictEqual(result.isTimeout, false);
    });
  });

  suite('parse() - COMPLETE pattern', () => {
    test('should parse COMPLETE with stage, status and exitCode', () => {
      const line = '[2026-03-11T10:00:00] [INFO] [execute-task] COMPLETE stage="execute-task" status="success" exitCode=0';
      const result = parser.parse(line);
      assert.strictEqual(result.isComplete, true);
      assert.strictEqual(result.stage, 'execute-task');
      assert.strictEqual(result.completeStatus, 'success');
      assert.strictEqual(result.exitCode, 0);
    });

    test('should parse COMPLETE with non-zero exitCode', () => {
      const line = '[2026-03-11T10:00:00] [INFO] [execute-task] COMPLETE stage="execute-task" status="failed" exitCode=1';
      const result = parser.parse(line);
      assert.strictEqual(result.isComplete, true);
      assert.strictEqual(result.exitCode, 1);
    });
  });

  suite('parse() - non-matching lines', () => {
    test('should return empty result for non-matching log format', () => {
      const line = 'This is not a structured log line';
      const result = parser.parse(line);
      assert.strictEqual(result.isGoto, false);
      assert.strictEqual(result.isStart, false);
      assert.strictEqual(result.isRetry, false);
      assert.strictEqual(result.isMoveTicket, false);
      assert.strictEqual(result.isCreateReport, false);
      assert.strictEqual(result.isError, false);
      assert.strictEqual(result.isTimeout, false);
      assert.strictEqual(result.isComplete, false);
    });
  });

  suite('parseLegacy() - old format', () => {
    test('should parse [GOTO] legacy format', () => {
      const line = '[GOTO] review-result (elapsed: 1m15s)';
      const result = parser.parse(line);
      assert.strictEqual(result.isGoto, true);
      assert.strictEqual(result.gotoStage, 'review-result');
      assert.strictEqual(result.elapsed, '1m15s');
    });

    test('should parse [INFO] with agent and ticket', () => {
      const line = '[INFO] agent: qwen-code, ticket: IMPL-042, retry: 2/5';
      const result = parser.parse(line);
      assert.strictEqual(result.agent, 'qwen-code');
      assert.strictEqual(result.ticket, 'IMPL-042');
      assert.strictEqual(result.isRetry, true);
      assert.strictEqual(result.attempt, 2);
      assert.strictEqual(result.maxAttempts, 5);
    });

    test('should parse [CTX] skill line', () => {
      const line = '[CTX] skill: execute-task';
      const result = parser.parse(line);
      assert.strictEqual(result.skill, 'execute-task');
    });

    test('should parse OUTPUT in legacy format', () => {
      const line = 'Some output OUTPUT: task done';
      const result = parser.parse(line);
      assert.strictEqual(result.outputLine, 'task done');
    });

    test('should parse CREATE_REPORT in legacy format', () => {
      const line = 'CREATE_REPORT id="REPORT-001" path=".workflow/reports/REPORT-001.md"';
      const result = parser.parse(line);
      assert.ok(result.reportInfo);
      assert.strictEqual(result.reportInfo!.id, 'REPORT-001');
    });
  });

  suite('updateState()', () => {
    test('should update stage from GOTO data', () => {
      const data = parser.parse('[2026-03-11T10:00:00] [INFO] [execute-task] GOTO review-result (elapsed: 2m)');
      parser.updateState(data);
      assert.strictEqual(parser.getCurrentStage(), 'review-result');
      assert.strictEqual(parser.getElapsed(), '2m');
    });

    test('should update agent/skill/stage from START data', () => {
      const data = parser.parse('[2026-03-11T10:00:00] [INFO] [execute-task] START stage="execute-task" agent="qwen-code" skill="execute-task"');
      parser.updateState(data);
      assert.strictEqual(parser.getCurrentStage(), 'execute-task');
      assert.strictEqual(parser.getCurrentAgent(), 'qwen-code');
      assert.strictEqual(parser.getCurrentSkill(), 'execute-task');
    });

    test('should update attempt info from RETRY data', () => {
      const data = parser.parse('[2026-03-11T10:00:00] [INFO] [execute-task] RETRY stage="execute-task" attempt=3/5');
      parser.updateState(data);
      assert.strictEqual(parser.getCurrentAttempt(), 3);
      assert.strictEqual(parser.getCurrentMaxAttempts(), 5);
    });

    test('should update ticket from MOVE_TICKET data', () => {
      const data = parser.parse('[2026-03-11T10:00:00] [INFO] [move-ticket] MOVE_TICKET ticket="IMPL-001" from="ready" to="in-progress"');
      parser.updateState(data);
      assert.strictEqual(parser.getCurrentTicket(), 'IMPL-001');
    });

    test('should accumulate output lines', () => {
      const data1 = parser.parse('[2026-03-11T10:00:00] [INFO] [execute-task] OUTPUT: line 1');
      parser.updateState(data1);
      const data2 = parser.parse('[2026-03-11T10:00:01] [INFO] [execute-task] OUTPUT: line 2');
      parser.updateState(data2);
      assert.deepStrictEqual(parser.getCurrentOutputLines(), ['line 1', 'line 2']);
    });

    test('should update report info from CREATE_REPORT data', () => {
      const data = parser.parse('[2026-03-11T10:00:00] [INFO] [create-report] CREATE_REPORT id="RPT-001" path="reports/RPT-001.md"');
      parser.updateState(data);
      assert.ok(parser.getCurrentStageReport());
      assert.strictEqual(parser.getCurrentStageReport()!.id, 'RPT-001');
    });

    test('should update planId from plan_id context line', () => {
      const data = parser.parse('[2026-03-11T10:00:00] [INFO] [Runner] plan_id: PLAN-015');
      parser.updateState(data);
      assert.strictEqual(parser.getCurrentRunPlanId(), 'PLAN-015');
    });
  });

  suite('reset()', () => {
    test('should clear all state after reset', () => {
      // Populate state
      parser.updateState(parser.parse('[2026-03-11T10:00:00] [INFO] [execute-task] START stage="execute-task" agent="qwen-code" skill="execute-task"'));
      parser.updateState(parser.parse('[2026-03-11T10:00:00] [INFO] [move-ticket] MOVE_TICKET ticket="IMPL-001" from="ready" to="in-progress"'));
      parser.updateState(parser.parse('[2026-03-11T10:00:00] [INFO] [execute-task] OUTPUT: some output'));

      // Reset
      parser.reset();

      assert.strictEqual(parser.getCurrentStage(), undefined);
      assert.strictEqual(parser.getCurrentAgent(), undefined);
      assert.strictEqual(parser.getCurrentSkill(), undefined);
      assert.strictEqual(parser.getCurrentTicket(), undefined);
      assert.strictEqual(parser.getCurrentAttempt(), undefined);
      assert.strictEqual(parser.getCurrentMaxAttempts(), undefined);
      assert.strictEqual(parser.getElapsed(), undefined);
      assert.deepStrictEqual(parser.getTicketStatusHistory(), []);
      assert.deepStrictEqual(parser.getCurrentOutputLines(), []);
      assert.strictEqual(parser.getCurrentStageReport(), undefined);
      assert.strictEqual(parser.getCurrentRunPlanId(), undefined);
    });
  });

  suite('getTicketStatusHistory()', () => {
    test('should return immutable copy of history', () => {
      parser.parse('[2026-03-11T10:00:00] [INFO] [move-ticket] MOVE_TICKET ticket="IMPL-001" from="ready" to="in-progress"');
      const history = parser.getTicketStatusHistory();
      history.push('tampered');
      assert.strictEqual(parser.getTicketStatusHistory().length, 0); // not updated yet via updateState
    });

    test('should accumulate transitions through updateState', () => {
      const d1 = parser.parse('[2026-03-11T10:00:00] [INFO] [move-ticket] MOVE_TICKET ticket="IMPL-001" from="ready" to="in-progress"');
      parser.updateState(d1);
      const d2 = parser.parse('[2026-03-11T10:00:00] [INFO] [move-ticket] MOVE_TICKET ticket="IMPL-001" from="in-progress" to="review"');
      parser.updateState(d2);
      assert.strictEqual(parser.getTicketStatusHistory().length, 2);
    });
  });
});
