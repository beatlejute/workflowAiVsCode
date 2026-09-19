/**
 * Unit tests for PipelineService — Paused state transitions and manual-gate activation
 *
 * Tests:
 * - START manual-gate-human → state transitions to Paused
 * - manual-gate-activated event is emitted with stage and ticketId
 * - GOTO from manual-gate → state transitions back to Running
 * - Multiple START events emit multiple manual-gate-activated events
 */

import * as assert from 'assert';
import { EventEmitter } from 'events';
import { PipelineService, PipelineState } from '../../services/pipeline-service';

/**
 * Mock spawn function that doesn't actually spawn a process.
 * Just provides stubs for the event handlers.
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
 * Call private spawnWithFallback on a PipelineService instance
 */
function callSpawnWithFallback(
  service: PipelineService,
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv
): void {
  (service as any).spawnWithFallback(command, args, env);
}

suite('PipelineService — Paused State Transitions', () => {
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

  suite('Manual-gate activation (START manual-gate-human)', () => {
    test('should transition state from Running to Paused when START manual-gate-human is parsed', (done) => {
      let _stateChangeCount = 0;
      const stateChanges: PipelineState[] = [];

      service.on('stateChange', (state: PipelineState) => {
        stateChanges.push(state);
        _stateChangeCount++;
      });

      // Simulate pipeline running, then manual-gate activation
      callSpawnWithFallback(service, 'workflow', ['run'], process.env);

      // Simulate log output: first Running state, then START manual-gate
      const logLine = '[2026-04-30T10:00:00] [INFO] [Runner] START stage="manual-gate-human" agent="system" ticket="HUMAN-1"';
      mockSpawnHelper.simulateStdout(logLine + '\n');

      // Check state transitioned to Paused
      setTimeout(() => {
        assert.strictEqual(service.getState(), PipelineState.Paused);
        assert.ok(stateChanges.includes(PipelineState.Paused), 'Paused state should be in transitions');
        done();
      }, 50);
    });

    test('should emit manual-gate-activated event with stage and ticketId', (done) => {
      let eventFired = false;
      let eventData: { stage: string | undefined; ticketId: string | undefined } | null = null;

      service.onManualGateActivated((data) => {
        eventFired = true;
        eventData = data;
      });

      callSpawnWithFallback(service, 'workflow', ['run'], process.env);

      const logLine = '[2026-04-30T10:00:00] [INFO] [Runner] START stage="manual-gate-human" agent="system" ticket="HUMAN-1"';
      mockSpawnHelper.simulateStdout(logLine + '\n');

      setTimeout(() => {
        assert.ok(eventFired, 'manual-gate-activated event should be emitted');
        assert.ok(eventData, 'Event data should be present');
        assert.strictEqual(eventData!.stage, 'manual-gate-human');
        assert.strictEqual(eventData!.ticketId, 'HUMAN-1');
        done();
      }, 50);
    });

    test('should store currentManualGate and currentManualGateTicket', (done) => {
      service.onManualGateActivated(() => {
        // Trigger check after event
        setTimeout(() => {
          assert.strictEqual((service as any).currentManualGate, 'manual-gate-human');
          assert.strictEqual(service.getCurrentManualGateTicket(), 'HUMAN-1');
          done();
        }, 25);
      });

      callSpawnWithFallback(service, 'workflow', ['run'], process.env);

      const logLine = '[2026-04-30T10:00:00] [INFO] [Runner] START stage="manual-gate-human" agent="system" ticket="HUMAN-1"';
      mockSpawnHelper.simulateStdout(logLine + '\n');
    });
  });

  suite('Manual-gate exit (GOTO from manual-gate)', () => {
    test('should transition state back to Running when GOTO exits manual-gate', (done) => {
      const stateChanges: PipelineState[] = [];

      service.on('stateChange', (state: PipelineState) => {
        stateChanges.push(state);
      });

      callSpawnWithFallback(service, 'workflow', ['run'], process.env);

      // First, START manual-gate to enter Paused state
      const startLine = '[2026-04-30T10:00:00] [INFO] [Runner] START stage="manual-gate-human" agent="system" ticket="HUMAN-1"';
      mockSpawnHelper.simulateStdout(startLine + '\n');

      // Then GOTO to exit manual-gate
      const gotoLine = '[2026-04-30T10:00:01] [INFO] [manual-gate-human] GOTO manual-gate-human → pick-first-task status="approved"';
      mockSpawnHelper.simulateStdout(gotoLine + '\n');

      setTimeout(() => {
        assert.strictEqual(service.getState(), PipelineState.Running);
        assert.ok(stateChanges.includes(PipelineState.Paused), 'Should have transitioned to Paused');
        assert.ok(stateChanges.includes(PipelineState.Running), 'Should have transitioned back to Running');
        done();
      }, 50);
    });

    test('should clear currentManualGate and currentManualGateTicket on GOTO exit', (done) => {
      service.on('stateChange', () => {
        // Check after state changes
        if (service.getState() === PipelineState.Running) {
          setTimeout(() => {
            assert.strictEqual((service as any).currentManualGate, undefined);
            assert.strictEqual(service.getCurrentManualGateTicket(), undefined);
            done();
          }, 25);
        }
      });

      callSpawnWithFallback(service, 'workflow', ['run'], process.env);

      const startLine = '[2026-04-30T10:00:00] [INFO] [Runner] START stage="manual-gate-human" agent="system" ticket="HUMAN-1"';
      mockSpawnHelper.simulateStdout(startLine + '\n');

      const gotoLine = '[2026-04-30T10:00:01] [INFO] [manual-gate-human] GOTO manual-gate-human → pick-first-task status="approved"';
      mockSpawnHelper.simulateStdout(gotoLine + '\n');
    });
  });

  suite('Multiple manual-gate cycles', () => {
    test('should emit multiple manual-gate-activated events for sequential START manual-gate messages', (done) => {
      const eventDatas: Array<{ stage: string | undefined; ticketId: string | undefined }> = [];

      service.onManualGateActivated((data) => {
        eventDatas.push(data);
      });

      callSpawnWithFallback(service, 'workflow', ['run'], process.env);

      // First human-gate activation
      const startLine1 = '[2026-04-30T10:00:00] [INFO] [Runner] START stage="manual-gate-human" agent="system" ticket="HUMAN-1"';
      mockSpawnHelper.simulateStdout(startLine1 + '\n');

      setTimeout(() => {
        // GOTO to exit first gate
        const gotoLine1 = '[2026-04-30T10:00:01] [INFO] [manual-gate-human] GOTO manual-gate-human → pick-first-task status="approved"';
        mockSpawnHelper.simulateStdout(gotoLine1 + '\n');

        // Second human-gate activation
        const startLine2 = '[2026-04-30T10:00:02] [INFO] [Runner] START stage="manual-gate-human" agent="system" ticket="HUMAN-2"';
        mockSpawnHelper.simulateStdout(startLine2 + '\n');

        setTimeout(() => {
          assert.strictEqual(eventDatas.length, 2);
          assert.strictEqual(eventDatas[0].ticketId, 'HUMAN-1');
          assert.strictEqual(eventDatas[1].ticketId, 'HUMAN-2');
          done();
        }, 50);
      }, 50);
    });
  });

  suite('Edge cases', () => {
    test('should handle START without ticket field gracefully', (done) => {
      let eventFired = false;
      let eventData: { stage: string | undefined; ticketId: string | undefined } | null = null;

      service.onManualGateActivated((data) => {
        eventFired = true;
        eventData = data;
      });

      callSpawnWithFallback(service, 'workflow', ['run'], process.env);

      // START without ticket= field
      const logLine = '[2026-04-30T10:00:00] [INFO] [Runner] START stage="manual-gate-human" agent="system"';
      mockSpawnHelper.simulateStdout(logLine + '\n');

      setTimeout(() => {
        assert.ok(eventFired, 'Event should still be emitted');
        assert.strictEqual(eventData!.stage, 'manual-gate-human');
        assert.strictEqual(eventData!.ticketId, undefined);
        assert.strictEqual(service.getState(), PipelineState.Paused);
        done();
      }, 50);
    });

    test('should not transition to Paused for START without manual-gate prefix', (done) => {
      const stateChanges: PipelineState[] = [];

      service.on('stateChange', (state: PipelineState) => {
        stateChanges.push(state);
      });

      callSpawnWithFallback(service, 'workflow', ['run'], process.env);

      // START with regular stage name (not manual-gate)
      const logLine = '[2026-04-30T10:00:00] [INFO] [Runner] START stage="analyze-report" agent="system" ticket="IMPL-1"';
      mockSpawnHelper.simulateStdout(logLine + '\n');

      setTimeout(() => {
        assert.notStrictEqual(service.getState(), PipelineState.Paused);
        assert.ok(!stateChanges.includes(PipelineState.Paused));
        done();
      }, 50);
    });

    test('should handle GOTO from manual-gate-* even when not in Paused state gracefully', (done) => {
      callSpawnWithFallback(service, 'workflow', ['run'], process.env);

      // GOTO without prior START (shouldn't happen in practice, but test graceful handling)
      const gotoLine = '[2026-04-30T10:00:01] [INFO] [manual-gate-human] GOTO manual-gate-human → pick-first-task status="approved"';
      mockSpawnHelper.simulateStdout(gotoLine + '\n');

      setTimeout(() => {
        // Should not crash, state should remain as is
        assert.ok(service.getState() === PipelineState.Running || service.getState() === PipelineState.Idle);
        done();
      }, 50);
    });
  });
});
