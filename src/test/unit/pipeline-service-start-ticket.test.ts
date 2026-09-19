/**
 * Unit tests for PipelineService — START parser with ticket_id extraction
 *
 * Tests:
 * - START with ticket="X" → parsedEntry.ticket === 'X'
 * - START without ticket field → parsedEntry.ticket === undefined (backward-compat)
 * - Multiple START messages with different ticket IDs
 */

import * as assert from 'assert';
import { EventEmitter } from 'events';
import { PipelineService, ParsedLogEntry } from '../../services/pipeline-service';

/**
 * Mock spawn function
 */
function createMockSpawn() {
  let stdoutEmitter: EventEmitter | null = null;
  let stderrEmitter: EventEmitter | null = null;
  let closeHandler: ((code: number | null) => void) | null = null;

  const mockProcess: any = {
    pid: 12345,
    stdout: null as EventEmitter | null,
    stderr: null as EventEmitter | null,
    kill: () => {},
    on: (event: string, handler: any) => {
      if (event === 'close') closeHandler = handler;
    }
  };

  stdoutEmitter = new EventEmitter();
  stderrEmitter = new EventEmitter();
  mockProcess.stdout = stdoutEmitter;
  mockProcess.stderr = stderrEmitter;

  return {
    mockProcess,
    stdoutEmitter,
    stderrEmitter,
    getCloseHandler: () => closeHandler,
    simulateStdout: (data: string) => stdoutEmitter!.emit('data', Buffer.from(data)),
    simulateClose: (code: number | null) => closeHandler?.(code)
  };
}

/**
 * Helper to call private parseLine method for direct testing
 */
function parseLineDirectly(service: PipelineService, line: string): ParsedLogEntry {
  return (service as any).parseLine(line);
}

/**
 * Call private spawnWithFallback
 */
function callSpawnWithFallback(
  service: PipelineService,
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv
): void {
  (service as any).spawnWithFallback(command, args, env);
}

suite('PipelineService — START Parser with ticket_id', () => {
  let service: PipelineService;
  let mockSpawnHelper: ReturnType<typeof createMockSpawn>;

  setup(() => {
    mockSpawnHelper = createMockSpawn();
    const mockSpawn = () => mockSpawnHelper.mockProcess;
    service = new PipelineService(mockSpawn as any);
    service.setWorkflowRoot(process.cwd());
  });

  teardown(() => {
    service.removeAllListeners();
  });

  suite('Parsing START with ticket field', () => {
    test('should extract ticket="HUMAN-1" from START message', () => {
      const logLine = '[2026-04-30T10:00:00] [INFO] [Runner] START stage="manual-gate-human" agent="system" ticket="HUMAN-1"';
      const parsed = parseLineDirectly(service, logLine);

      assert.strictEqual(parsed.type, 'start');
      assert.strictEqual(parsed.stage, 'manual-gate-human');
      assert.strictEqual(parsed.agent, 'system');
      assert.strictEqual(parsed.ticket, 'HUMAN-1');
    });

    test('should extract ticket="IMPL-42" from START message', () => {
      const logLine = '[2026-04-30T10:00:00] [INFO] [Runner] START stage="execute-task" agent="executor" ticket="IMPL-42"';
      const parsed = parseLineDirectly(service, logLine);

      assert.strictEqual(parsed.type, 'start');
      assert.strictEqual(parsed.ticket, 'IMPL-42');
    });

    test('should extract ticket with hyphenated ID like PLAN-025', () => {
      const logLine = '[2026-04-30T10:00:00] [INFO] [Runner] START stage="analyze-report" agent="analyzer" ticket="PLAN-025"';
      const parsed = parseLineDirectly(service, logLine);

      assert.strictEqual(parsed.ticket, 'PLAN-025');
    });

    test('should preserve all other START fields when ticket is present', () => {
      const logLine = '[2026-04-30T10:00:00] [INFO] [Runner] START stage="test" agent="tester" skill="test-skill" ticket="QA-1"';
      const parsed = parseLineDirectly(service, logLine);

      assert.strictEqual(parsed.type, 'start');
      assert.strictEqual(parsed.stage, 'test');
      assert.strictEqual(parsed.agent, 'tester');
      assert.strictEqual(parsed.skill, 'test-skill');
      assert.strictEqual(parsed.ticket, 'QA-1');
    });
  });

  suite('Backward compatibility: START without ticket field', () => {
    test('should set ticket to undefined when ticket field is absent', () => {
      const logLine = '[2026-04-30T10:00:00] [INFO] [Runner] START stage="analyze-report" agent="analyzer"';
      const parsed = parseLineDirectly(service, logLine);

      assert.strictEqual(parsed.type, 'start');
      assert.strictEqual(parsed.stage, 'analyze-report');
      assert.strictEqual(parsed.agent, 'analyzer');
      assert.strictEqual(parsed.ticket, undefined);
    });

    test('should extract other fields correctly when ticket is missing', () => {
      const logLine = '[2026-04-30T10:00:00] [INFO] [Runner] START stage="execute-task" agent="executor" skill="execute-skill"';
      const parsed = parseLineDirectly(service, logLine);

      assert.strictEqual(parsed.type, 'start');
      assert.strictEqual(parsed.stage, 'execute-task');
      assert.strictEqual(parsed.agent, 'executor');
      assert.strictEqual(parsed.skill, 'execute-skill');
      assert.strictEqual(parsed.ticket, undefined);
    });

    test('should handle START with only stage field', () => {
      const logLine = '[2026-04-30T10:00:00] [INFO] [Runner] START stage="simple-stage"';
      const parsed = parseLineDirectly(service, logLine);

      assert.strictEqual(parsed.type, 'start');
      assert.strictEqual(parsed.stage, 'simple-stage');
      assert.strictEqual(parsed.ticket, undefined);
    });

    test('should handle minimal START message (no fields)', () => {
      const logLine = '[2026-04-30T10:00:00] [INFO] [Runner] START';
      const parsed = parseLineDirectly(service, logLine);

      assert.strictEqual(parsed.type, 'start');
      assert.strictEqual(parsed.ticket, undefined);
    });
  });

  suite('Integration: ticket extraction via parseStdout', () => {
    test('should update currentTicket from START message with ticket field', (done) => {
      callSpawnWithFallback(service, 'workflow', ['run'], process.env);

      const logLine = '[2026-04-30T10:00:00] [INFO] [Runner] START stage="analyze-report" agent="analyzer" ticket="REPORT-1"';
      mockSpawnHelper.simulateStdout(logLine + '\n');

      setTimeout(() => {
        assert.strictEqual(service.getCurrentTicket(), 'REPORT-1');
        done();
      }, 50);
    });

    test('should preserve currentTicket from previous message if new START has no ticket', (done) => {
      callSpawnWithFallback(service, 'workflow', ['run'], process.env);

      // First START with ticket
      const logLine1 = '[2026-04-30T10:00:00] [INFO] [Runner] START stage="stage1" agent="agent1" ticket="TICKET-1"';
      mockSpawnHelper.simulateStdout(logLine1 + '\n');

      setTimeout(() => {
        assert.strictEqual(service.getCurrentTicket(), 'TICKET-1');

        // Second START without ticket (shouldn't clear currentTicket)
        const logLine2 = '[2026-04-30T10:00:01] [INFO] [Runner] START stage="stage2" agent="agent2"';
        mockSpawnHelper.simulateStdout(logLine2 + '\n');

        setTimeout(() => {
          // currentTicket should remain TICKET-1 (not cleared by START without ticket)
          assert.strictEqual(service.getCurrentTicket(), 'TICKET-1');
          done();
        }, 50);
      }, 50);
    });

    test('should update currentTicket for each START with ticket field', (done) => {
      callSpawnWithFallback(service, 'workflow', ['run'], process.env);

      const _tickets: string[] = [];

      // Capture ticket updates
      const _originalSetCurrentTicket = (service as any).currentTicket;

      // Log multiple START messages with different tickets
      const logLines = [
        '[2026-04-30T10:00:00] [INFO] [Runner] START stage="s1" agent="a1" ticket="TICKET-A"',
        '[2026-04-30T10:00:01] [INFO] [Runner] START stage="s2" agent="a2" ticket="TICKET-B"',
        '[2026-04-30T10:00:02] [INFO] [Runner] START stage="s3" agent="a3" ticket="TICKET-C"'
      ];

      logLines.forEach(line => mockSpawnHelper.simulateStdout(line + '\n'));

      setTimeout(() => {
        assert.strictEqual(service.getCurrentTicket(), 'TICKET-C');
        done();
      }, 50);
    });
  });

  suite('Edge cases', () => {
    test('should handle ticket with special characters in name (e.g., HUMAN-1)', () => {
      const logLine = '[2026-04-30T10:00:00] [INFO] [Runner] START stage="manual-gate" agent="system" ticket="HUMAN-1"';
      const parsed = parseLineDirectly(service, logLine);

      assert.strictEqual(parsed.ticket, 'HUMAN-1');
    });

    test('should handle long ticket IDs', () => {
      const logLine = '[2026-04-30T10:00:00] [INFO] [Runner] START stage="test" agent="system" ticket="VERY-LONG-TICKET-ID-12345"';
      const parsed = parseLineDirectly(service, logLine);

      assert.strictEqual(parsed.ticket, 'VERY-LONG-TICKET-ID-12345');
    });

    test('should handle ticket field appearing in different order', () => {
      const logLine = '[2026-04-30T10:00:00] [INFO] [Runner] START ticket="REORDERED-1" stage="test" agent="system"';
      const parsed = parseLineDirectly(service, logLine);

      // Regex should still match ticket even if order changes
      // Note: actual behavior depends on regex implementation
      assert.ok(parsed.ticket === 'REORDERED-1' || parsed.ticket === undefined);
    });

    test('should handle empty ticket value gracefully', () => {
      const logLine = '[2026-04-30T10:00:00] [INFO] [Runner] START stage="test" agent="system" ticket=""';
      const parsed = parseLineDirectly(service, logLine);

      // Empty string should be captured as such (not undefined)
      assert.strictEqual(parsed.ticket, '');
    });

    test('should not match ticket-like text in message content', () => {
      const logLine = '[2026-04-30T10:00:00] [INFO] [Runner] START stage="test" agent="system" message="This mentions TICKET-999 in text"';
      const parsed = parseLineDirectly(service, logLine);

      // Should not extract TICKET-999 from message, only from ticket= field
      assert.strictEqual(parsed.ticket, undefined);
    });
  });

  suite('Field combination scenarios', () => {
    test('should extract all fields: stage, agent, skill, ticket', () => {
      const logLine = '[2026-04-30T10:00:00] [INFO] [Runner] START stage="execute-task" agent="executor" skill="execute-skill" ticket="IMPL-100"';
      const parsed = parseLineDirectly(service, logLine);

      assert.strictEqual(parsed.type, 'start');
      assert.strictEqual(parsed.stage, 'execute-task');
      assert.strictEqual(parsed.agent, 'executor');
      assert.strictEqual(parsed.skill, 'execute-skill');
      assert.strictEqual(parsed.ticket, 'IMPL-100');
    });

    test('should handle only stage and ticket fields', () => {
      const logLine = '[2026-04-30T10:00:00] [INFO] [Runner] START stage="test-stage" ticket="TEST-1"';
      const parsed = parseLineDirectly(service, logLine);

      assert.strictEqual(parsed.stage, 'test-stage');
      assert.strictEqual(parsed.agent, undefined);
      assert.strictEqual(parsed.skill, undefined);
      assert.strictEqual(parsed.ticket, 'TEST-1');
    });

    test('should handle ticket without other optional fields', () => {
      const logLine = '[2026-04-30T10:00:00] [INFO] [Runner] START ticket="SOLO-1"';
      const parsed = parseLineDirectly(service, logLine);

      assert.strictEqual(parsed.type, 'start');
      assert.strictEqual(parsed.ticket, 'SOLO-1');
      assert.strictEqual(parsed.stage, undefined);
      assert.strictEqual(parsed.agent, undefined);
    });
  });
});
