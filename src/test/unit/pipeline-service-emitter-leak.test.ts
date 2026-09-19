/**
 * Unit tests for PipelineService EventEmitter listener lifecycle
 *
 * Tests:
 * - removeListener works correctly for onManualGateActivated
 * - Listener count does not grow unbounded with multiple subscribe/unsubscribe cycles
 * - Listeners are properly cleaned up
 */

import * as assert from 'assert';
import { PipelineService } from '../../services/pipeline-service';

suite('PipelineService - EventEmitter Listener Leak Detection', () => {
  let pipelineService: PipelineService;

  setup(() => {
    pipelineService = new PipelineService();
  });

  teardown(() => {
    // Clean up
    if (pipelineService) {
      (pipelineService as any).currentState = 'idle';
    }
  });

  suite('listener lifecycle', () => {
    test('onManualGateActivated listener can be subscribed and unsubscribed', (done) => {
      const callCounts: number[] = [];

      const listener = ({ _stage, _ticketId }: any) => {
        callCounts.push(1);
      };

      pipelineService.onManualGateActivated(listener);

      // Fire event - listener should be called
      (pipelineService as any).emit('manual-gate-activated', { stage: 'test', ticketId: 'TICKET-1' });
      assert.strictEqual(callCounts.length, 1, 'Listener should be called once');

      // Unsubscribe
      pipelineService.removeListener('manual-gate-activated', listener);

      // Fire event again - listener should not be called
      (pipelineService as any).emit('manual-gate-activated', { stage: 'test', ticketId: 'TICKET-2' });
      assert.strictEqual(callCounts.length, 1, 'Listener should not be called after unsubscribe');

      done();
    });

    test('multiple subscribe/unsubscribe cycles do not leak listeners', (done) => {
      const listeners: Array<(data: any) => void> = [];

      // Subscribe multiple times
      for (let i = 0; i < 10; i++) {
        const listener = ({ _stage, _ticketId }: any) => {
          // listener
        };
        listeners.push(listener);
        pipelineService.onManualGateActivated(listener);
      }

      // Check listener count before unsubscribing
      const listenerCountBefore = (pipelineService as any).listenerCount('manual-gate-activated');
      assert.strictEqual(listenerCountBefore, 10, 'Should have 10 listeners registered');

      // Unsubscribe half
      for (let i = 0; i < 5; i++) {
        pipelineService.removeListener('manual-gate-activated', listeners[i]);
      }

      const listenerCountAfter5Unsub = (pipelineService as any).listenerCount('manual-gate-activated');
      assert.strictEqual(listenerCountAfter5Unsub, 5, 'Should have 5 listeners after unsubscribing 5');

      // Unsubscribe the rest
      for (let i = 5; i < 10; i++) {
        pipelineService.removeListener('manual-gate-activated', listeners[i]);
      }

      const listenerCountAfterAll = (pipelineService as any).listenerCount('manual-gate-activated');
      assert.strictEqual(listenerCountAfterAll, 0, 'All listeners should be removed');

      done();
    });

    test('listener count does not grow unbounded with repeated subscribe/unsubscribe', (done) => {
      const maxCycles = 50;

      for (let cycle = 0; cycle < maxCycles; cycle++) {
        const listener = ({ _stage, _ticketId }: any) => {
          // listener
        };

        pipelineService.onManualGateActivated(listener);

        // Verify listener was added
        const count = (pipelineService as any).listenerCount('manual-gate-activated');
        assert.strictEqual(count, 1, `Listener count should be 1 after subscribe in cycle ${cycle}`);

        // Unsubscribe immediately
        pipelineService.removeListener('manual-gate-activated', listener);

        // Verify listener was removed
        const countAfter = (pipelineService as any).listenerCount('manual-gate-activated');
        assert.strictEqual(countAfter, 0, `Listener count should be 0 after unsubscribe in cycle ${cycle}`);
      }

      done();
    });

    test('onStateChange also properly handles subscribe/unsubscribe', (done) => {
      const callCounts: number[] = [];

      const listener = (_state: any) => {
        callCounts.push(1);
      };

      pipelineService.onStateChange(listener);

      // Fire event
      (pipelineService as any).emit('stateChange', 'state1');
      assert.strictEqual(callCounts.length, 1, 'Listener should be called');

      // Unsubscribe
      pipelineService.removeListener('stateChange', listener);

      // Fire event again
      (pipelineService as any).emit('stateChange', 'state2');
      assert.strictEqual(callCounts.length, 1, 'Listener should not be called after unsubscribe');

      done();
    });

    test('onLog listener cleanup also works correctly', (done) => {
      const logLines: string[] = [];

      const listener = (line: string) => {
        logLines.push(line);
      };

      pipelineService.onLog(listener);

      // Fire log event
      (pipelineService as any).emit('log', 'log line 1');
      assert.strictEqual(logLines.length, 1, 'Listener should be called');

      // Unsubscribe
      pipelineService.removeListener('log', listener);

      // Fire log event again
      (pipelineService as any).emit('log', 'log line 2');
      assert.strictEqual(logLines.length, 1, 'Listener should not be called after unsubscribe');

      done();
    });

    test('concurrent listeners do not interfere with unsubscribe', (done) => {
      const results: string[] = [];

      const listener1 = ({ _stage, _ticketId }: any) => {
        results.push('listener1');
      };

      const listener2 = ({ _stage, _ticketId }: any) => {
        results.push('listener2');
      };

      const listener3 = ({ _stage, _ticketId }: any) => {
        results.push('listener3');
      };

      pipelineService.onManualGateActivated(listener1);
      pipelineService.onManualGateActivated(listener2);
      pipelineService.onManualGateActivated(listener3);

      // Fire event - all listeners should be called
      (pipelineService as any).emit('manual-gate-activated', { stage: 'test', ticketId: 'T1' });
      assert.strictEqual(results.length, 3, 'All 3 listeners should be called');

      // Unsubscribe listener 2
      pipelineService.removeListener('manual-gate-activated', listener2);
      results.length = 0;

      // Fire event again - only 1 and 3 should be called
      (pipelineService as any).emit('manual-gate-activated', { stage: 'test', ticketId: 'T2' });
      assert.strictEqual(results.length, 2, 'Only 2 listeners should be called');
      assert.ok(results.includes('listener1'), 'Listener 1 should still be active');
      assert.ok(results.includes('listener3'), 'Listener 3 should still be active');
      assert.ok(!results.includes('listener2'), 'Listener 2 should be unsubscribed');

      pipelineService.removeListener('manual-gate-activated', listener1);
      pipelineService.removeListener('manual-gate-activated', listener3);

      done();
    });
  });
});
