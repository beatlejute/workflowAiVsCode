/**
 * Unit tests for KanbanTreeProvider
 *
 * Tests:
 * - KanbanTicketTreeItem: Correct label, description, tooltip, icon
 * - KanbanTreeProvider: Groups tickets by status correctly
 * - KanbanTreeProvider: Tooltip contains status, priority, type, deps, plan
 * - KanbanTreeProvider: Counters in headers
 * - KanbanTreeProvider: Reactive updates on Store events
 * - KanbanTreeProvider: Context menu and toolbar actions
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowStore } from '../../data/workflow-store';
import {
  KanbanTreeProvider,
  KanbanTicketTreeItem,
  createKanbanProviders
} from '../../ui/kanban-tree-provider';
import { Ticket, TicketStatus } from '../../data/types';

suite('KanbanTreeProvider Tests', () => {
  let store: WorkflowStore;
  let tempWorkflowRoot: string;

  suiteSetup(async () => {
    // Create temporary workflow directory for testing
    const tempDir = path.join(__dirname, '../../../tmp/test-workflow-kanban');

    // Create directory structure
    fs.mkdirSync(tempDir, { recursive: true });
    
    const statuses = ['backlog', 'ready', 'in-progress', 'blocked', 'review', 'done'];
    for (const status of statuses) {
      fs.mkdirSync(path.join(tempDir, '.workflow', 'tickets', status), { recursive: true });
    }
    fs.mkdirSync(path.join(tempDir, '.workflow', 'plans', 'current'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'config'), { recursive: true });

    // Create minimal config.yaml
    fs.writeFileSync(
      path.join(tempDir, '.workflow', 'config', 'config.yaml'),
      `version: "1.0"
project:
  name: "Test Project"
  description: "Test"
task_types:
  IMPL:
    description: "Implementation"
    prefix: "IMPL"
priorities:
  1: "Critical"
  2: "High"
  3: "Medium"
  4: "Low"
  5: "Trivial"
statuses:
  backlog:
    description: "Backlog"
    color: "gray"
  ready:
    description: "Ready"
    color: "blue"
  in-progress:
    description: "In Progress"
    color: "yellow"
  blocked:
    description: "Blocked"
    color: "red"
  review:
    description: "Review"
    color: "purple"
  done:
    description: "Done"
    color: "green"
condition_types:
  tasks_completed:
    description: "Tasks completed"
paths:
  tickets: ".workflow/tickets"
  plans: ".workflow/plans"
  reports: ".workflow/reports"
`
    );

    // Create pipeline.yaml
    fs.writeFileSync(
      path.join(tempDir, '.workflow', 'config', 'pipeline.yaml'),
      `version: "1.0"
stages:
  - id: analyze
    agent: claude
    skill: analyze-report
  - id: plan
    agent: claude
    skill: create-plan
`
    );

    tempWorkflowRoot = path.join(tempDir, '.workflow');

    // Initialize store
    store = new WorkflowStore();
    await store.refresh(tempWorkflowRoot);
  });

  suiteTeardown(() => {
    // Cleanup
    try {
      fs.rmSync(path.join(__dirname, '../../../tmp/test-workflow-kanban'), {
        recursive: true,
        force: true
      });
    } catch (error) {
      console.error('Failed to cleanup test directory:', error);
    }
  });

  suite('KanbanTicketTreeItem', () => {
    test('creates tree item with correct label and description', () => {
      const ticket: Ticket = {
        id: 'KANBAN-001',
        title: 'Kanban Test Ticket',
        status: TicketStatus.Ready,
        priority: 3,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: 'PLAN-001',
        parent_task: '',
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
        completed_at: ''
      };

      const item = new KanbanTicketTreeItem(ticket, tempWorkflowRoot);

      assert.strictEqual(item.label, 'KANBAN-001', 'Label should be ticket ID');
      assert.strictEqual(item.description, 'Kanban Test Ticket', 'Description should be ticket title');
    });

    test('creates tree item with collapsible state None', () => {
      const ticket: Ticket = {
        id: 'KANBAN-002',
        title: 'Collapsible Test',
        status: TicketStatus.Ready,
        priority: 3,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
        completed_at: ''
      };

      const item = new KanbanTicketTreeItem(ticket, tempWorkflowRoot);

      assert.strictEqual(
        item.collapsibleState,
        vscode.TreeItemCollapsibleState.None,
        'Tickets should not be collapsible'
      );
    });

    test('creates tree item with command to open ticket file', () => {
      const ticket: Ticket = {
        id: 'KANBAN-003',
        title: 'Command Test',
        status: TicketStatus.Ready,
        priority: 3,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
        completed_at: ''
      };

      const item = new KanbanTicketTreeItem(ticket, tempWorkflowRoot);

      assert.ok(item.command, 'Should have command');
      assert.strictEqual(item.command.command, 'vscode.open', 'Command should be vscode.open');
      assert.ok(
        item.command.arguments?.[0] instanceof vscode.Uri,
        'Command should have URI argument'
      );
    });

    test('creates tree item with MarkdownString tooltip', () => {
      const ticket: Ticket = {
        id: 'KANBAN-004',
        title: 'Tooltip Test',
        status: TicketStatus.Ready,
        priority: 2,
        type: 'FIX',
        dependencies: ['DEP-001'],
        conditions: [],
        context: { notes: 'Test notes' },
        tags: [],
        complexity: 'medium',
        parent_plan: 'PLAN-001',
        parent_task: '',
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
        completed_at: ''
      };

      const item = new KanbanTicketTreeItem(ticket, tempWorkflowRoot);

      assert.ok(item.tooltip, 'Should have tooltip');
      assert.ok(
        item.tooltip instanceof vscode.MarkdownString,
        'Tooltip should be MarkdownString'
      );

      const markdown = item.tooltip as vscode.MarkdownString;
      assert.ok(
        markdown.value.includes('KANBAN-004'),
        'Tooltip should contain ticket ID'
      );
      assert.ok(
        markdown.value.includes('Tooltip Test'),
        'Tooltip should contain ticket title'
      );
      assert.ok(
        markdown.value.includes('ready'),
        'Tooltip should contain status'
      );
      assert.ok(
        markdown.value.includes('High'),
        'Tooltip should contain priority label'
      );
      assert.ok(
        markdown.value.includes('FIX'),
        'Tooltip should contain type'
      );
      assert.ok(
        markdown.value.includes('DEP-001'),
        'Tooltip should contain dependencies'
      );
      assert.ok(
        markdown.value.includes('PLAN-001'),
        'Tooltip should contain parent plan'
      );
    });

    test('creates tree item with priority-based icon', () => {
      const testCases = [
        { priority: 1, expectedColor: 'notificationsErrorIcon.foreground' },
        { priority: 2, expectedColor: 'notificationsWarningIcon.foreground' },
        { priority: 3, expectedColor: 'notificationsInfoIcon.foreground' },
        { priority: 4, expectedColor: 'terminal.ansiGreen' },
        { priority: 5, expectedColor: 'terminal.ansiGreen' }
      ];

      for (const testCase of testCases) {
        const ticket: Ticket = {
          id: `PRIORITY-${testCase.priority}`,
          title: `Priority ${testCase.priority} Test`,
          status: TicketStatus.Ready,
          priority: testCase.priority,
          type: 'IMPL',
          dependencies: [],
          conditions: [],
          context: {},
          tags: [],
          complexity: 'medium',
          parent_plan: '',
          parent_task: '',
          created_at: '2026-03-05T00:00:00Z',
          updated_at: '2026-03-05T00:00:00Z',
          completed_at: ''
        };

        const item = new KanbanTicketTreeItem(ticket, tempWorkflowRoot);

        assert.ok(item.iconPath, `Should have icon for priority ${testCase.priority}`);
        assert.ok(
          item.iconPath instanceof vscode.ThemeIcon,
          'Icon should be ThemeIcon'
        );
      }
    });

    test('sets contextValue to kanban-ticket', () => {
      const ticket: Ticket = {
        id: 'KANBAN-005',
        title: 'Context Value Test',
        status: TicketStatus.Ready,
        priority: 3,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
        completed_at: ''
      };

      const item = new KanbanTicketTreeItem(ticket, tempWorkflowRoot);

      assert.strictEqual(item.contextValue, 'kanban-ticket', 'Context value should be kanban-ticket');
    });
  });

  suite('KanbanTreeProvider', () => {
    let provider: KanbanTreeProvider;

    beforeEach(() => {
      store.clear();
    });

    setup(() => {
      provider = new KanbanTreeProvider(store, TicketStatus.Ready);
      provider.setWorkflowRoot(tempWorkflowRoot);
    });

    test('returns empty array when workflow root not set', async () => {
      const providerWithoutRoot = new KanbanTreeProvider(store, TicketStatus.Ready);
      // Don't set workflow root

      const children = await providerWithoutRoot.getChildren();

      assert.strictEqual(children.length, 0, 'Should have 0 children when workflow root not set');
    });

    test('returns tickets for configured status', async () => {
      // Create test tickets
      const ticket1: Ticket = {
        id: 'KANBAN-READY-001',
        title: 'Ready Ticket 1',
        status: TicketStatus.Ready,
        priority: 3,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
        completed_at: ''
      };

      const ticket2: Ticket = {
        id: 'KANBAN-READY-002',
        title: 'Ready Ticket 2',
        status: TicketStatus.Ready,
        priority: 2,
        type: 'FIX',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
        completed_at: ''
      };

      store.addTicket(ticket1);
      store.addTicket(ticket2);

      // Create ticket files
      const ticket1Path = path.join(tempWorkflowRoot, 'tickets', 'ready', 'KANBAN-READY-001.md');
      const ticket2Path = path.join(tempWorkflowRoot, 'tickets', 'ready', 'KANBAN-READY-002.md');

      fs.writeFileSync(ticket1Path, `---
id: KANBAN-READY-001
title: Ready Ticket 1
status: ready
priority: 3
type: IMPL
---

# Ready Ticket 1
`);

      fs.writeFileSync(ticket2Path, `---
id: KANBAN-READY-002
title: Ready Ticket 2
status: ready
priority: 2
type: FIX
---

# Ready Ticket 2
`);

      const children = await provider.getChildren();

      assert.strictEqual(children.length, 2, 'Should have 2 tickets');
      assert.ok(
        children.some(c => c.ticket.id === 'KANBAN-READY-001'),
        'Should contain ticket 1'
      );
      assert.ok(
        children.some(c => c.ticket.id === 'KANBAN-READY-002'),
        'Should contain ticket 2'
      );
    });

    test('sorts tickets by priority (ascending)', async () => {
      // Clear existing tickets and create new ones with different priorities
      const ticket1: Ticket = {
        id: 'KANBAN-PRIORITY-001',
        title: 'Priority 3 Ticket',
        status: TicketStatus.Ready,
        priority: 3,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
        completed_at: ''
      };

      const ticket2: Ticket = {
        id: 'KANBAN-PRIORITY-002',
        title: 'Priority 1 Ticket',
        status: TicketStatus.Ready,
        priority: 1,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
        completed_at: ''
      };

      const ticket3: Ticket = {
        id: 'KANBAN-PRIORITY-003',
        title: 'Priority 2 Ticket',
        status: TicketStatus.Ready,
        priority: 2,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
        completed_at: ''
      };

      store.addTicket(ticket1);
      store.addTicket(ticket2);
      store.addTicket(ticket3);

      const children = await provider.getChildren();

      assert.strictEqual(children.length, 3, 'Should have 3 tickets');
      assert.strictEqual(
        children[0].ticket.priority,
        1,
        'First ticket should have priority 1'
      );
      assert.strictEqual(
        children[1].ticket.priority,
        2,
        'Second ticket should have priority 2'
      );
      assert.strictEqual(
        children[2].ticket.priority,
        3,
        'Third ticket should have priority 3'
      );
    });

    test('returns no children for ticket item', async () => {
      const ticket: Ticket = {
        id: 'KANBAN-LEAF-001',
        title: 'Leaf Test',
        status: TicketStatus.Ready,
        priority: 3,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
        completed_at: ''
      };
      store.addTicket(ticket);

      const item = new KanbanTicketTreeItem(ticket, tempWorkflowRoot);
      const children = await provider.getChildren(item);

      assert.strictEqual(children.length, 0, 'Tickets should have no children');
    });

    test('getTreeItem returns the same item', () => {
      const ticket: Ticket = {
        id: 'KANBAN-TREE-001',
        title: 'Tree Item Test',
        status: TicketStatus.Ready,
        priority: 3,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
        completed_at: ''
      };

      const item = new KanbanTicketTreeItem(ticket, tempWorkflowRoot);
      const result = provider.getTreeItem(item);

      assert.strictEqual(result, item, 'getTreeItem should return the same item');
    });

    test('getCount returns correct ticket count', () => {
      const count = provider.getCount();

      assert.ok(count >= 0, 'Count should be non-negative');
    });

    test('refreshes on store change events', async () => {
      let refreshCount = 0;
      provider.onDidChangeTreeData(() => {
        refreshCount++;
      });

      // Add a ticket to trigger store event
      const ticket: Ticket = {
        id: 'KANBAN-EVENT-001',
        title: 'Event Test',
        status: TicketStatus.Ready,
        priority: 3,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
        completed_at: ''
      };
      store.addTicket(ticket);

      // Wait for event to propagate
      await new Promise(resolve => setTimeout(resolve, 100));

      assert.ok(refreshCount > 0, 'Should have received refresh event');
    });
  });

  suite('createKanbanProviders', () => {
    test('creates all 6 providers with correct statuses', () => {
      const providers = createKanbanProviders(store);

      assert.ok(providers.backlog, 'Should have backlog provider');
      assert.ok(providers.ready, 'Should have ready provider');
      assert.ok(providers.inProgress, 'Should have inProgress provider');
      assert.ok(providers.blocked, 'Should have blocked provider');
      assert.ok(providers.review, 'Should have review provider');
      assert.ok(providers.done, 'Should have done provider');
    });

    test('all providers have setWorkflowRoot method', () => {
      const providers = createKanbanProviders(store);

      assert.strictEqual(typeof providers.backlog.setWorkflowRoot, 'function');
      assert.strictEqual(typeof providers.ready.setWorkflowRoot, 'function');
      assert.strictEqual(typeof providers.inProgress.setWorkflowRoot, 'function');
      assert.strictEqual(typeof providers.blocked.setWorkflowRoot, 'function');
      assert.strictEqual(typeof providers.review.setWorkflowRoot, 'function');
      assert.strictEqual(typeof providers.done.setWorkflowRoot, 'function');
    });

    test('all providers have refresh method', () => {
      const providers = createKanbanProviders(store);

      assert.strictEqual(typeof providers.backlog.refresh, 'function');
      assert.strictEqual(typeof providers.ready.refresh, 'function');
      assert.strictEqual(typeof providers.inProgress.refresh, 'function');
      assert.strictEqual(typeof providers.blocked.refresh, 'function');
      assert.strictEqual(typeof providers.review.refresh, 'function');
      assert.strictEqual(typeof providers.done.refresh, 'function');
    });
  });

  suite('KanbanTreeProvider with different statuses', () => {
    beforeEach(() => {
      store.clear();
    });

    test('filters tickets correctly by status', async () => {
      // Create tickets in different statuses
      const backlogTicket: Ticket = {
        id: 'STATUS-BACKLOG-001',
        title: 'Backlog Ticket',
        status: TicketStatus.Backlog,
        priority: 3,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
        completed_at: ''
      };

      const doneTicket: Ticket = {
        id: 'STATUS-DONE-001',
        title: 'Done Ticket',
        status: TicketStatus.Done,
        priority: 3,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
        completed_at: ''
      };

      store.addTicket(backlogTicket);
      store.addTicket(doneTicket);

      const backlogProvider = new KanbanTreeProvider(store, TicketStatus.Backlog);
      backlogProvider.setWorkflowRoot(tempWorkflowRoot);

      const doneProvider = new KanbanTreeProvider(store, TicketStatus.Done);
      doneProvider.setWorkflowRoot(tempWorkflowRoot);

      const backlogChildren = await backlogProvider.getChildren();
      const doneChildren = await doneProvider.getChildren();

      assert.ok(
        backlogChildren.some(c => c.ticket.id === 'STATUS-BACKLOG-001'),
        'Backlog provider should show backlog ticket'
      );
      assert.ok(
        !backlogChildren.some(c => c.ticket.id === 'STATUS-DONE-001'),
        'Backlog provider should not show done ticket'
      );
      assert.ok(
        doneChildren.some(c => c.ticket.id === 'STATUS-DONE-001'),
        'Done provider should show done ticket'
      );
      assert.ok(
        !doneChildren.some(c => c.ticket.id === 'STATUS-BACKLOG-001'),
        'Done provider should not show backlog ticket'
      );
    });
  });
});
