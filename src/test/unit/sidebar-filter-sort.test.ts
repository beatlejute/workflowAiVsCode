/**
 * Unit tests for SidebarTreeProvider filtering and sorting
 *
 * Tests:
 * - setPlanFilter() sets filter correctly
 * - getPlanFilter() returns current filter
 * - setSortMode() sets sort mode correctly
 * - getSortMode() returns current sort mode
 * - Plan filter filters tickets correctly
 * - Sort by date works correctly
 * - Sort by priority works correctly
 * - Sort direction toggle works correctly
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowStore } from '../../data/workflow-store';
import {
  TicketsTreeProvider,
  StatusGroupTreeItem,
  TicketTreeItem
} from '../../ui/sidebar-tree-provider';
import { Ticket, TicketStatus } from '../../data/types';

suite('SidebarTreeProvider Filter and Sort Tests', () => {

  let store: WorkflowStore;
  let tempWorkflowRoot: string;
  let provider: TicketsTreeProvider;

  suiteSetup(async () => {
    // Create temporary workflow directory for testing
    const tempDir = path.join(__dirname, '../../../../../tmp/test-workflow-sidebar');

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
  ready:
    description: "Ready"
  in-progress:
    description: "In Progress"
  blocked:
    description: "Blocked"
  review:
    description: "Review"
  done:
    description: "Done"
condition_types:
  tasks_completed:
    description: "Tasks completed"
paths:
  tickets: ".workflow/tickets"
  plans: ".workflow/plans"
  reports: ".workflow/reports"
  archive: ".workflow/plans/archive"
`
    );

    // Create pipeline.yaml
    fs.writeFileSync(
      path.join(tempDir, '.workflow', 'config', 'pipeline.yaml'),
      `pipeline:
  agents:
    test-agent:
      command: "echo"
      args: ["test"]
      workdir: "."
  stages:
    execute:
      description: "Execute task"
      agent: test-agent
      goto:
        default: end
  entry: execute
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
      fs.rmSync(path.join(__dirname, '../../../../../tmp/test-workflow-sidebar'), {
        recursive: true,
        force: true
      });
    } catch (error) {
      console.error('Failed to cleanup test directory:', error);
    }
  });

  setup(() => {
    store.clear();
    provider = new TicketsTreeProvider(store);
    provider.setWorkflowRoot(tempWorkflowRoot);
  });

  suite('Plan Filter', () => {

    test('getPlanFilter returns null by default', () => {
      const filter = provider.getPlanFilter();
      assert.strictEqual(filter, null, 'Filter should be null by default');
    });

    test('setPlanFilter sets filter correctly', () => {
      provider.setPlanFilter('PLAN-001');
      const filter = provider.getPlanFilter();
      assert.strictEqual(filter, 'PLAN-001', 'Filter should be set to PLAN-001');
    });

    test('setPlanFilter(null) clears filter', () => {
      provider.setPlanFilter('PLAN-001');
      provider.setPlanFilter(null);
      const filter = provider.getPlanFilter();
      assert.strictEqual(filter, null, 'Filter should be null after clearing');
    });

    test('plan filter filters tickets correctly', async () => {
      // Create test tickets with different parent plans
      const ticket1: Ticket = {
        id: 'FILTER-001',
        title: 'Ticket for PLAN-001',
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

      const ticket2: Ticket = {
        id: 'FILTER-002',
        title: 'Ticket for PLAN-002',
        status: TicketStatus.Ready,
        priority: 3,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: 'PLAN-002',
        parent_task: '',
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
        completed_at: ''
      };

      const ticket3: Ticket = {
        id: 'FILTER-003',
        title: 'Another ticket for PLAN-001',
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

      store.addTicket(ticket1);
      store.addTicket(ticket2);
      store.addTicket(ticket3);

      // Create ticket files
      for (const ticket of [ticket1, ticket2, ticket3]) {
        const ticketPath = path.join(tempWorkflowRoot, 'tickets', 'ready', `${ticket.id}.md`);
        fs.writeFileSync(ticketPath, `---
id: ${ticket.id}
title: ${ticket.title}
status: ready
priority: 3
type: IMPL
parent_plan: ${ticket.parent_plan}
---

# ${ticket.title}
`);
      }

      // Set filter to PLAN-001
      provider.setPlanFilter('PLAN-001');

      const children = await provider.getChildren();

      // Should have FilterInfoTreeItem + one status group (Ready) with 2 tickets
      const statusGroups = children.filter(c => c instanceof StatusGroupTreeItem);
      assert.strictEqual(statusGroups.length, 1, 'Should have 1 status group');

      const statusGroup = statusGroups[0] as StatusGroupTreeItem;
      assert.strictEqual(statusGroup.status, TicketStatus.Ready, 'Should be Ready status');
      assert.strictEqual(statusGroup.count, 2, 'Should have 2 tickets for PLAN-001');

      const tickets = (await provider.getChildren(statusGroup)) as TicketTreeItem[];
      assert.strictEqual(tickets.length, 2, 'Should have 2 tickets');
      assert.ok(
        tickets.some(t => t.ticket.id === 'FILTER-001'),
        'Should contain FILTER-001'
      );
      assert.ok(
        tickets.some(t => t.ticket.id === 'FILTER-003'),
        'Should contain FILTER-003'
      );
      assert.ok(
        !tickets.some(t => t.ticket.id === 'FILTER-002'),
        'Should not contain FILTER-002 (different plan)'
      );
    });

    test('plan filter works across multiple statuses', async () => {
      // Create tickets in different statuses but same plan
      const ticket1: Ticket = {
        id: 'MULTI-001',
        title: 'Ready ticket',
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

      const ticket2: Ticket = {
        id: 'MULTI-002',
        title: 'In progress ticket',
        status: TicketStatus.InProgress,
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

      const ticket3: Ticket = {
        id: 'MULTI-003',
        title: 'Done ticket',
        status: TicketStatus.Done,
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

      store.addTicket(ticket1);
      store.addTicket(ticket2);
      store.addTicket(ticket3);

      // Create ticket files
      for (const ticket of [ticket1, ticket2, ticket3]) {
        const statusDir = ticket.status;
        const ticketPath = path.join(tempWorkflowRoot, 'tickets', statusDir, `${ticket.id}.md`);
        fs.writeFileSync(ticketPath, `---
id: ${ticket.id}
title: ${ticket.title}
status: ${statusDir}
priority: 3
type: IMPL
parent_plan: PLAN-001
---

# ${ticket.title}
`);
      }

      // Set filter to PLAN-001
      provider.setPlanFilter('PLAN-001');

      const children = await provider.getChildren();

      // Should have FilterInfoTreeItem + 3 status groups (Ready, In Progress, Done)
      const statusGroups = children.filter(c => c instanceof StatusGroupTreeItem);
      assert.strictEqual(statusGroups.length, 3, 'Should have 3 status groups');

      // Count total tickets across all groups
      let totalTickets = 0;
      for (const child of children) {
        if (child instanceof StatusGroupTreeItem) {
          const tickets = await provider.getChildren(child);
          totalTickets += tickets.length;
        }
      }

      assert.strictEqual(totalTickets, 3, 'Should have 3 tickets total across all statuses');
    });

  });

  suite('Sort Mode', () => {

    test('getSortMode returns default mode', () => {
      const mode = provider.getSortMode();
      assert.ok(mode, 'Should have default sort mode');
    });

    test('setSortMode sets sort mode correctly', () => {
      provider.setSortMode('date');
      const mode = provider.getSortMode();
      assert.strictEqual(mode, 'date', 'Sort mode should be date');

      provider.setSortMode('priority');
      const mode2 = provider.getSortMode();
      assert.strictEqual(mode2, 'priority', 'Sort mode should be priority');

      provider.setSortMode('id');
      const mode3 = provider.getSortMode();
      assert.strictEqual(mode3, 'id', 'Sort mode should be id');
    });

    test('sort by date (newest first)', async () => {
      const ticket1: Ticket = {
        id: 'DATE-001',
        title: 'Oldest ticket',
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
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
        completed_at: ''
      };

      const ticket2: Ticket = {
        id: 'DATE-002',
        title: 'Newest ticket',
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
        created_at: '2026-03-03T00:00:00Z',
        updated_at: '2026-03-03T00:00:00Z',
        completed_at: ''
      };

      const ticket3: Ticket = {
        id: 'DATE-003',
        title: 'Middle ticket',
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
        created_at: '2026-03-02T00:00:00Z',
        updated_at: '2026-03-02T00:00:00Z',
        completed_at: ''
      };

      store.addTicket(ticket1);
      store.addTicket(ticket2);
      store.addTicket(ticket3);

      // Create ticket files
      for (const ticket of [ticket1, ticket2, ticket3]) {
        const ticketPath = path.join(tempWorkflowRoot, 'tickets', 'ready', `${ticket.id}.md`);
        fs.writeFileSync(ticketPath, `---
id: ${ticket.id}
title: ${ticket.title}
status: ready
priority: 3
type: IMPL
updated_at: ${ticket.updated_at}
---

# ${ticket.title}
`);
      }

      provider.setSortMode('date');

      const children = await provider.getChildren();
      const statusGroup = children[0] as StatusGroupTreeItem;
      const tickets = (await provider.getChildren(statusGroup)) as TicketTreeItem[];

      assert.strictEqual(tickets.length, 3, 'Should have 3 tickets');
      assert.strictEqual(
        tickets[0].ticket.id,
        'DATE-002',
        'First ticket should be newest (2026-03-03)'
      );
      assert.strictEqual(
        tickets[1].ticket.id,
        'DATE-003',
        'Second ticket should be middle (2026-03-02)'
      );
      assert.strictEqual(
        tickets[2].ticket.id,
        'DATE-001',
        'Third ticket should be oldest (2026-03-01)'
      );
    });

    test('sort by priority (ascending)', async () => {
      const ticket1: Ticket = {
        id: 'PRIORITY-001',
        title: 'Priority 3 ticket',
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
        id: 'PRIORITY-002',
        title: 'Priority 1 ticket',
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
        id: 'PRIORITY-003',
        title: 'Priority 2 ticket',
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

      // Create ticket files
      for (const ticket of [ticket1, ticket2, ticket3]) {
        const ticketPath = path.join(tempWorkflowRoot, 'tickets', 'ready', `${ticket.id}.md`);
        fs.writeFileSync(ticketPath, `---
id: ${ticket.id}
title: ${ticket.title}
status: ready
priority: ${ticket.priority}
type: IMPL
---

# ${ticket.title}
`);
      }

      provider.setSortMode('priority');

      const children = await provider.getChildren();
      const statusGroup = children[0] as StatusGroupTreeItem;
      const tickets = (await provider.getChildren(statusGroup)) as TicketTreeItem[];

      assert.strictEqual(tickets.length, 3, 'Should have 3 tickets');
      assert.strictEqual(
        tickets[0].ticket.priority,
        1,
        'First ticket should have priority 1'
      );
      assert.strictEqual(
        tickets[1].ticket.priority,
        2,
        'Second ticket should have priority 2'
      );
      assert.strictEqual(
        tickets[2].ticket.priority,
        3,
        'Third ticket should have priority 3'
      );
    });

  });

});
