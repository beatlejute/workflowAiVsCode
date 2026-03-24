/**
 * SidebarTreeProvider Unit Tests
 *
 * Tests for sidebar tree providers including:
 * - TicketsTreeProvider (grouping by status, counts, sorting)
 * - PlansTreeProvider (current/archive grouping)
 * - ReportsTreeProvider (sorting by date)
 * - PipelineTreeProvider (stages from config)
 * - Reactive updates via Store events
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowStore } from '../../data/workflow-store';
import {
  TicketsTreeProvider,
  PlansTreeProvider,
  ReportsTreeProvider,
  PipelineTreeProvider,
  SidebarTreeItem,
  TicketTreeItem,
  PlanTreeItem,
  ReportTreeItem,
  StatusGroupTreeItem,
  PlanGroupTreeItem
} from '../../ui/sidebar-tree-provider';
import { Ticket, TicketStatus, Plan, Report } from '../../data/types';

suite('SidebarTreeProvider Suite', () => {

  let store: WorkflowStore;
  let testDir: string;
  let workflowRoot: string;

  setup(() => {
    store = new WorkflowStore();
    testDir = path.join(__dirname, '../../../../tmp/test-sidebar-' + Date.now());
    workflowRoot = path.join(testDir, '.workflow');
    
    // Create test directory structure
    fs.mkdirSync(workflowRoot, { recursive: true });
    fs.mkdirSync(path.join(workflowRoot, 'tickets', 'backlog'), { recursive: true });
    fs.mkdirSync(path.join(workflowRoot, 'tickets', 'ready'), { recursive: true });
    fs.mkdirSync(path.join(workflowRoot, 'tickets', 'in-progress'), { recursive: true });
    fs.mkdirSync(path.join(workflowRoot, 'tickets', 'blocked'), { recursive: true });
    fs.mkdirSync(path.join(workflowRoot, 'tickets', 'review'), { recursive: true });
    fs.mkdirSync(path.join(workflowRoot, 'tickets', 'done'), { recursive: true });
    fs.mkdirSync(path.join(workflowRoot, 'plans', 'current'), { recursive: true });
    fs.mkdirSync(path.join(workflowRoot, 'plans', 'archive'), { recursive: true });
    fs.mkdirSync(path.join(workflowRoot, 'reports'), { recursive: true });
  });

  teardown(async () => {
    store.clear();
    // Cleanup test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ==================== Helper Functions ====================

  /**
   * Create test ticket
   */
  function createTestTicket(
    id: string,
    title: string,
    status: TicketStatus,
    priority: number = 3
  ): Ticket {
    const now = new Date().toISOString();
    return {
      id,
      title,
      status,
      priority,
      type: 'impl',
      dependencies: [],
      conditions: [],
      context: {},
      tags: [],
      complexity: 'medium',
      parent_plan: '',
      parent_task: '',
      created_at: now,
      updated_at: now,
      completed_at: ''
    };
  }

  /**
   * Create test plan
   */
  function createTestPlan(
    id: string,
    title: string,
    completed: boolean = false
  ): Plan {
    const now = new Date().toISOString();
    return {
      id,
      title,
      status: completed ? 'completed' : 'active',
      author: 'test',
      created_at: now,
      updated_at: now,
      completed_at: completed ? now : '',
      previous_plan: '',
      related_reports: [],
      folder: completed ? 'archive' : 'current'
    };
  }

  /**
   * Create test report
   */
  function createTestReport(
    id: string,
    title: string,
    createdAt: string
  ): Report {
    return {
      id,
      title,
      type: 'summary',
      created_at: createdAt,
      summary: 'Test report'
    };
  }

  // ==================== TicketsTreeProvider Tests ====================

  suite('TicketsTreeProvider', () => {

    test('should return empty array when no tickets', async () => {
      const provider = new TicketsTreeProvider(store);
      provider.setWorkflowRoot(workflowRoot);

      const children = await provider.getChildren();
      
      assert.strictEqual(children.length, 0);
    });

    test('should group tickets by status with correct counts', async () => {
      const provider = new TicketsTreeProvider(store);
      provider.setWorkflowRoot(workflowRoot);

      // Add tickets to different statuses
      store.addTicket(createTestTicket('IMPL-001', 'Ticket 1', TicketStatus.Backlog));
      store.addTicket(createTestTicket('IMPL-002', 'Ticket 2', TicketStatus.Backlog));
      store.addTicket(createTestTicket('IMPL-003', 'Ticket 3', TicketStatus.Ready));
      store.addTicket(createTestTicket('IMPL-004', 'Ticket 4', TicketStatus.InProgress));

      const groups = await provider.getChildren() as StatusGroupTreeItem[];

      assert.strictEqual(groups.length, 3); // Only statuses with tickets
      
      const backlogGroup = groups.find(g => g.status === TicketStatus.Backlog);
      assert.ok(backlogGroup);
      assert.strictEqual(backlogGroup.count, 2);
      assert.strictEqual(backlogGroup.label, 'backlog (2)');

      const readyGroup = groups.find(g => g.status === TicketStatus.Ready);
      assert.ok(readyGroup);
      assert.strictEqual(readyGroup.count, 1);

      const inProgressGroup = groups.find(g => g.status === TicketStatus.InProgress);
      assert.ok(inProgressGroup);
      assert.strictEqual(inProgressGroup.count, 1);
    });

    test('should return tickets for status group sorted by priority', async () => {
      const provider = new TicketsTreeProvider(store);
      provider.setWorkflowRoot(workflowRoot);

      // Add tickets with different priorities
      store.addTicket(createTestTicket('IMPL-001', 'Low Priority', TicketStatus.Backlog, 5));
      store.addTicket(createTestTicket('IMPL-002', 'High Priority', TicketStatus.Backlog, 2));
      store.addTicket(createTestTicket('IMPL-003', 'Critical', TicketStatus.Backlog, 1));
      store.addTicket(createTestTicket('IMPL-004', 'Medium Priority', TicketStatus.Backlog, 3));

      const groups = await provider.getChildren() as StatusGroupTreeItem[];
      const backlogGroup = groups.find(g => g.status === TicketStatus.Backlog)!;
      
      const tickets = await provider.getChildren(backlogGroup) as TicketTreeItem[];

      assert.strictEqual(tickets.length, 4);
      // Should be sorted by priority (ascending)
      assert.strictEqual(tickets[0].ticket.priority, 1); // Critical first
      assert.strictEqual(tickets[1].ticket.priority, 2);
      assert.strictEqual(tickets[2].ticket.priority, 3);
      assert.strictEqual(tickets[3].ticket.priority, 5);
    });

    test('should refresh on store ticket event', async () => {
      const provider = new TicketsTreeProvider(store);
      provider.setWorkflowRoot(workflowRoot);

      let refreshCount = 0;
      provider.onDidChangeTreeData(() => {
        refreshCount++;
      });

      // Initial load
      await provider.getChildren();

      // Add ticket should trigger refresh
      store.addTicket(createTestTicket('IMPL-001', 'New Ticket', TicketStatus.Backlog));

      // Allow event to propagate
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.strictEqual(refreshCount, 1);
    });

    test('TicketTreeItem should have correct properties', () => {
      const ticket = createTestTicket('IMPL-001', 'Test Ticket', TicketStatus.Backlog, 2);
      const item = new TicketTreeItem(ticket, workflowRoot);

      assert.strictEqual(item.label, 'IMPL-001');
      assert.strictEqual(item.description, 'Test Ticket');
      assert.strictEqual(item.itemType, 'ticket');
      assert.strictEqual(item.id, 'IMPL-001');
      // tooltip is resolved lazily via resolveTreeItem
      assert.strictEqual(item.tooltip, undefined, 'Tooltip should be undefined before resolve');
      assert.ok(item.command);
      assert.ok(item.iconPath);
      assert.strictEqual(item.contextValue, 'ticket');
    });

    test('TicketTreeItem should have contextValue for context menu', () => {
      const ticket = createTestTicket('IMPL-001', 'Test Ticket', TicketStatus.InProgress, 1);
      const item = new TicketTreeItem(ticket, workflowRoot);

      assert.strictEqual(item.contextValue, 'ticket');
    });

    test('TicketTreeItem should have command to open ticket file', () => {
      const ticket = createTestTicket('IMPL-001', 'Test Ticket', TicketStatus.Ready, 3);
      const item = new TicketTreeItem(ticket, workflowRoot);

      assert.ok(item.command);
      assert.strictEqual(item.command.command, 'vscode.open');
      assert.ok(item.command.arguments);
      assert.strictEqual(item.command.arguments.length, 1);
    });

    test('TicketTreeItem contextValue enables inline actions', () => {
      const ticket = createTestTicket('IMPL-001', 'Test Ticket', TicketStatus.InProgress, 1);
      const item = new TicketTreeItem(ticket, workflowRoot);

      // contextValue='ticket' is used in package.json when clause:
      // when: view == workflow-sidebar.tickets && viewItem == ticket
      // This enables inline actions (Move next, Edit) via menus.view/item/context with group: inline
      assert.strictEqual(item.contextValue, 'ticket');
    });

    test('StatusGroupTreeItem should have collapsible state', () => {
      const item = new StatusGroupTreeItem(TicketStatus.Backlog, 3);

      assert.strictEqual(item.label, 'backlog (3)');
      assert.strictEqual(item.itemType, 'status-group');
      assert.strictEqual(item.contextValue, 'status-group');
    });
  });

  // ==================== PlansTreeProvider Tests ====================

  suite('PlansTreeProvider', () => {

    test('should return empty array when no plans', async () => {
      const provider = new PlansTreeProvider(store);
      provider.setWorkflowRoot(workflowRoot);

      const children = await provider.getChildren();
      
      assert.strictEqual(children.length, 0);
    });

    test('should group plans into current and archive', async () => {
      const provider = new PlansTreeProvider(store);
      provider.setWorkflowRoot(workflowRoot);

      // Add plans
      store.addPlan(createTestPlan('PLAN-001', 'Current Plan 1', false));
      store.addPlan(createTestPlan('PLAN-002', 'Current Plan 2', false));
      store.addPlan(createTestPlan('PLAN-003', 'Archived Plan 1', true));

      const groups = await provider.getChildren() as PlanGroupTreeItem[];

      assert.strictEqual(groups.length, 2); // current and archive

      const currentGroup = groups.find(g => g.groupType === 'current');
      assert.ok(currentGroup);
      assert.strictEqual(currentGroup.count, 2);

      const archiveGroup = groups.find(g => g.groupType === 'archive');
      assert.ok(archiveGroup);
      assert.strictEqual(archiveGroup.count, 1);
    });

    test('should return plans for group sorted by ID', async () => {
      const provider = new PlansTreeProvider(store);
      provider.setWorkflowRoot(workflowRoot);

      // Add plans in random order
      store.addPlan(createTestPlan('PLAN-003', 'Plan C', false));
      store.addPlan(createTestPlan('PLAN-001', 'Plan A', false));
      store.addPlan(createTestPlan('PLAN-002', 'Plan B', false));

      const groups = await provider.getChildren() as PlanGroupTreeItem[];
      const currentGroup = groups.find(g => g.groupType === 'current')!;
      
      const plans = await provider.getChildren(currentGroup) as PlanTreeItem[];

      assert.strictEqual(plans.length, 3);
      // Should be sorted by ID
      assert.strictEqual(plans[0].plan.id, 'PLAN-001');
      assert.strictEqual(plans[1].plan.id, 'PLAN-002');
      assert.strictEqual(plans[2].plan.id, 'PLAN-003');
    });

    test('should only show archive group when no current plans', async () => {
      const provider = new PlansTreeProvider(store);
      provider.setWorkflowRoot(workflowRoot);

      store.addPlan(createTestPlan('PLAN-001', 'Archived Plan', true));

      const groups = await provider.getChildren() as PlanGroupTreeItem[];

      assert.strictEqual(groups.length, 1);
      assert.strictEqual(groups[0].groupType, 'archive');
    });

    test('should refresh on store plan event', async () => {
      const provider = new PlansTreeProvider(store);
      provider.setWorkflowRoot(workflowRoot);

      let refreshCount = 0;
      provider.onDidChangeTreeData(() => {
        refreshCount++;
      });

      store.addPlan(createTestPlan('PLAN-001', 'New Plan', false));

      await new Promise(resolve => setTimeout(resolve, 10));

      assert.strictEqual(refreshCount, 1);
    });

    test('PlanTreeItem should have correct properties', () => {
      const plan = createTestPlan('PLAN-001', 'Test Plan', false);
      const item = new PlanTreeItem(plan, workflowRoot, true);

      assert.strictEqual(item.label, 'PLAN-001');
      assert.strictEqual(item.description, 'Test Plan');
      assert.strictEqual(item.itemType, 'plan');
      assert.ok(item.command);
    });
  });

  // ==================== ReportsTreeProvider Tests ====================

  suite('ReportsTreeProvider', () => {

    test('should return empty array when no reports', async () => {
      const provider = new ReportsTreeProvider(store);
      provider.setWorkflowRoot(workflowRoot);

      const children = await provider.getChildren();
      
      assert.strictEqual(children.length, 0);
    });

    test('should return reports sorted by date (newest first)', async () => {
      const provider = new ReportsTreeProvider(store);
      provider.setWorkflowRoot(workflowRoot);

      // Add reports in random order
      store.addReport(createTestReport('RPT-001', 'Old Report', '2026-03-01T00:00:00Z'));
      store.addReport(createTestReport('RPT-003', 'Newest Report', '2026-03-05T00:00:00Z'));
      store.addReport(createTestReport('RPT-002', 'Recent Report', '2026-03-03T00:00:00Z'));

      const items = await provider.getChildren() as ReportTreeItem[];

      assert.strictEqual(items.length, 3);
      // Should be sorted by created_at descending
      assert.strictEqual(items[0].report.created_at, '2026-03-05T00:00:00Z');
      assert.strictEqual(items[1].report.created_at, '2026-03-03T00:00:00Z');
      assert.strictEqual(items[2].report.created_at, '2026-03-01T00:00:00Z');
    });

    test('should refresh on store report event', async () => {
      const provider = new ReportsTreeProvider(store);
      provider.setWorkflowRoot(workflowRoot);

      let refreshCount = 0;
      provider.onDidChangeTreeData(() => {
        refreshCount++;
      });

      store.addReport(createTestReport('RPT-001', 'New Report', '2026-03-05T00:00:00Z'));

      await new Promise(resolve => setTimeout(resolve, 10));

      assert.strictEqual(refreshCount, 1);
    });

    test('ReportTreeItem should have correct properties', () => {
      const report = createTestReport('RPT-001', 'Test Report', '2026-03-05T00:00:00Z');
      const item = new ReportTreeItem(report, workflowRoot);

      assert.strictEqual(item.label, 'RPT-001');
      assert.strictEqual(item.description, 'Test Report');
      assert.strictEqual(item.itemType, 'report');
      assert.ok(item.tooltip);
      assert.ok(item.command);
    });
  });

  // ==================== PipelineTreeProvider Tests ====================

  suite('PipelineTreeProvider', () => {

    test('should return empty array when no pipeline config', async () => {
      const provider = new PipelineTreeProvider(store);
      provider.setWorkflowRoot(workflowRoot);

      const children = await provider.getChildren();
      
      assert.strictEqual(children.length, 0);
    });

    test('should return pipeline stages from config', async () => {
      const provider = new PipelineTreeProvider(store);
      provider.setWorkflowRoot(workflowRoot);

      // Set mock pipeline config
      const mockPipeline: { pipeline: { name: string; version: string; agents: Record<string, unknown>; stages: Record<string, { description: string }>; entry: string } } = {
        pipeline: {
          name: 'Test Pipeline',
          version: '1.0',
          agents: {},
          stages: {
            'plan': { description: 'Planning stage' },
            'execute': { description: 'Execution stage' },
            'review': { description: 'Review stage' }
          },
          entry: 'plan'
        }
      };

      // Access private setPipeline method via store
      (store as unknown as { setPipeline: (p: typeof mockPipeline) => void }).setPipeline(mockPipeline);

      const items = await provider.getChildren() as SidebarTreeItem[];

      assert.strictEqual(items.length, 3);
      
      const stageIds = items.map(item => item.id);
      assert.ok(stageIds.includes('plan'));
      assert.ok(stageIds.includes('execute'));
      assert.ok(stageIds.includes('review'));
    });

    test('should refresh on store config event', async () => {
      const provider = new PipelineTreeProvider(store);
      provider.setWorkflowRoot(workflowRoot);

      let refreshCount = 0;
      provider.onDidChangeTreeData(() => {
        refreshCount++;
      });

      const mockPipeline: { pipeline: { name: string; version: string; agents: Record<string, unknown>; stages: Record<string, { description: string }>; entry: string } } = {
        pipeline: {
          name: 'Test Pipeline',
          version: '1.0',
          agents: {},
          stages: {
            'plan': { description: 'Planning stage' }
          },
          entry: 'plan'
        }
      };

      (store as unknown as { setPipeline: (p: typeof mockPipeline) => void }).setPipeline(mockPipeline);

      await new Promise(resolve => setTimeout(resolve, 10));

      assert.strictEqual(refreshCount, 1);
    });
  });

  // ==================== Integration Tests ====================

  suite('SidebarTreeProvider Integration', () => {

    test('should handle full workflow with tickets, plans, and reports', async () => {
      // Initialize store with test data
      await store.refresh(path.join(testDir, '.workflow'));

      // Add tickets
      store.addTicket(createTestTicket('IMPL-001', 'Task 1', TicketStatus.Ready, 2));
      store.addTicket(createTestTicket('IMPL-002', 'Task 2', TicketStatus.InProgress, 1));
      store.addTicket(createTestTicket('IMPL-003', 'Task 3', TicketStatus.Done, 3));

      // Add plans
      store.addPlan(createTestPlan('PLAN-001', 'Current Plan', false));
      store.addPlan(createTestPlan('PLAN-002', 'Archived Plan', true));

      // Add reports
      store.addReport(createTestReport('RPT-001', 'Report 1', '2026-03-04T00:00:00Z'));
      store.addReport(createTestReport('RPT-002', 'Report 2', '2026-03-05T00:00:00Z'));

      // Create providers
      const ticketsProvider = new TicketsTreeProvider(store);
      const plansProvider = new PlansTreeProvider(store);
      const reportsProvider = new ReportsTreeProvider(store);

      ticketsProvider.setWorkflowRoot(workflowRoot);
      plansProvider.setWorkflowRoot(workflowRoot);
      reportsProvider.setWorkflowRoot(workflowRoot);

      // Verify tickets
      const ticketGroups = await ticketsProvider.getChildren() as StatusGroupTreeItem[];
      assert.strictEqual(ticketGroups.length, 3); // ready, in-progress, done

      // Verify plans
      const planGroups = await plansProvider.getChildren() as PlanGroupTreeItem[];
      assert.strictEqual(planGroups.length, 2); // current, archive

      // Verify reports
      const reports = await reportsProvider.getChildren() as ReportTreeItem[];
      assert.strictEqual(reports.length, 2);
      assert.strictEqual(reports[0].report.id, 'RPT-002'); // Newest first
    });
  });
});
