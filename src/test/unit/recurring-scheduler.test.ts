/**
 * Unit tests for RecurringScheduler
 *
 * Tests:
 * - start/stop: Start and stop the scheduler
 * - tick: Check trigger every 60 seconds
 * - recovery: Recover missed cron triggers on startup
 * - reschedule: Update next_trigger_at for a specific definition
 * - dispose: Clean up resources
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { RecurringScheduler } from '../../services/RecurringScheduler';
import { IRecurringService } from '../../services/IRecurringService';
import { WorkflowStore } from '../../data/workflow-store';
import { RecurringDefinition, CronTrigger, RecurringState } from '../../data/types';

function createMockDefinition(overrides: Partial<RecurringDefinition> = {}): RecurringDefinition {
  const defaultState: RecurringState = {
    last_triggered_at: null,
    next_trigger_at: null,
    instance_count: 0,
    last_instance_id: null,
    is_active_instance: false
  };

  return {
    id: 'test-def-1',
    name: 'Test Definition',
    enabled: true,
    entity_type: 'ticket',
    trigger: {
      type: 'cron',
      expression: '0 * * * *'
    } as CronTrigger,
    template: {
      type: 'task',
      title_template: 'Test {date}',
      status: 'backlog',
      priority: 3,
      tags: ['test']
    },
    state: defaultState,
    ...overrides
  };
}

function createMockRecurringService(): any {
  return {
    loadDefinitions: sinon.stub().resolves([]),
    saveDefinitions: sinon.stub().resolves(),
    createInstance: sinon.stub().resolves({ id: 'test-ticket-1' } as any),
    enableDefinition: sinon.stub().resolves(),
    disableDefinition: sinon.stub().resolves(),
    deleteDefinition: sinon.stub().resolves(),
    handleTicketCompletion: sinon.stub().resolves(),
    handleFileEvent: sinon.stub().resolves(),
    dispose: sinon.stub()
  };
}

suite('RecurringScheduler Tests', () => {
  let scheduler: RecurringScheduler;
  let mockService: any;
  let clock: sinon.SinonFakeTimers;

  setup(() => {
    clock = sinon.useFakeTimers();
    mockService = createMockRecurringService();
    scheduler = new RecurringScheduler(mockService);
  });

  teardown(() => {
    scheduler.dispose();
    clock.restore();
  });

  suite('start/stop', () => {
    test('start sets isRunning to true', async () => {
      const definitions = [createMockDefinition()];
      await scheduler.start(definitions);
      assert.strictEqual((scheduler as any).isRunning, true);
    });

    test('stop sets isRunning to false', async () => {
      const definitions = [createMockDefinition()];
      await scheduler.start(definitions);
      scheduler.stop();
      assert.strictEqual((scheduler as any).isRunning, false);
    });

    test('start does nothing if already running', async () => {
      const definitions = [createMockDefinition()];
      await scheduler.start(definitions);
      await scheduler.start(definitions);
      assert.strictEqual((scheduler as any).isRunning, true);
    });
  });

  suite('tick', () => {
    test('tick triggers createInstance when next_trigger_at is in the past', async () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      const definition = createMockDefinition({
        state: {
          last_triggered_at: null,
          next_trigger_at: pastDate,
          instance_count: 0,
          last_instance_id: null,
          is_active_instance: false
        }
      });

      await scheduler.start([definition]);
      clock.tick(60000);

      assert.strictEqual(mockService.createInstance.called, true);
    });

    test('tick does not trigger when next_trigger_at is in the future', async () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString();
      const definition = createMockDefinition({
        state: {
          last_triggered_at: null,
          next_trigger_at: futureDate,
          instance_count: 0,
          last_instance_id: null,
          is_active_instance: false
        }
      });

      await scheduler.start([definition]);
      clock.tick(60000);

      assert.strictEqual(mockService.createInstance.called, false);
    });

    test('tick does not trigger disabled definitions', async () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      const definition = createMockDefinition({
        enabled: false,
        state: {
          last_triggered_at: null,
          next_trigger_at: pastDate,
          instance_count: 0,
          last_instance_id: null,
          is_active_instance: false
        }
      });

      await scheduler.start([definition]);
      clock.tick(60000);

      assert.strictEqual(mockService.createInstance.called, false);
    });

    test('tick calculates next_trigger_at after trigger', async () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      const definition = createMockDefinition({
        state: {
          last_triggered_at: null,
          next_trigger_at: pastDate,
          instance_count: 0,
          last_instance_id: null,
          is_active_instance: false
        }
      });

      await scheduler.start([definition]);
      clock.tick(60000);

      assert.strictEqual(mockService.saveDefinitions.called, true);
    });
  });

  suite('recovery', () => {
    test('recovery triggers missed triggers on startup', async () => {
      const pastDate = new Date(Date.now() - 7200000).toISOString();
      const definition = createMockDefinition({
        state: {
          last_triggered_at: null,
          next_trigger_at: pastDate,
          instance_count: 0,
          last_instance_id: null,
          is_active_instance: false
        }
      });

      await scheduler.start([definition]);

      assert.strictEqual(mockService.createInstance.called, true);
    });

    test('recovery calculates next_trigger_at for definitions without it', async () => {
      const definition = createMockDefinition({
        state: {
          last_triggered_at: null,
          next_trigger_at: null,
          instance_count: 0,
          last_instance_id: null,
          is_active_instance: false
        }
      });

      await scheduler.start([definition]);

      assert.strictEqual(mockService.saveDefinitions.called, true);
    });

    test('recovery skips non-cron triggers', async () => {
      const definition = createMockDefinition({
        trigger: {
          type: 'on-completion',
          target_entity_id: 'test'
        } as any,
        state: {
          last_triggered_at: null,
          next_trigger_at: new Date(Date.now() - 3600000).toISOString(),
          instance_count: 0,
          last_instance_id: null,
          is_active_instance: false
        }
      });

      await scheduler.start([definition]);

      assert.strictEqual(mockService.createInstance.called, false);
    });
  });

  suite('reschedule', () => {
    test('reschedule recalculates next_trigger_at for specific definition', async () => {
      const definition = createMockDefinition();
      await scheduler.start([definition]);

      mockService.saveDefinitions.resetHistory();
      await scheduler.reschedule('test-def-1');

      assert.strictEqual(mockService.saveDefinitions.called, true);
    });

    test('reschedule does nothing for unknown definition', async () => {
      const definition = createMockDefinition();
      await scheduler.start([definition]);

      mockService.saveDefinitions.resetHistory();
      await scheduler.reschedule('unknown-def');

      assert.strictEqual(mockService.saveDefinitions.called, false);
    });
  });

  suite('dispose', () => {
    test('dispose stops the interval', async () => {
      const definitions = [createMockDefinition()];
      await scheduler.start(definitions);

      scheduler.dispose();

      assert.strictEqual((scheduler as any).intervalId, null);
      assert.strictEqual((scheduler as any).isRunning, false);
    });

    test('dispose clears definitions', async () => {
      const definitions = [createMockDefinition()];
      await scheduler.start(definitions);

      scheduler.dispose();

      assert.strictEqual((scheduler as any).definitions.length, 0);
    });
  });

  suite('handleRecurringReload', () => {
    test('should restart scheduler with new definitions from store', async () => {
      const store = new WorkflowStore();
      const initialDefinitions = [createMockDefinition({ id: 'initial-def' })];
      store.setRecurringDefinitions(initialDefinitions);

      const newScheduler = new RecurringScheduler(mockService, store);

      await newScheduler.start(initialDefinitions);

      const isRunningBefore = (newScheduler as any).isRunning;
      assert.strictEqual(isRunningBefore, true);

      const definitionsBefore = (newScheduler as any).definitions.map((d: RecurringDefinition) => d.id);
      assert.deepStrictEqual(definitionsBefore, ['initial-def']);

      store.setRecurringDefinitions([createMockDefinition({ id: 'reloaded-def' })]);

      await clock.tickAsync(50);

      const definitionsAfter = (newScheduler as any).definitions.map((d: RecurringDefinition) => d.id);
      assert.deepStrictEqual(definitionsAfter, ['reloaded-def']);

      newScheduler.dispose();
    });

    test('should recalculate next_trigger_at for cron definitions on reload', async () => {
      const store = new WorkflowStore();
      const newDefinitions = [createMockDefinition({ id: 'cron-def' })];
      store.setRecurringDefinitions(newDefinitions);

      const newScheduler = new RecurringScheduler(mockService, store);

      await newScheduler.start(newDefinitions);

      mockService.saveDefinitions.resetHistory();

      store.setRecurringDefinitions(newDefinitions);

      await clock.tickAsync(50);

      assert.strictEqual(mockService.saveDefinitions.called, true, 'saveDefinitions should be called to recalculate next_trigger_at');

      newScheduler.dispose();
    });

    test('should handle empty definitions on reload', async () => {
      const store = new WorkflowStore();
      const initialDefinitions = [createMockDefinition()];
      store.setRecurringDefinitions(initialDefinitions);

      const newScheduler = new RecurringScheduler(mockService, store);
      await newScheduler.start(initialDefinitions);

      const isRunningBefore = (newScheduler as any).isRunning;
      assert.strictEqual(isRunningBefore, true);

      store.setRecurringDefinitions([]);

      await clock.tickAsync(50);

      const definitionsAfter = (newScheduler as any).definitions;
      assert.strictEqual(definitionsAfter.length, 0, 'definitions should be empty after reload with empty array');

      newScheduler.dispose();
    });

    test('should stop interval before reloading definitions', async () => {
      const store = new WorkflowStore();
      const definitions = [createMockDefinition({ id: 'test-def' })];
      store.setRecurringDefinitions(definitions);

      const newScheduler = new RecurringScheduler(mockService, store);
      await newScheduler.start(definitions);

      const intervalIdBefore = (newScheduler as any).intervalId;
      assert.notStrictEqual(intervalIdBefore, null, 'interval should be running before reload');

      store.setRecurringDefinitions([createMockDefinition({ id: 'new-def' })]);

      await clock.tickAsync(50);

      const intervalIdAfter = (newScheduler as any).intervalId;
      assert.notStrictEqual(intervalIdAfter, null, 'interval should be restarted after reload');

      newScheduler.dispose();
    });

    test('should handle error when calculating next_trigger fails', async () => {
      const store = new WorkflowStore();
      const definition = createMockDefinition({
        id: 'invalid-cron-def',
        trigger: {
          type: 'cron',
          expression: 'invalid-expression'
        } as CronTrigger
      });
      store.setRecurringDefinitions([definition]);

      const newScheduler = new RecurringScheduler(mockService, store);

      await newScheduler.start([definition]);

      store.setRecurringDefinitions([definition]);

      await clock.tickAsync(50);

      const isRunning = (newScheduler as any).isRunning;
      assert.strictEqual(isRunning, true, 'scheduler should still be running despite error');

      newScheduler.dispose();
    });
  });
});
