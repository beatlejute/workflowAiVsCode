/**
 * Unit tests for RecurringTreeProvider
 *
 * Tests:
 * - RecurringTreeItem: Correct label, description, tooltip, icon for enabled/disabled
 * - RecurringTreeProvider: getTreeItem returns correct TreeItem
 * - RecurringTreeProvider: getChildren returns all definitions
 * - RecurringTreeProvider: Tree updates on refresh event
 * - RecurringTreeProvider: Returns empty array when workflow root not set
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  RecurringTreeItem,
  RecurringTreeProvider
} from '../../ui/recurring-tree-provider';
import { RecurringDefinition, CronTrigger, EventTrigger, OnCompletionTrigger } from '../../data/types';

suite('RecurringTreeProvider Tests', () => {
  suite('RecurringTreeItem', () => {
    const workflowRoot = '/test/workflow';

    test('creates tree item with correct label', () => {
      const definition: RecurringDefinition = {
        id: 'rec-001',
        name: 'Weekly Review',
        enabled: true,
        entity_type: 'ticket',
        trigger: { type: 'cron', expression: '0 9 * * 1' } as CronTrigger,
        template: { type: 'review', title_template: 'Weekly Review {date}' },
        state: {
          last_triggered_at: '2026-03-01T00:00:00Z',
          next_trigger_at: '2026-03-08T00:00:00Z',
          instance_count: 5,
          last_instance_id: 'IMPL-105',
          is_active_instance: false
        }
      };

      const item = new RecurringTreeItem(definition, workflowRoot);

      assert.strictEqual(item.label, 'Weekly Review', 'Label should be definition name');
    });

    test('creates tree item with enabled status and sync icon', () => {
      const definition: RecurringDefinition = {
        id: 'rec-002',
        name: 'Daily Standup',
        enabled: true,
        entity_type: 'ticket',
        trigger: { type: 'cron', expression: '0 9 * * 1-5' } as CronTrigger,
        template: { type: 'task', title_template: 'Daily Standup {date}' },
        state: {
          last_triggered_at: '2026-03-14T00:00:00Z',
          next_trigger_at: '2026-03-17T00:00:00Z',
          instance_count: 10,
          last_instance_id: 'IMPL-110',
          is_active_instance: true
        }
      };

      const item = new RecurringTreeItem(definition, workflowRoot);

      assert.ok(item.iconPath, 'Should have iconPath');
      assert.ok(item.iconPath instanceof vscode.ThemeIcon, 'Icon should be ThemeIcon');
      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'sync', 'Icon should be sync for enabled definition');
    });

    test('creates tree item with disabled status and sync-ignored icon', () => {
      const definition: RecurringDefinition = {
        id: 'rec-003',
        name: 'Monthly Report',
        enabled: false,
        entity_type: 'ticket',
        trigger: { type: 'cron', expression: '0 10 1 * *' } as CronTrigger,
        template: { type: 'report', title_template: 'Monthly Report {date}' },
        state: {
          last_triggered_at: '2026-02-01T00:00:00Z',
          next_trigger_at: null,
          instance_count: 2,
          last_instance_id: 'IMPL-090',
          is_active_instance: false
        }
      };

      const item = new RecurringTreeItem(definition, workflowRoot);

      assert.ok(item.iconPath, 'Should have iconPath');
      assert.ok(item.iconPath instanceof vscode.ThemeIcon, 'Icon should be ThemeIcon');
      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'sync-ignored', 'Icon should be sync-ignored for disabled definition');
    });

    test('creates tree item with collapsible state None', () => {
      const definition: RecurringDefinition = {
        id: 'rec-004',
        name: 'Test Definition',
        enabled: true,
        entity_type: 'ticket',
        trigger: { type: 'cron', expression: '0 0 * * *' } as CronTrigger,
        template: { type: 'task', title_template: 'Test {date}' },
        state: {
          last_triggered_at: null,
          next_trigger_at: '2026-03-16T00:00:00Z',
          instance_count: 0,
          last_instance_id: null,
          is_active_instance: false
        }
      };

      const item = new RecurringTreeItem(definition, workflowRoot);

      assert.strictEqual(
        item.collapsibleState,
        vscode.TreeItemCollapsibleState.None,
        'Definition items should not be collapsible'
      );
    });

    test('sets contextValue to recurring-definition', () => {
      const definition: RecurringDefinition = {
        id: 'rec-005',
        name: 'Context Test',
        enabled: true,
        entity_type: 'ticket',
        trigger: { type: 'cron', expression: '0 0 * * *' } as CronTrigger,
        template: { type: 'task', title_template: 'Test {date}' },
        state: {
          last_triggered_at: null,
          next_trigger_at: '2026-03-16T00:00:00Z',
          instance_count: 0,
          last_instance_id: null,
          is_active_instance: false
        }
      };

      const item = new RecurringTreeItem(definition, workflowRoot);

      assert.strictEqual(item.contextValue, 'recurring-definition', 'Context value should be recurring-definition');
    });

    test('description contains status label', () => {
      const enabledDefinition: RecurringDefinition = {
        id: 'rec-006',
        name: 'Enabled Def',
        enabled: true,
        entity_type: 'ticket',
        trigger: { type: 'cron', expression: '0 0 * * *' } as CronTrigger,
        template: { type: 'task', title_template: 'Test {date}' },
        state: {
          last_triggered_at: null,
          next_trigger_at: '2026-03-16T00:00:00Z',
          instance_count: 3,
          last_instance_id: 'IMPL-100',
          is_active_instance: false
        }
      };

      const item = new RecurringTreeItem(enabledDefinition, workflowRoot);

      assert.ok(item.description, 'Should have description');
      assert.ok(
        (item.description as string).includes('Enabled'),
        'Description should contain enabled status'
      );
    });

    test('description contains cron expression for cron trigger', () => {
      const definition: RecurringDefinition = {
        id: 'rec-007',
        name: 'Cron Test',
        enabled: true,
        entity_type: 'ticket',
        trigger: { type: 'cron', expression: '0 9 * * 1' } as CronTrigger,
        template: { type: 'task', title_template: 'Test {date}' },
        state: {
          last_triggered_at: null,
          next_trigger_at: '2026-03-16T00:00:00Z',
          instance_count: 0,
          last_instance_id: null,
          is_active_instance: false
        }
      };

      const item = new RecurringTreeItem(definition, workflowRoot);

      assert.ok(item.description, 'Should have description');
      assert.ok(
        (item.description as string).includes('0 9 * * 1'),
        'Description should contain cron expression'
      );
    });

    test('description contains instance count', () => {
      const definition: RecurringDefinition = {
        id: 'rec-008',
        name: 'Instance Count Test',
        enabled: true,
        entity_type: 'ticket',
        trigger: { type: 'cron', expression: '0 0 * * *' } as CronTrigger,
        template: { type: 'task', title_template: 'Test {date}' },
        state: {
          last_triggered_at: null,
          next_trigger_at: '2026-03-16T00:00:00Z',
          instance_count: 7,
          last_instance_id: 'IMPL-107',
          is_active_instance: false
        }
      };

      const item = new RecurringTreeItem(definition, workflowRoot);

      assert.ok(item.description, 'Should have description');
      assert.ok(
        (item.description as string).includes('↻ 7'),
        'Description should contain instance count with ↻ symbol'
      );
    });

    test('tooltip contains definition information', () => {
      const definition: RecurringDefinition = {
        id: 'rec-009',
        name: 'Tooltip Test',
        enabled: true,
        entity_type: 'ticket',
        trigger: { type: 'cron', expression: '0 9 * * 1' } as CronTrigger,
        template: { type: 'review', title_template: 'Weekly Review {date}' },
        state: {
          last_triggered_at: '2026-03-01T00:00:00Z',
          next_trigger_at: '2026-03-08T00:00:00Z',
          instance_count: 5,
          last_instance_id: 'IMPL-105',
          is_active_instance: false
        }
      };

      const item = new RecurringTreeItem(definition, workflowRoot);

      assert.ok(item.tooltip, 'Should have tooltip');
      assert.ok(
        item.tooltip instanceof vscode.MarkdownString,
        'Tooltip should be MarkdownString'
      );

      const markdown = item.tooltip as vscode.MarkdownString;
      assert.ok(
        markdown.value.includes('Tooltip Test'),
        'Tooltip should contain definition name'
      );
      assert.ok(
        markdown.value.includes('rec-009'),
        'Tooltip should contain definition ID'
      );
      assert.ok(
        markdown.value.includes('cron'),
        'Tooltip should contain trigger type'
      );
      assert.ok(
        markdown.value.includes('0 9 * * 1'),
        'Tooltip should contain cron expression'
      );
      assert.ok(
        markdown.value.includes('5'),
        'Tooltip should contain instance count'
      );
    });

    test('tooltip contains event info for event trigger', () => {
      const definition: RecurringDefinition = {
        id: 'rec-010',
        name: 'Event Trigger Test',
        enabled: true,
        entity_type: 'ticket',
        trigger: { type: 'event', event: 'ticket_completed', pattern: '*.md' } as EventTrigger,
        template: { type: 'task', title_template: 'Follow-up {date}' },
        state: {
          last_triggered_at: '2026-03-10T00:00:00Z',
          next_trigger_at: null,
          instance_count: 3,
          last_instance_id: 'IMPL-102',
          is_active_instance: false
        }
      };

      const item = new RecurringTreeItem(definition, workflowRoot);

      assert.ok(item.tooltip, 'Should have tooltip');
      const markdown = item.tooltip as vscode.MarkdownString;
      assert.ok(
        markdown.value.includes('event'),
        'Tooltip should contain trigger type'
      );
      assert.ok(
        markdown.value.includes('ticket_completed'),
        'Tooltip should contain event type'
      );
      assert.ok(
        markdown.value.includes('*.md'),
        'Tooltip should contain pattern'
      );
    });

    test('tooltip contains on-completion info', () => {
      const definition: RecurringDefinition = {
        id: 'rec-011',
        name: 'On Completion Test',
        enabled: true,
        entity_type: 'ticket',
        trigger: { type: 'on-completion', target_entity_id: 'IMPL-100' } as OnCompletionTrigger,
        template: { type: 'task', title_template: 'Follow-up {date}' },
        state: {
          last_triggered_at: '2026-03-10T00:00:00Z',
          next_trigger_at: null,
          instance_count: 2,
          last_instance_id: 'IMPL-101',
          is_active_instance: false
        }
      };

      const item = new RecurringTreeItem(definition, workflowRoot);

      assert.ok(item.tooltip, 'Should have tooltip');
      const markdown = item.tooltip as vscode.MarkdownString;
      assert.ok(
        markdown.value.includes('on-completion'),
        'Tooltip should contain trigger type'
      );
    });
  });

  suite('RecurringTreeProvider', () => {
    let provider: RecurringTreeProvider;
    let mockService: any;

    setup(() => {
      provider = new RecurringTreeProvider();
    });

    teardown(() => {
      provider.dispose();
    });

    test('getTreeItem returns the same item', () => {
      const definition: RecurringDefinition = {
        id: 'rec-tree-001',
        name: 'Tree Item Test',
        enabled: true,
        entity_type: 'ticket',
        trigger: { type: 'cron', expression: '0 0 * * *' } as CronTrigger,
        template: { type: 'task', title_template: 'Test {date}' },
        state: {
          last_triggered_at: null,
          next_trigger_at: '2026-03-16T00:00:00Z',
          instance_count: 0,
          last_instance_id: null,
          is_active_instance: false
        }
      };

      const item = new RecurringTreeItem(definition, '/test');
      const result = provider.getTreeItem(item);

      assert.strictEqual(result, item, 'getTreeItem should return the same item');
    });

    test('returns empty array when workflow root not set', async () => {
      const children = await provider.getChildren();

      assert.strictEqual(children.length, 0, 'Should have 0 children when workflow root not set');
    });

    test('returns empty array when workflow root is empty string', async () => {
      provider.setWorkflowRoot('');

      const children = await provider.getChildren();

      assert.strictEqual(children.length, 0, 'Should have 0 children when workflow root is empty');
    });

    test('getChildren returns definitions from service', async () => {
      const definitions: RecurringDefinition[] = [
        {
          id: 'rec-children-001',
          name: 'Definition 1',
          enabled: true,
          entity_type: 'ticket',
          trigger: { type: 'cron', expression: '0 0 * * *' } as CronTrigger,
          template: { type: 'task', title_template: 'Test 1 {date}' },
          state: {
            last_triggered_at: null,
            next_trigger_at: '2026-03-16T00:00:00Z',
            instance_count: 1,
            last_instance_id: 'IMPL-001',
            is_active_instance: false
          }
        },
        {
          id: 'rec-children-002',
          name: 'Definition 2',
          enabled: false,
          entity_type: 'plan',
          trigger: { type: 'cron', expression: '0 0 1 * *' } as CronTrigger,
          template: { type: 'plan', title_template: 'Test 2 {date}' },
          state: {
            last_triggered_at: '2026-02-01T00:00:00Z',
            next_trigger_at: '2026-04-01T00:00:00Z',
            instance_count: 2,
            last_instance_id: 'PLAN-001',
            is_active_instance: false
          }
        }
      ];

      mockService = {
        loadDefinitions: async () => definitions
      };

      provider.setRecurringService(mockService);
      provider.setWorkflowRoot('/test/workflow');

      const children = await provider.getChildren();

      assert.strictEqual(children.length, 2, 'Should have 2 definitions');
      assert.strictEqual(children[0].definition.id, 'rec-children-001', 'First child should be Definition 1');
      assert.strictEqual(children[1].definition.id, 'rec-children-002', 'Second child should be Definition 2');
    });

    test('getChildren returns empty array for no definitions', async () => {
      mockService = {
        loadDefinitions: async () => []
      };

      provider.setRecurringService(mockService);
      provider.setWorkflowRoot('/test/workflow');

      const children = await provider.getChildren();

      assert.strictEqual(children.length, 0, 'Should have 0 children when no definitions');
    });

    test('getChildren returns empty array when element is provided (leaf node)', async () => {
      const definition: RecurringDefinition = {
        id: 'rec-leaf-001',
        name: 'Leaf Test',
        enabled: true,
        entity_type: 'ticket',
        trigger: { type: 'cron', expression: '0 0 * * *' } as CronTrigger,
        template: { type: 'task', title_template: 'Test {date}' },
        state: {
          last_triggered_at: null,
          next_trigger_at: '2026-03-16T00:00:00Z',
          instance_count: 0,
          last_instance_id: null,
          is_active_instance: false
        }
      };

      mockService = {
        loadDefinitions: async () => [definition]
      };

      provider.setRecurringService(mockService);
      provider.setWorkflowRoot('/test/workflow');

      const item = new RecurringTreeItem(definition, '/test/workflow');
      const children = await provider.getChildren(item);

      assert.strictEqual(children.length, 0, 'Should have 0 children for leaf item');
    });

    test('refresh fires change event', async () => {
      let refreshCount = 0;
      provider.onDidChangeTreeData(() => {
        refreshCount++;
      });

      provider.refresh();

      assert.strictEqual(refreshCount, 1, 'Should fire one change event on refresh');
    });

    test('refresh fires change event with undefined', async () => {
      let firedElement: vscode.TreeItem | undefined;
      provider.onDidChangeTreeData((element) => {
        firedElement = element;
      });

      provider.refresh();

      assert.strictEqual(firedElement, undefined, 'Should fire change event with undefined to refresh all');
    });

    test('setRecurringService stores the service', () => {
      mockService = {
        loadDefinitions: async () => []
      };

      provider.setRecurringService(mockService);

      provider.setWorkflowRoot('/test/workflow');

      assert.ok(true, 'Should not throw when setting service');
    });

    test('loadDefinitions is called when setWorkflowRoot is called', async () => {
      let loadCallCount = 0;
      mockService = {
        loadDefinitions: async () => {
          loadCallCount++;
          return [];
        }
      };

      provider.setRecurringService(mockService);
      provider.setWorkflowRoot('/test/workflow');

      await new Promise(resolve => setTimeout(resolve, 10));

      assert.ok(loadCallCount > 0, 'loadDefinitions should be called when setWorkflowRoot is called');
    });

    test('handles service errors gracefully', async () => {
      mockService = {
        loadDefinitions: async () => {
          throw new Error('Test error');
        }
      };

      provider.setRecurringService(mockService);
      provider.setWorkflowRoot('/test/workflow');

      const children = await provider.getChildren();

      assert.strictEqual(children.length, 0, 'Should return empty array on service error');
    });

    test('dispose cleans up event emitter', () => {
      let refreshCount = 0;
      provider.onDidChangeTreeData(() => {
        refreshCount++;
      });

      provider.dispose();
      provider.refresh();

      assert.strictEqual(refreshCount, 0, 'Should not fire events after dispose');
    });
  });
});
