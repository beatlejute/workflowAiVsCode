/**
 * ConfigManager Recurring Unit Tests
 *
 * Tests for recurring definitions loading in ConfigManager.
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigManager } from '../../data/config-manager';

suite('ConfigManager Recurring Suite', () => {

  let configManager: ConfigManager;
  let tempDir: string;

  setup(() => {
    configManager = new ConfigManager();
    tempDir = path.join(process.cwd(), 'tmp/test-config-recurring-' + Date.now());

    const configDir = path.join(tempDir, '.workflow', 'config');
    fs.mkdirSync(configDir, { recursive: true });
  });

  teardown(() => {
    configManager.clearCache();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  suite('loadRecurring()', () => {

    test('should return empty array when recurring.yaml does not exist', async () => {
      const definitions = await configManager.loadRecurring(tempDir);
      assert.deepStrictEqual(definitions, [], 'Should return empty array');
    });

    test('should load valid recurring.yaml', async () => {
      const recurringPath = path.join(tempDir, '.workflow', 'config', 'recurring.yaml');
      const yaml = require('js-yaml');
      const data = {
        definitions: [
          {
            id: 'rec-001',
            name: 'Test',
            enabled: true,
            entity_type: 'ticket',
            trigger: { type: 'cron', expression: '0 0 * * *' },
            template: { type: 'task', title_template: 'Daily {date}' },
            state: {
              last_triggered_at: null,
              next_trigger_at: null,
              instance_count: 0,
              last_instance_id: null,
              is_active_instance: false
            }
          }
        ]
      };
      fs.writeFileSync(recurringPath, yaml.dump(data), 'utf-8');

      const definitions = await configManager.loadRecurring(tempDir);

      assert.strictEqual(definitions.length, 1, 'Should load one definition');
      assert.strictEqual(definitions[0].id, 'rec-001', 'Should have correct id');
      assert.strictEqual(definitions[0].name, 'Test', 'Should have correct name');
    });

    test('should return cached definitions on subsequent calls', async () => {
      const recurringPath = path.join(tempDir, '.workflow', 'config', 'recurring.yaml');
      const yaml = require('js-yaml');
      const data = {
        definitions: [
          {
            id: 'rec-cache',
            name: 'Cached',
            enabled: true,
            entity_type: 'ticket',
            trigger: { type: 'cron', expression: '0 0 * * *' },
            template: { type: 'task', title_template: 'Test' },
            state: {
              last_triggered_at: null,
              next_trigger_at: null,
              instance_count: 0,
              last_instance_id: null,
              is_active_instance: false
            }
          }
        ]
      };
      fs.writeFileSync(recurringPath, yaml.dump(data), 'utf-8');

      const definitions1 = await configManager.loadRecurring(tempDir);
      const definitions2 = await configManager.loadRecurring(tempDir);

      assert.strictEqual(definitions1, definitions2, 'Should return same cached instance');
    });

    test('should throw error for invalid YAML', async () => {
      const recurringPath = path.join(tempDir, '.workflow', 'config', 'recurring.yaml');
      fs.writeFileSync(recurringPath, 'invalid: yaml: content:', 'utf-8');

      await assert.rejects(
        async () => await configManager.loadRecurring(tempDir),
        /Invalid YAML/
      );
    });
  });

  suite('getRecurring()', () => {

    test('should return null before loading', () => {
      const recurring = configManager.getRecurring();
      assert.strictEqual(recurring, null, 'Should return null before loading');
    });

    test('should return cached recurring after loadRecurring', async () => {
      const recurringPath = path.join(tempDir, '.workflow', 'config', 'recurring.yaml');
      const yaml = require('js-yaml');
      fs.writeFileSync(recurringPath, yaml.dump({ definitions: [] }), 'utf-8');

      await configManager.loadRecurring(tempDir);

      const recurring = configManager.getRecurring();
      assert.ok(recurring, 'Should return cached recurring');
      assert.ok(Array.isArray(recurring), 'Should be an array');
    });
  });

  suite('reload()', () => {

    test('should reload recurring definitions', async () => {
      const recurringPath = path.join(tempDir, '.workflow', 'config', 'recurring.yaml');
      const yaml = require('js-yaml');
      const data = { definitions: [{ id: 'rec-001', name: 'Test', enabled: true, entity_type: 'ticket', trigger: { type: 'cron', expression: '0 0 * * *' }, template: { type: 'task', title_template: 'Test' }, state: { last_triggered_at: null, next_trigger_at: null, instance_count: 0, last_instance_id: null, is_active_instance: false } }] };
      fs.writeFileSync(recurringPath, yaml.dump(data), 'utf-8');

      await configManager.loadRecurring(tempDir);

      await configManager.reload();

      const recurring = configManager.getRecurring();
      assert.ok(recurring, 'Should have recurring after reload');
    });
  });

  suite('clearCache()', () => {

    test('should clear cached recurring', async () => {
      const recurringPath = path.join(tempDir, '.workflow', 'config', 'recurring.yaml');
      const yaml = require('js-yaml');
      fs.writeFileSync(recurringPath, yaml.dump({ definitions: [] }), 'utf-8');

      await configManager.loadRecurring(tempDir);

      configManager.clearCache();

      const recurring = configManager.getRecurring();
      assert.strictEqual(recurring, null, 'Recurring should be cleared');
    });
  });
});
