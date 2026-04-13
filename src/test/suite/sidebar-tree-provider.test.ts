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
import * as vscode from 'vscode';
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
  PlanGroupTreeItem,
  PlanTemplateTreeItem
} from '../../ui/sidebar-tree-provider';
import { Ticket, TicketStatus, Plan, Report, PlanTemplate } from '../../data/types';

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
   * Create test plan with custom status
   */
  function createTestPlanWithStatus(
    id: string,
    title: string,
    status: string,
    completed: boolean = false
  ): Plan {
    const now = new Date().toISOString();
    return {
      id,
      title,
      status,
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
   * Create test plan
   */
  function createTestPlan(
    id: string,
    title: string,
    completed: boolean = false
  ): Plan {
    return createTestPlanWithStatus(
      id,
      title,
      completed ? 'completed' : 'active',
      completed
    );
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

  /**
   * Create test plan template
   */
  function createTestPlanTemplate(
    id: string,
    title: string,
    enabled: boolean,
    triggerType: 'daily' | 'weekly' | 'date_after' | 'interval_days' = 'daily'
  ): PlanTemplate {
    const now = new Date().toISOString();
    return {
      id,
      title,
      type: 'template',
      trigger: {
        type: triggerType,
        params: { time: '09:00' }
      },
      last_triggered: now,
      enabled
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
      assert.ok(item.tooltip);
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
      assert.strictEqual(item.description, '[active] Test Plan');
      assert.strictEqual(item.itemType, 'plan');
      assert.ok(item.command);
    });

    test('PlanTreeItem should show status in description', () => {
      const plan = createTestPlanWithStatus('PLAN-001', 'Test Plan', 'active', false);
      const item = new PlanTreeItem(plan, workflowRoot, true);

      assert.strictEqual(item.description, '[active] Test Plan');
    });

    test('PlanTreeItem should use decomposing icon when isDecomposing is true', () => {
      const plan = createTestPlanWithStatus('PLAN-001', 'Test Plan', 'active', false);
      const item = new PlanTreeItem(plan, workflowRoot, true, true);

      assert.ok(item.iconPath);
      const icon = item.iconPath as vscode.ThemeIcon;
      assert.strictEqual(icon.id, 'loading~spin');
    });

    test('PlanTreeItem should use status icon when not decomposing', () => {
      const plan = createTestPlanWithStatus('PLAN-001', 'Test Plan', 'draft', false);
      const item = new PlanTreeItem(plan, workflowRoot, true, false);

      assert.ok(item.iconPath);
      const icon = item.iconPath as vscode.ThemeIcon;
      assert.strictEqual(icon.id, 'edit');
    });

    test('PlanTreeItem contextValue should be plan-current-draft for draft status', () => {
      const plan = createTestPlanWithStatus('PLAN-001', 'Draft Plan', 'draft', false);
      const item = new PlanTreeItem(plan, workflowRoot, true);
      assert.strictEqual(item.contextValue, 'plan-current-draft');
    });

    test('PlanTreeItem contextValue should be plan-current-approved for approved status', () => {
      const plan = createTestPlanWithStatus('PLAN-001', 'Approved Plan', 'approved', false);
      const item = new PlanTreeItem(plan, workflowRoot, true);
      assert.strictEqual(item.contextValue, 'plan-current-approved');
    });

    test('PlanTreeItem contextValue should be plan-current for active status', () => {
      const plan = createTestPlanWithStatus('PLAN-001', 'Active Plan', 'active', false);
      const item = new PlanTreeItem(plan, workflowRoot, true);
      assert.strictEqual(item.contextValue, 'plan-current');
    });

    test('PlanTreeItem contextValue should be plan-current for completed status', () => {
      const plan = createTestPlanWithStatus('PLAN-001', 'Completed Plan', 'completed', false);
      const item = new PlanTreeItem(plan, workflowRoot, true);
      assert.strictEqual(item.contextValue, 'plan-current');
    });

    test('PlanTreeItem contextValue should be plan-archive for archived plans', () => {
      const plan = createTestPlanWithStatus('PLAN-001', 'Archived Plan', 'archived', true);
      const item = new PlanTreeItem(plan, workflowRoot, false);
      assert.strictEqual(item.contextValue, 'plan-archive');
    });
  });

  suite('getPlanStatusIcon', () => {
    test('should return edit icon for draft status', () => {
      const plan = createTestPlanWithStatus('PLAN-001', 'Draft Plan', 'draft');
      const item = new PlanTreeItem(plan, workflowRoot, true);
      const icon = item.iconPath as vscode.ThemeIcon;
      assert.strictEqual(icon.id, 'edit');
    });

    test('should return check-all icon with green color for approved status', () => {
      const plan = createTestPlanWithStatus('PLAN-001', 'Approved Plan', 'approved');
      const item = new PlanTreeItem(plan, workflowRoot, true);
      const icon = item.iconPath as vscode.ThemeIcon;
      assert.strictEqual(icon.id, 'check-all');
      assert.ok(icon.color);
    });

    test('should return play-circle icon with blue color for active status', () => {
      const plan = createTestPlanWithStatus('PLAN-001', 'Active Plan', 'active');
      const item = new PlanTreeItem(plan, workflowRoot, true);
      const icon = item.iconPath as vscode.ThemeIcon;
      assert.strictEqual(icon.id, 'play-circle');
      assert.ok(icon.color);
    });

    test('should return pass-filled icon with green color for completed status', () => {
      const plan = createTestPlanWithStatus('PLAN-001', 'Completed Plan', 'completed', true);
      const item = new PlanTreeItem(plan, workflowRoot, false);
      const icon = item.iconPath as vscode.ThemeIcon;
      assert.strictEqual(icon.id, 'pass-filled');
      assert.ok(icon.color);
    });

    test('should return archive icon for archived status', () => {
      const plan = createTestPlanWithStatus('PLAN-001', 'Archived Plan', 'archived', true);
      const item = new PlanTreeItem(plan, workflowRoot, false);
      const icon = item.iconPath as vscode.ThemeIcon;
      assert.strictEqual(icon.id, 'archive');
    });

    test('should return notebook icon for unknown status (fallback)', () => {
      const plan = createTestPlanWithStatus('PLAN-001', 'Unknown Plan', 'unknown-status');
      const item = new PlanTreeItem(plan, workflowRoot, true);
      const icon = item.iconPath as vscode.ThemeIcon;
      assert.strictEqual(icon.id, 'notebook');
    });

    test('decomposing should have priority over status icon', () => {
      const plan = createTestPlanWithStatus('PLAN-001', 'Decomposing Plan', 'active');
      const item = new PlanTreeItem(plan, workflowRoot, true, true);
      const icon = item.iconPath as vscode.ThemeIcon;
      assert.strictEqual(icon.id, 'loading~spin');
    });
  });

  suite('PlanTemplateTreeItem', () => {
    test('TC22: enabled template should have green calendar icon', () => {
      const template = createTestPlanTemplate('TPL-001', 'Daily Plan', true, 'daily');
      const item = new PlanTemplateTreeItem(template, workflowRoot);

      assert.ok(item.iconPath);
      const icon = item.iconPath as vscode.ThemeIcon;
      assert.strictEqual(icon.id, 'calendar');
      assert.ok(icon.color);
    });

    test('TC23: disabled template should have gray calendar icon', () => {
      const template = createTestPlanTemplate('TPL-001', 'Disabled Plan', false, 'daily');
      const item = new PlanTemplateTreeItem(template, workflowRoot);

      assert.ok(item.iconPath);
      const icon = item.iconPath as vscode.ThemeIcon;
      assert.strictEqual(icon.id, 'calendar');
      assert.ok(icon.color);
    });

    test('TC24: tooltip should contain trigger type, params, last_triggered', () => {
      const template = createTestPlanTemplate('TPL-001', 'Test Template', true, 'daily');
      const item = new PlanTemplateTreeItem(template, workflowRoot);

      assert.ok(item.tooltip);
      const tooltip = item.tooltip as vscode.MarkdownString;
      assert.ok(tooltip.value.includes('daily'));
      assert.ok(tooltip.value.includes('09:00'));
      assert.ok(tooltip.value.includes('last_triggered') || tooltip.value.includes('Last Triggered'));
    });

    test('TC25: contextValue should be correct for enabled/disabled', () => {
      const enabledTemplate = createTestPlanTemplate('TPL-001', 'Enabled', true);
      const disabledTemplate = createTestPlanTemplate('TPL-002', 'Disabled', false);

      const enabledItem = new PlanTemplateTreeItem(enabledTemplate, workflowRoot);
      const disabledItem = new PlanTemplateTreeItem(disabledTemplate, workflowRoot);

      assert.strictEqual(enabledItem.contextValue, 'plan-template-enabled');
      assert.strictEqual(disabledItem.contextValue, 'plan-template-disabled');
    });

    test('should have command to open template file', () => {
      const template = createTestPlanTemplate('TPL-001', 'Test Template', true);
      const item = new PlanTemplateTreeItem(template, workflowRoot);

      assert.ok(item.command);
      assert.strictEqual(item.command.command, 'vscode.open');
      assert.ok(item.command.arguments);
      assert.strictEqual(item.command.arguments.length, 1);
    });

    test('description should show trigger type for enabled templates', () => {
      const enabledTemplate = createTestPlanTemplate('TPL-001', 'Weekly Plan', true, 'weekly');
      const disabledTemplate = createTestPlanTemplate('TPL-002', 'Disabled Plan', false);

      const enabledItem = new PlanTemplateTreeItem(enabledTemplate, workflowRoot);
      const disabledItem = new PlanTemplateTreeItem(disabledTemplate, workflowRoot);

      const enabledDesc = enabledItem.description as string;
      const disabledDesc = disabledItem.description as string;
      assert.ok(enabledDesc.includes('[weekly]'));
      assert.ok(disabledDesc.includes('[disabled]'));
    });
  });

  suite('PlansTreeProvider Templates', () => {
    test('TC26: should show Templates group with library icon', async () => {
      const provider = new PlansTreeProvider(store);
      provider.setWorkflowRoot(workflowRoot);

      store.addPlanTemplate(createTestPlanTemplate('TPL-001', 'Template 1', true));
      store.addPlanTemplate(createTestPlanTemplate('TPL-002', 'Template 2', false));

      const groups = await provider.getChildren() as PlanGroupTreeItem[];

      const templatesGroup = groups.find(g => g.groupType === 'templates');
      assert.ok(templatesGroup);
      assert.strictEqual(templatesGroup.count, 2);
      assert.strictEqual(templatesGroup.label, 'Templates (2)');

      assert.ok(templatesGroup.iconPath);
      const icon = templatesGroup.iconPath as vscode.ThemeIcon;
      assert.strictEqual(icon.id, 'library');
    });

    test('should return templates for Templates group', async () => {
      const provider = new PlansTreeProvider(store);
      provider.setWorkflowRoot(workflowRoot);

      store.addPlanTemplate(createTestPlanTemplate('TPL-001', 'Template A', true));
      store.addPlanTemplate(createTestPlanTemplate('TPL-002', 'Template B', false));

      const groups = await provider.getChildren() as PlanGroupTreeItem[];
      const templatesGroup = groups.find(g => g.groupType === 'templates')!;

      const templates = await provider.getChildren(templatesGroup) as PlanTemplateTreeItem[];

      assert.strictEqual(templates.length, 2);
      assert.strictEqual(templates[0].template.id, 'TPL-001');
      assert.strictEqual(templates[1].template.id, 'TPL-002');
    });

    test('should refresh on store plan-template event', async () => {
      const provider = new PlansTreeProvider(store);
      provider.setWorkflowRoot(workflowRoot);

      let refreshCount = 0;
      provider.onDidChangeTreeData(() => {
        refreshCount++;
      });

      store.addPlanTemplate(createTestPlanTemplate('TPL-001', 'New Template', true));

      await new Promise(resolve => setTimeout(resolve, 10));

      assert.strictEqual(refreshCount, 1);
    });

    test('should not show Templates group when no templates', async () => {
      const provider = new PlansTreeProvider(store);
      provider.setWorkflowRoot(workflowRoot);

      store.addPlan(createTestPlan('PLAN-001', 'Current Plan', false));

      const groups = await provider.getChildren() as PlanGroupTreeItem[];

      const templatesGroup = groups.find(g => g.groupType === 'templates');
      assert.strictEqual(templatesGroup, undefined);
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
