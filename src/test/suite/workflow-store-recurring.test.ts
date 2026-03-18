/**
 * WorkflowStore Recurring Unit Tests
 *
 * Tests for recurring definitions in WorkflowStore.
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowStore } from '../../data/workflow-store';
import { RecurringDefinition } from '../../data/types';

suite('WorkflowStore Recurring Suite', () => {

  let store: WorkflowStore;
  let tempDir: string;

  setup(async () => {
    tempDir = path.join(process.cwd(), 'tmp/test-store-recurring-' + Date.now());

    const configDir = path.join(tempDir, 'config');
    const recurringConfigDir = path.join(tempDir, '.workflow', 'config');
    const ticketsBacklogDir = path.join(tempDir, 'tickets', 'backlog');
    const plansCurrentDir = path.join(tempDir, 'plans', 'current');
    const reportsDir = path.join(tempDir, 'reports');

    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(recurringConfigDir, { recursive: true });
    fs.mkdirSync(ticketsBacklogDir, { recursive: true });
    fs.mkdirSync(plansCurrentDir, { recursive: true });
    fs.mkdirSync(reportsDir, { recursive: true });

    const yaml = require('js-yaml');

    const configData = {
      version: '1.0',
      project: { name: 'Test Project', description: 'Test Description' },
      task_types: { IMPL: { description: 'Implementation', prefix: 'IMPL' } },
      priorities: { 1: 'Critical', 2: 'High' },
      statuses: { backlog: { description: 'Backlog', color: 'gray' } },
      condition_types: {},
      paths: {
        tickets: '.workflow/tickets',
        plans: '.workflow/plans',
        reports: '.workflow/reports',
        archive: '.workflow/archive'
      },
      reporting: { enabled: true, auto_generate: true }
    };
    fs.writeFileSync(path.join(configDir, 'config.yaml'), yaml.dump(configData), 'utf-8');

    const pipelineYaml = `pipeline:
  name: Test Pipeline
  version: "1.0"
  agents:
    default:
      command: node
      args: []
      workdir: .
  stages:
    entry:
      description: Entry stage
  entry: entry
  execution:
    max_steps: 100
    delay_between_stages: 1
    timeout_per_stage: 1800
    log_file: ".workflow/logs/pipeline.log"
`;
    fs.writeFileSync(path.join(configDir, 'pipeline.yaml'), pipelineYaml, 'utf-8');

    const recurringData: RecurringDefinition[] = [
      {
        id: 'rec-001',
        name: 'Daily Standup',
        enabled: true,
        entity_type: 'ticket',
        trigger: { type: 'cron', expression: '0 9 * * 1-5' },
        template: { type: 'task', title_template: 'Standup {date}' },
        state: {
          last_triggered_at: '2024-01-01T09:00:00Z',
          next_trigger_at: null,
          instance_count: 10,
          last_instance_id: 'TASK-010',
          is_active_instance: false
        }
      }
    ];
    fs.writeFileSync(path.join(recurringConfigDir, 'recurring.yaml'), yaml.dump({ definitions: recurringData }), 'utf-8');

    store = new WorkflowStore();
    await store.refresh(tempDir);
  });

  teardown(() => {
    store.dispose();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  suite('Recurring Definitions', () => {

    test('should load recurring definitions on refresh', () => {
      const definitions = store.getRecurringDefinitions();
      assert.strictEqual(definitions.length, 1, 'Should load one recurring definition');
      assert.strictEqual(definitions[0].id, 'rec-001', 'Should have correct id');
    });

    test('should get recurring definition by id', () => {
      const definitions = store.getRecurringDefinitions();
      const rec001 = definitions.find(d => d.id === 'rec-001');
      assert.ok(rec001, 'Should find rec-001');
      assert.strictEqual(rec001.name, 'Daily Standup', 'Should have correct name');
      assert.strictEqual(rec001.enabled, true, 'Should be enabled');
    });

    test('should have correct state in loaded definitions', () => {
      const definitions = store.getRecurringDefinitions();
      assert.strictEqual(definitions[0].state.instance_count, 10, 'Should have correct instance count');
      assert.strictEqual(definitions[0].state.last_instance_id, 'TASK-010', 'Should have correct last instance');
    });
  });

  suite('setRecurringDefinitions()', () => {

    test('should update recurring definitions', () => {
      const newDefinitions: RecurringDefinition[] = [
        {
          id: 'rec-new',
          name: 'New Recurring',
          enabled: false,
          entity_type: 'plan',
          trigger: { type: 'on-completion' },
          template: { type: 'plan', title_template: 'Weekly {n}' },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];

      store.setRecurringDefinitions(newDefinitions);

      const definitions = store.getRecurringDefinitions();
      assert.strictEqual(definitions.length, 1, 'Should have one definition');
      assert.strictEqual(definitions[0].id, 'rec-new', 'Should have new id');
    });

    test('should emit event when recurring definitions are updated', () => {
      let eventFired = false;
      store.onDidChange((event) => {
        if (event.type === 'recurring') {
          eventFired = true;
        }
      });

      store.setRecurringDefinitions([]);

      assert.strictEqual(eventFired, true, 'Event should be fired');
    });
  });

  suite('getStats() with recurring', () => {

    test('should include recurring definition count in stats', () => {
      const stats = store.getStats();
      assert.ok('recurringDefinitionCount' in stats, 'Stats should include recurringDefinitionCount');
      assert.strictEqual(stats.recurringDefinitionCount, 1, 'Should have one recurring definition');
    });
  });

  suite('clear() with recurring', () => {

    test('should clear recurring definitions on clear', () => {
      store.clear();

      const definitions = store.getRecurringDefinitions();
      assert.strictEqual(definitions.length, 0, 'Recurring definitions should be cleared');
    });
  });
});
