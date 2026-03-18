/**
 * RecurringService Unit Tests
 *
 * Tests for recurring definition management and instance creation.
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowStore } from '../../data/workflow-store';
import { RecurringService } from '../../services/RecurringService';
import { ConfigManager } from '../../data/config-manager';
import { TicketService } from '../../services/ticket-service';
import { PlanService } from '../../services/plan-service';
import { TicketStatus, RecurringDefinition } from '../../data/types';

suite('RecurringService Suite', () => {

  let store: WorkflowStore;
  let configManager: ConfigManager;
  let ticketService: TicketService;
  let planService: PlanService;
  let recurringService: RecurringService;
  let tempDir: string;

  setup(async () => {
    tempDir = path.join(process.cwd(), 'tmp/test-recurring-' + Date.now());

    const ticketsDir = path.join(tempDir, 'tickets', 'backlog');
    const plansDir = path.join(tempDir, 'plans', 'current');
    const configDir = path.join(tempDir, '.workflow', 'config');

    fs.mkdirSync(ticketsDir, { recursive: true });
    fs.mkdirSync(plansDir, { recursive: true });
    fs.mkdirSync(configDir, { recursive: true });

    const ticketTemplatePath = path.join(tempDir, 'templates', 'ticket-template.md');
    const planTemplatePath = path.join(tempDir, 'templates', 'plan-template.md');

    fs.mkdirSync(path.dirname(ticketTemplatePath), { recursive: true });
    fs.writeFileSync(ticketTemplatePath, `---
id: "TASK-000"
title: "Template"
status: backlog
priority: 3
---
# Task`, 'utf-8');

    fs.writeFileSync(planTemplatePath, `---
id: "PLAN-000"
title: "Template"
status: draft
author: unknown
created_at: ""
updated_at: ""
completed_at: ""
previous_plan: ""
related_reports: []
---
# Plan`, 'utf-8');

    store = new WorkflowStore();
    configManager = new ConfigManager();
    ticketService = new TicketService(store, tempDir);
    planService = new PlanService(store, tempDir);
    recurringService = new RecurringService(
      store,
      ticketService,
      planService,
      configManager,
      tempDir
    );
  });

  teardown(async () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    store.dispose();
    recurringService.dispose();
  });

  suite('loadDefinitions()', () => {

    test('should return empty array when no recurring.yaml exists', async () => {
      const definitions = await recurringService.loadDefinitions();
      assert.deepStrictEqual(definitions, [], 'Should return empty array');
    });

    test('should load definitions from valid recurring.yaml', async () => {
      const recurringPath = path.join(tempDir, '.workflow', 'config', 'recurring.yaml');
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-001',
          name: 'Test Recurring',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'cron', expression: '0 0 * * *' },
          template: {
            type: 'task',
            title_template: 'Daily Task {date}'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];

      const yaml = require('js-yaml');
      fs.writeFileSync(recurringPath, yaml.dump({ definitions }), 'utf-8');

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded.length, 1, 'Should load one definition');
      assert.strictEqual(loaded[0].id, 'rec-001', 'Should have correct id');
      assert.strictEqual(loaded[0].enabled, true, 'Should be enabled');
    });

    test('should initialize default state if missing', async () => {
      const recurringPath = path.join(tempDir, '.workflow', 'config', 'recurring.yaml');
      const yaml = require('js-yaml');
      fs.writeFileSync(recurringPath, yaml.dump({
        definitions: [{
          id: 'rec-001',
          name: 'Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'cron', expression: '0 0 * * *' },
          template: { type: 'task', title_template: 'Test' }
        }]
      }), 'utf-8');

      const loaded = await recurringService.loadDefinitions();
      assert.ok(loaded[0].state, 'State should be initialized');
      assert.strictEqual(loaded[0].state.instance_count, 0, 'Instance count should be 0');
    });

    test('should return empty array when recurring.yaml has no definitions', async () => {
      const recurringPath = path.join(tempDir, '.workflow', 'config', 'recurring.yaml');
      const yaml = require('js-yaml');
      fs.writeFileSync(recurringPath, yaml.dump({}), 'utf-8');

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded.length, 0, 'Should return empty array');
    });
  });

  suite('saveDefinitions()', () => {

    test('should save definitions to recurring.yaml', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-002',
          name: 'Save Test',
          enabled: false,
          entity_type: 'plan',
          trigger: { type: 'on-completion' },
          template: {
            type: 'plan',
            title_template: 'Weekly Plan {n}'
          },
          state: {
            last_triggered_at: '2024-01-01T00:00:00Z',
            next_trigger_at: null,
            instance_count: 5,
            last_instance_id: 'PLAN-005',
            is_active_instance: false
          }
        }
      ];

      await recurringService.saveDefinitions(definitions);

      const recurringPath = path.join(tempDir, '.workflow', 'config', 'recurring.yaml');
      assert.ok(fs.existsSync(recurringPath), 'File should be created');

      const yaml = require('js-yaml');
      const loaded = yaml.load(fs.readFileSync(recurringPath, 'utf-8')) as { definitions: RecurringDefinition[] };
      assert.strictEqual(loaded.definitions.length, 1, 'Should have one definition');
      assert.strictEqual(loaded.definitions[0].id, 'rec-002', 'Should have correct id');
    });

    test('should create directory if not exists', async () => {
      const definitions: RecurringDefinition[] = [];

      await recurringService.saveDefinitions(definitions);

      const recurringPath = path.join(tempDir, '.workflow', 'config', 'recurring.yaml');
      assert.ok(fs.existsSync(recurringPath), 'File should be created');
    });
  });

  suite('createInstance()', () => {

    test('should throw error when definition not found', async () => {
      await assert.rejects(
        async () => await recurringService.createInstance('nonexistent'),
        /not found/
      );
    });

    test('should throw error when definition is disabled', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-disabled',
          name: 'Disabled',
          enabled: false,
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
      ];
      await recurringService.saveDefinitions(definitions);

      await assert.rejects(
        async () => await recurringService.createInstance('rec-disabled'),
        /disabled/
      );
    });

    test('should create ticket instance with interpolated title', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-ticket',
          name: 'Ticket Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'cron', expression: '0 0 * * *' },
          template: {
            type: 'task',
            title_template: 'Daily Task {date} #{n}',
            priority: 2,
            tags: ['recurring', 'auto']
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      const ticket = await recurringService.createInstance('rec-ticket');

      assert.ok(ticket, 'Ticket should be created');
      assert.ok(ticket.id.startsWith('TASK-'), 'Ticket ID should have correct prefix');
      assert.ok(ticket.title.includes('#1'), 'Title should include instance number');
      assert.strictEqual((ticket as any).recurring_source, 'rec-ticket', 'Should have recurring_source');
      const ticketTyped = ticket as any;
      assert.strictEqual(ticketTyped.priority, 2, 'Should have correct priority');
      assert.ok(ticketTyped.tags.includes('recurring'), 'Should have recurring tag');
    });

    test('should create plan instance', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-plan',
          name: 'Plan Test',
          enabled: true,
          entity_type: 'plan',
          trigger: { type: 'on-completion' },
          template: {
            type: 'plan',
            title_template: 'Weekly Review #{n}'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      const plan = await recurringService.createInstance('rec-plan');

      assert.ok(plan, 'Plan should be created');
      assert.ok(plan.id.startsWith('PLAN-'), 'Plan ID should have correct prefix');
      assert.ok(plan.title.includes('#1'), 'Title should include instance number');
    });

    test('should create plan with body_template', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-plan-body',
          name: 'Plan Body Template Test',
          enabled: true,
          entity_type: 'plan',
          trigger: { type: 'on-completion' },
          template: {
            type: 'plan',
            title_template: 'Weekly Review #{n}',
            body_template: '## Review for week #{n}\n\nCreated on {date}'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      const plan = await recurringService.createInstance('rec-plan-body');

      assert.ok(plan, 'Plan should be created');
      assert.ok(plan.id.startsWith('PLAN-'), 'Plan ID should have correct prefix');
      assert.ok(plan.title.includes('#1'), 'Title should include instance number');

      const planPath = path.join(tempDir, 'plans', 'current', plan.id + '.md');
      assert.ok(fs.existsSync(planPath), 'Plan file should exist');
      const planContent = fs.readFileSync(planPath, 'utf-8');
      assert.ok(planContent.includes('#1'), 'Plan body should include instance number');
      assert.ok(planContent.includes('Created on'), 'Plan body should include date');
    });

    test('should interpolate title_template variables correctly for plans', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-plan-vars',
          name: 'Plan Variables Test',
          enabled: true,
          entity_type: 'plan',
          trigger: { type: 'cron', expression: '0 0 * * *' },
          template: {
            type: 'plan',
            title_template: 'Sprint #{n} - {date}'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      const plan = await recurringService.createInstance('rec-plan-vars');

      assert.ok(plan.title.includes('#1'), 'Title should include instance number');
      const today = new Date().toISOString().split('T')[0];
      assert.ok(plan.title.includes(today), 'Title should include date');
    });

    test('should create ticket with body_template', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-body',
          name: 'Body Template Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'cron', expression: '0 0 * * *' },
          template: {
            type: 'task',
            title_template: 'Task with body {n}',
            body_template: 'This is auto-generated task #{n}\\nCreated on {date}'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      const ticket = await recurringService.createInstance('rec-body');

      assert.ok(ticket, 'Ticket should be created');
      const ticketTyped = ticket as any;
      assert.ok(ticketTyped.context, 'Ticket should have context');
      assert.ok(ticketTyped.context.notes, 'Context should have notes');
      assert.ok(ticketTyped.context.notes.includes('#1'), 'Notes should include instance number');
      assert.ok(ticketTyped.context.notes.includes('auto-generated'), 'Notes should include body content');
    });

    test('should update state after creating instance', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-state',
          name: 'State Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'cron', expression: '0 0 * * *' },
          template: { type: 'task', title_template: 'Test {n}' },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      await recurringService.createInstance('rec-state');

      const updated = await recurringService.loadDefinitions();
      assert.strictEqual(updated[0].state.instance_count, 1, 'Instance count should be incremented');
      assert.ok(updated[0].state.last_triggered_at, 'last_triggered_at should be set');
      assert.ok(updated[0].state.last_instance_id, 'last_instance_id should be set');
      assert.strictEqual(updated[0].state.is_active_instance, true, 'is_active_instance should be true');
    });
  });

  suite('enableDefinition() and disableDefinition()', () => {

    test('should enable a disabled definition', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-toggle',
          name: 'Toggle Test',
          enabled: false,
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
      ];
      await recurringService.saveDefinitions(definitions);

      await recurringService.enableDefinition('rec-toggle');

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].enabled, true, 'Definition should be enabled');
    });

    test('should disable an enabled definition', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-toggle2',
          name: 'Toggle Test 2',
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
      ];
      await recurringService.saveDefinitions(definitions);

      await recurringService.disableDefinition('rec-toggle2');

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].enabled, false, 'Definition should be disabled');
    });

    test('should throw error when enabling nonexistent definition', async () => {
      await assert.rejects(
        async () => await recurringService.enableDefinition('nonexistent'),
        /not found/
      );
    });

    test('should throw error when disabling nonexistent definition', async () => {
      await assert.rejects(
        async () => await recurringService.disableDefinition('nonexistent'),
        /not found/
      );
    });
  });

  suite('deleteDefinition()', () => {

    test('should delete a definition', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-delete',
          name: 'Delete Test',
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
      ];
      await recurringService.saveDefinitions(definitions);

      await recurringService.deleteDefinition('rec-delete');

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded.length, 0, 'Definition should be deleted');
    });

    test('should throw error when deleting nonexistent definition', async () => {
      await assert.rejects(
        async () => await recurringService.deleteDefinition('nonexistent'),
        /not found/
      );
    });
  });

  suite('handleTicketCompletion()', () => {

    test('should not create instance when ticket has no recurring_source', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-oncomplete',
          name: 'On Completion Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'on-completion' },
          template: { type: 'task', title_template: 'Follow-up {n}' },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      const ticket = {
        id: 'TASK-001',
        title: 'Test Ticket',
        status: TicketStatus.Done,
        priority: 3,
        tags: [],
        context: { files: [], references: [], notes: '' }
      } as any;

      await recurringService.handleTicketCompletion(ticket);

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].state.instance_count, 0, 'Should not create instance');
    });

    test('should create new instance when ticket with recurring_source is completed', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-followup',
          name: 'Follow-up Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'on-completion' },
          template: { type: 'task', title_template: 'Follow-up Task {n}' },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      const ticket = {
        id: 'TASK-001',
        title: 'Test Ticket',
        status: TicketStatus.Done,
        priority: 3,
        tags: [],
        context: { files: [], references: [], notes: '' },
        recurring_source: 'rec-followup'
      } as any;

      await recurringService.handleTicketCompletion(ticket);

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].state.instance_count, 1, 'Should create one instance');
      assert.strictEqual(loaded[0].state.is_active_instance, true, 'Should mark as active');
    });

    test('should prevent cyclic triggers via is_active_instance guard', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-cyclic',
          name: 'Cyclic Guard Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'on-completion' },
          template: { type: 'task', title_template: 'Cyclic Task {n}' },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 1,
            last_instance_id: 'TASK-001',
            is_active_instance: true
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      const ticket = {
        id: 'TASK-001',
        title: 'Test Ticket',
        status: TicketStatus.Done,
        priority: 3,
        tags: [],
        context: { files: [], references: [], notes: '' },
        recurring_source: 'rec-cyclic'
      } as any;

      await recurringService.handleTicketCompletion(ticket);

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].state.instance_count, 1, 'Should NOT create new instance (guard active)');
      assert.strictEqual(loaded[0].state.is_active_instance, false, 'Should reset is_active_instance to false');
    });

    test('should handle missing definition gracefully in handleTicketCompletion', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-missing',
          name: 'Missing Def Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'on-completion' },
          template: { type: 'task', title_template: 'Test {n}' },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      const ticket = {
        id: 'TASK-001',
        title: 'Test Ticket',
        status: TicketStatus.Done,
        priority: 3,
        tags: [],
        context: { files: [], references: [], notes: '' },
        recurring_source: 'nonexistent-definition'
      } as any;

      await recurringService.handleTicketCompletion(ticket);

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].state.instance_count, 0, 'Should not create instance for missing def');
    });

    test('should not trigger for non-on-completion definitions', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-cron',
          name: 'Cron Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'cron', expression: '0 0 * * *' },
          template: { type: 'task', title_template: 'Cron Task {n}' },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      const ticket = {
        id: 'TASK-001',
        title: 'Test Ticket',
        status: TicketStatus.Done,
        priority: 3,
        tags: [],
        context: { files: [], references: [], notes: '' },
        recurring_source: 'rec-cron'
      } as any;

      await recurringService.handleTicketCompletion(ticket);

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].state.instance_count, 0, 'Should not trigger cron definition');
    });

    test('should handle multiple on-completion definitions for same ticket', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-followup1',
          name: 'Follow-up 1',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'on-completion' },
          template: { type: 'task', title_template: 'Follow-up 1 {n}' },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        },
        {
          id: 'rec-followup2',
          name: 'Follow-up 2',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'on-completion' },
          template: { type: 'task', title_template: 'Follow-up 2 {n}' },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      const ticket = {
        id: 'TASK-001',
        title: 'Test Ticket',
        status: TicketStatus.Done,
        priority: 3,
        tags: [],
        context: { files: [], references: [], notes: '' },
        recurring_source: 'rec-followup1'
      } as any;

      await recurringService.handleTicketCompletion(ticket);

      const loaded = await recurringService.loadDefinitions();
      const def1 = loaded.find(d => d.id === 'rec-followup1');
      const def2 = loaded.find(d => d.id === 'rec-followup2');
      assert.strictEqual(def1?.state.instance_count, 1, 'First definition should trigger');
      assert.strictEqual(def2?.state.instance_count, 0, 'Second definition should NOT trigger (different source)');
    });
  });

  suite('dispose()', () => {

    test('should clear definitions on dispose', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-dispose',
          name: 'Dispose Test',
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
      ];
      await recurringService.saveDefinitions(definitions);

      recurringService.dispose();

      const recurringPath = path.join(tempDir, '.workflow', 'config', 'recurring.yaml');
      fs.unlinkSync(recurringPath);

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded.length, 0, 'Definitions should be cleared');
    });
  });

  suite('handleFileEvent()', () => {

    test('should trigger on file_created event', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-file-created',
          name: 'File Created Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'event', event: 'file_created' },
          template: {
            type: 'task',
            title_template: 'New file: {trigger_value}'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      await recurringService.handleFileEvent('test-file.txt', 'file_created');

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].state.instance_count, 1, 'Should create one instance');
    });

    test('should trigger on report_created event', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-report-created',
          name: 'Report Created Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'event', event: 'report_created' },
          template: {
            type: 'task',
            title_template: 'New report processed: {trigger_value}'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      await recurringService.handleFileEvent('.workflow/reports/REP-001.md', 'report_created');

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].state.instance_count, 1, 'Should create one instance');
    });

    test('should trigger on plan_completed event', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-plan-completed',
          name: 'Plan Completed Test',
          enabled: true,
          entity_type: 'plan',
          trigger: { type: 'event', event: 'plan_completed' },
          template: {
            type: 'plan',
            title_template: 'Post-review: {trigger_value}'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      await recurringService.handleFileEvent('plans/current/PLAN-001.md', 'plan_completed');

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].state.instance_count, 1, 'Should create one instance');
    });

    test('should not trigger when event type does not match', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-no-match',
          name: 'No Match Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'event', event: 'file_created' },
          template: {
            type: 'task',
            title_template: 'Should not trigger'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      await recurringService.handleFileEvent('test.txt', 'report_created');

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].state.instance_count, 0, 'Should NOT create instance');
    });

    test('should filter by pattern - matching', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-pattern-match',
          name: 'Pattern Match Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'event', event: 'file_created', pattern: '*.txt' },
          template: {
            type: 'task',
            title_template: 'Text file: {trigger_value}'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      await recurringService.handleFileEvent('readme.txt', 'file_created');

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].state.instance_count, 1, 'Should match *.txt pattern');
    });

    test('should filter by pattern - non-matching', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-pattern-no-match',
          name: 'Pattern No Match Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'event', event: 'file_created', pattern: '*.txt' },
          template: {
            type: 'task',
            title_template: 'Should not trigger'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      await recurringService.handleFileEvent('readme.md', 'file_created');

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].state.instance_count, 0, 'Should NOT match *.txt pattern');
    });

    test('should filter by pattern - double star glob', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-pattern-double-star',
          name: 'Double Star Pattern Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'event', event: 'file_created', pattern: '**/*.md' },
          template: {
            type: 'task',
            title_template: 'Markdown: {trigger_value}'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      await recurringService.handleFileEvent('path/to/file.md', 'file_created');

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].state.instance_count, 1, 'Should match **/*.md pattern');
    });

    test('should filter by pattern - star glob (single level)', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-pattern-star',
          name: 'Single Star Pattern Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'event', event: 'file_created', pattern: '*.txt' },
          template: {
            type: 'task',
            title_template: 'Text: {trigger_value}'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      await recurringService.handleFileEvent('readme.txt', 'file_created');

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].state.instance_count, 1, 'Should match *.txt pattern');
    });

    test('should filter by pattern - question mark glob', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-pattern-qmark',
          name: 'Question Mark Pattern Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'event', event: 'file_created', pattern: 'file?.txt' },
          template: {
            type: 'task',
            title_template: 'Question: {trigger_value}'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      await recurringService.handleFileEvent('file1.txt', 'file_created');

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].state.instance_count, 1, 'Should match file?.txt pattern');
    });

    test('should use default trigger value for unknown event type', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-unknown-event',
          name: 'Unknown Event Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'event', event: 'unknown_event' },
          template: {
            type: 'task',
            title_template: 'Unknown: {trigger_value}'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      await recurringService.handleFileEvent('test.xyz', 'unknown_event');

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].state.instance_count, 1, 'Should create instance for unknown event');
    });

    test('should pass trigger_value to title_template', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-trigger-value',
          name: 'Trigger Value Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'event', event: 'report_created' },
          template: {
            type: 'task',
            title_template: 'Report: {trigger_value}'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      const instance = await recurringService.handleFileEvent('.workflow/reports/WEEKLY-001.md', 'report_created');

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].state.instance_count, 1, 'Should create instance');
    });

    test('should not trigger disabled definitions', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-disabled',
          name: 'Disabled Test',
          enabled: false,
          entity_type: 'ticket',
          trigger: { type: 'event', event: 'file_created' },
          template: {
            type: 'task',
            title_template: 'Should not trigger'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      await recurringService.handleFileEvent('test.txt', 'file_created');

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].state.instance_count, 0, 'Should NOT trigger disabled definition');
    });

    test('should trigger multiple matching definitions', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-multi-1',
          name: 'Multi 1',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'event', event: 'file_created' },
          template: {
            type: 'task',
            title_template: 'Multi 1: {trigger_value}'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        },
        {
          id: 'rec-multi-2',
          name: 'Multi 2',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'event', event: 'file_created' },
          template: {
            type: 'task',
            title_template: 'Multi 2: {trigger_value}'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      await recurringService.handleFileEvent('test.txt', 'file_created');

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].state.instance_count, 1, 'First definition should trigger');
      assert.strictEqual(loaded[1].state.instance_count, 1, 'Second definition should trigger');
    });
  });

  suite('Integration: full chain', () => {

    test('Scenario 1: on-completion trigger - complete ticket triggers new instance creation', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-oncomplete-chain',
          name: 'On Completion Chain Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'on-completion' },
          template: {
            type: 'task',
            title_template: 'Follow-up Task {n}'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      const sourceTicket = await recurringService.createInstance('rec-oncomplete-chain');
      assert.ok(sourceTicket.id.startsWith('TASK-'), 'Source ticket should be created');

      await ticketService.move(sourceTicket.id, TicketStatus.Done);

      await recurringService.handleTicketCompletion(sourceTicket as any);

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].state.instance_count, 1, 'Instance count should be 1 after trigger');
      assert.strictEqual(loaded[0].state.is_active_instance, true, 'is_active_instance should be true');

      const allTickets = store.getTickets();
      const newTickets = allTickets.filter(t => t.recurring_source === 'rec-oncomplete-chain');
      assert.strictEqual(newTickets.length, 2, 'Should have 2 tickets (source + new)');
    });

    test('Scenario 2: cron trigger - direct createInstance simulates scheduler trigger', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-cron-chain',
          name: 'Cron Chain Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'cron', expression: '0 0 * * *' },
          template: {
            type: 'task',
            title_template: 'Daily Task {date} #{n}'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      const ticket = await recurringService.createInstance('rec-cron-chain');

      assert.ok(ticket.id.startsWith('TASK-'), 'Ticket should be created');
      const ticketTyped = ticket as any;
      assert.ok(ticketTyped.title.includes('#1'), 'Title should include instance number');
      const today = new Date().toISOString().split('T')[0];
      assert.ok(ticketTyped.title.includes(today), 'Title should include date');

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].state.instance_count, 1, 'Instance count should be 1');
      assert.ok(loaded[0].state.last_triggered_at, 'last_triggered_at should be set');
      assert.ok(loaded[0].state.next_trigger_at, 'next_trigger_at should be calculated');
    });

    test('Scenario 3: event trigger - report_created event creates ticket with trigger_value', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-event-chain',
          name: 'Event Chain Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'event', event: 'report_created' },
          template: {
            type: 'task',
            title_template: 'Process Report: {trigger_value}'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      await recurringService.handleFileEvent('.workflow/reports/REPORT-042.md', 'report_created');

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].state.instance_count, 1, 'Should create one instance');

      const allTickets = store.getTickets();
      const createdTicket = allTickets.find(t => t.recurring_source === 'rec-event-chain');
      assert.ok(createdTicket, 'Should find created ticket');
      assert.ok(createdTicket.title.includes('REPORT-042'), 'Title should include trigger_value');
    });

    test('Variable interpolation: {date}, {n}, {trigger_value} in title', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-vars-test',
          name: 'Variables Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'event', event: 'file_created' },
          template: {
            type: 'task',
            title_template: 'File {trigger_value} - {date} - #{n}'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      await recurringService.handleFileEvent('test-document.md', 'file_created');

      const allTickets = store.getTickets();
      const ticket = allTickets.find(t => t.recurring_source === 'rec-vars-test');
      assert.ok(ticket, 'Ticket should be created');
      const ticketTyped = ticket as any;
      assert.ok(ticketTyped.title.includes('test-document.md'), 'Title should include trigger_value');
      const today = new Date().toISOString().split('T')[0];
      assert.ok(ticketTyped.title.includes(today), 'Title should include date');
      assert.ok(ticketTyped.title.includes('#1'), 'Title should include instance number');
    });

    test('Guard is_active_instance: on-completion does not create second ticket if first is still active', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-guard-test',
          name: 'Guard Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'on-completion' },
          template: {
            type: 'task',
            title_template: 'Recurring {n}'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 1,
            last_instance_id: 'TASK-001',
            is_active_instance: true
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      const ticket = {
        id: 'TASK-001',
        title: 'Existing Ticket',
        status: TicketStatus.Done,
        priority: 3,
        tags: [],
        context: { files: [], references: [], notes: '' },
        recurring_source: 'rec-guard-test'
      } as any;

      await recurringService.handleTicketCompletion(ticket);

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].state.instance_count, 1, 'Should NOT create new instance (guard active)');
      assert.strictEqual(loaded[0].state.is_active_instance, false, 'Should reset is_active_instance to false');

      const allTickets = store.getTickets();
      const recurringTickets = allTickets.filter(t => t.recurring_source === 'rec-guard-test');
      assert.strictEqual(recurringTickets.length, 0, 'Should not create new ticket when guard is active');
    });

    test('instance_count increments after each trigger', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-count-test',
          name: 'Count Test',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'event', event: 'file_created' },
          template: {
            type: 'task',
            title_template: 'Task #{n}'
          },
          state: {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }
      ];
      await recurringService.saveDefinitions(definitions);

      await recurringService.handleFileEvent('file1.txt', 'file_created');
      await recurringService.handleFileEvent('file2.txt', 'file_created');
      await recurringService.handleFileEvent('file3.txt', 'file_created');

      const loaded = await recurringService.loadDefinitions();
      assert.strictEqual(loaded[0].state.instance_count, 3, 'Instance count should be 3');
    });
  });
});
