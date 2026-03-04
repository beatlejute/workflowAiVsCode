/**
 * WorkflowStore Unit Tests
 *
 * Tests for the central data store including:
 * - refresh() loading from mock fs
 * - Incremental operations (add/update/remove)
 * - Event emission and batching
 * - Query methods
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { WorkflowStore, StoreChangeEvent } from '../../data/workflow-store';
import { Ticket, TicketStatus, Plan, Report } from '../../data/types';

suite('WorkflowStore Suite', () => {

  let store: WorkflowStore;
  let testDir: string;

  setup(() => {
    store = new WorkflowStore();
    testDir = path.join(__dirname, '../../../../tmp/test-store-' + Date.now());
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

  /**
   * Helper to create test directory structure
   */
  function createTestStructure(dir: string) {
    const workflowDir = path.join(dir, '.workflow');
    const ticketsDir = path.join(workflowDir, 'tickets');
    const plansDir = path.join(workflowDir, 'plans');
    const reportsDir = path.join(workflowDir, 'reports');
    const configDir = path.join(workflowDir, 'config');

    // Create ticket status folders
    const statuses = ['backlog', 'ready', 'in-progress', 'blocked', 'review', 'done'];
    for (const status of statuses) {
      fs.mkdirSync(path.join(ticketsDir, status), { recursive: true });
    }

    // Create plan folders
    fs.mkdirSync(path.join(plansDir, 'current'), { recursive: true });
    fs.mkdirSync(path.join(plansDir, 'archive'), { recursive: true });

    // Create reports folder
    fs.mkdirSync(reportsDir, { recursive: true });

    // Create config folder
    fs.mkdirSync(configDir, { recursive: true });

    return { workflowDir, ticketsDir, plansDir, reportsDir, configDir };
  }

  /**
   * Helper to create a test ticket file
   */
  function createTicketFile(dir: string, id: string, status: string, title: string, extraFields: Partial<Ticket> = {}) {
    const frontmatter = {
      id,
      title,
      status,
      priority: 2,
      type: 'IMPL',
      dependencies: [],
      conditions: [],
      context: {},
      tags: [],
      complexity: 'medium',
      parent_plan: 'PLAN-001',
      parent_task: '',
      created_at: '2026-03-04T00:00:00Z',
      updated_at: '2026-03-04T00:00:00Z',
      completed_at: '',
      ...extraFields
    };

    const yamlContent = yaml.dump(frontmatter, { indent: 2 });
    const content = `---\n${yamlContent}---\n## Test content`;
    const filePath = path.join(dir, `${id}.md`);
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * Helper to create a test plan file
   */
  function createPlanFile(dir: string, id: string, title: string, completed = false) {
    const frontmatter = {
      id,
      title,
      status: completed ? 'archived' : 'active',
      author: 'Test Author',
      created_at: '2026-03-04T00:00:00Z',
      updated_at: '2026-03-04T00:00:00Z',
      completed_at: completed ? '2026-03-04T12:00:00Z' : '',
      previous_plan: '',
      related_reports: []
    };

    const yamlContent = yaml.dump(frontmatter, { indent: 2 });
    const content = `---\n${yamlContent}---\n## Plan content`;
    const filePath = path.join(dir, `${id}.md`);
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * Helper to create a test report file
   */
  function createReportFile(dir: string, id: string, title: string) {
    const frontmatter = {
      id,
      title,
      type: 'sprint',
      created_at: '2026-03-04T00:00:00Z',
      summary: 'Test report summary'
    };

    const yamlContent = yaml.dump(frontmatter, { indent: 2 });
    const content = `---\n${yamlContent}---\n## Report content`;
    const filePath = path.join(dir, `${id}.md`);
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * Helper to create minimal config files
   */
  function createConfigFiles(configDir: string) {
    const configYaml = `version: "1.0"
project:
  name: Test Project
  description: Test Description
task_types:
  IMPL:
    description: Implementation
    prefix: IMPL
priorities:
  1: Critical
  2: High
statuses:
  backlog:
    description: Backlog
    color: gray
condition_types: {}
paths:
  tickets: .workflow/tickets
  plans: .workflow/plans
  reports: .workflow/reports
  archive: .workflow/archive
reporting:
  enabled: true
  auto_generate: true
`;

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
`;

    fs.writeFileSync(path.join(configDir, 'config.yaml'), configYaml, 'utf-8');
    fs.writeFileSync(path.join(configDir, 'pipeline.yaml'), pipelineYaml, 'utf-8');
  }

  suite('refresh() - Data Loading', () => {

    test('should load tickets from all 6 status folders', async () => {
      const { ticketsDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      // Create tickets in different status folders
      createTicketFile(path.join(ticketsDir, 'backlog'), 'BACKLOG-001', 'backlog', 'Backlog Ticket');
      createTicketFile(path.join(ticketsDir, 'ready'), 'READY-001', 'ready', 'Ready Ticket');
      createTicketFile(path.join(ticketsDir, 'in-progress'), 'IMPL-001', 'in-progress', 'In Progress Ticket');
      createTicketFile(path.join(ticketsDir, 'blocked'), 'BLOCKED-001', 'blocked', 'Blocked Ticket');
      createTicketFile(path.join(ticketsDir, 'review'), 'REVIEW-001', 'review', 'Review Ticket');
      createTicketFile(path.join(ticketsDir, 'done'), 'DONE-001', 'done', 'Done Ticket');

      await store.refresh(testDir);

      assert.strictEqual(store.getTickets().length, 6, 'Should load 6 tickets');
      assert.ok(store.getTicketById('BACKLOG-001'), 'Should find backlog ticket');
      assert.ok(store.getTicketById('READY-001'), 'Should find ready ticket');
      assert.ok(store.getTicketById('IMPL-001'), 'Should find in-progress ticket');
      assert.ok(store.getTicketById('BLOCKED-001'), 'Should find blocked ticket');
      assert.ok(store.getTicketById('REVIEW-001'), 'Should find review ticket');
      assert.ok(store.getTicketById('DONE-001'), 'Should find done ticket');
    });

    test('should load tickets with correct status from folder name', async () => {
      const { ticketsDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      // Create a ticket - status should be overridden by folder name
      createTicketFile(path.join(ticketsDir, 'ready'), 'TEST-001', 'backlog', 'Test Ticket');

      await store.refresh(testDir);

      const ticket = store.getTicketById('TEST-001');
      assert.strictEqual(ticket?.status, TicketStatus.Ready, 'Status should match folder, not frontmatter');
    });

    test('should load plans from current and archive folders', async () => {
      const { plansDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      createPlanFile(path.join(plansDir, 'current'), 'PLAN-001', 'Current Plan', false);
      createPlanFile(path.join(plansDir, 'archive'), 'PLAN-002', 'Archived Plan', true);

      await store.refresh(testDir);

      assert.strictEqual(store.getPlans().length, 2, 'Should load 2 plans');
      assert.ok(store.getPlanById('PLAN-001'), 'Should find current plan');
      assert.ok(store.getPlanById('PLAN-002'), 'Should find archived plan');
    });

    test('should load reports from reports folder', async () => {
      const { reportsDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      createReportFile(reportsDir, 'REPORT-001', 'Sprint Report 1');
      createReportFile(reportsDir, 'REPORT-002', 'Sprint Report 2');

      await store.refresh(testDir);

      assert.strictEqual(store.getReports().length, 2, 'Should load 2 reports');
      assert.ok(store.getReportById('REPORT-001'), 'Should find first report');
      assert.ok(store.getReportById('REPORT-002'), 'Should find second report');
    });

    test('should load configuration files', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(testDir);

      assert.ok(store.getConfig(), 'Should load workflow config');
      assert.ok(store.getPipeline(), 'Should load pipeline config');
      assert.strictEqual(store.getConfig()?.version, '1.0', 'Config version should match');
    });

    test('should handle missing folders gracefully', async () => {
      // Create minimal structure without some folders
      const workflowDir = path.join(testDir, '.workflow');
      const configDir = path.join(workflowDir, 'config');
      fs.mkdirSync(configDir, { recursive: true });
      createConfigFiles(configDir);

      // Should not throw even though ticket folders don't exist
      await assert.doesNotReject(async () => {
        await store.refresh(testDir);
      });

      // Should have empty data
      assert.strictEqual(store.getTickets().length, 0, 'Should have no tickets');
    });

    test('should handle invalid YAML in ticket files', async () => {
      const { ticketsDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      // Create invalid ticket file
      const invalidPath = path.join(ticketsDir, 'ready', 'INVALID-001.md');
      fs.writeFileSync(invalidPath, '---\ninvalid: yaml: content\n---', 'utf-8');

      // Create valid ticket
      createTicketFile(path.join(ticketsDir, 'ready'), 'VALID-001', 'ready', 'Valid Ticket');

      // Should not throw, should skip invalid file
      await assert.doesNotReject(async () => {
        await store.refresh(testDir);
      });

      // Should still load valid tickets
      assert.strictEqual(store.getTickets().length, 1, 'Should load valid ticket');
      assert.ok(store.getTicketById('VALID-001'), 'Should find valid ticket');
    });
  });

  suite('Event Emission - Batch on refresh()', () => {

    test('should emit refresh events after loading data', async () => {
      const { ticketsDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      createTicketFile(path.join(ticketsDir, 'ready'), 'TEST-001', 'ready', 'Test Ticket');

      const events: StoreChangeEvent[] = [];
      store.onDidChange((event) => {
        events.push(event);
      });

      await store.refresh(testDir);

      // Should emit refresh events for each type
      assert.ok(events.length >= 3, 'Should emit multiple refresh events');

      const ticketRefresh = events.find(e => e.type === 'ticket' && e.operation === 'refresh');
      const planRefresh = events.find(e => e.type === 'plan' && e.operation === 'refresh');
      const reportRefresh = events.find(e => e.type === 'report' && e.operation === 'refresh');

      assert.ok(ticketRefresh, 'Should emit ticket refresh event');
      assert.ok(planRefresh, 'Should emit plan refresh event');
      assert.ok(reportRefresh, 'Should emit report refresh event');
    });

    test('should emit config refresh event when config is loaded', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      const events: StoreChangeEvent[] = [];
      store.onDidChange((event) => {
        events.push(event);
      });

      await store.refresh(testDir);

      const configRefresh = events.find(e => e.type === 'config' && e.operation === 'refresh');
      assert.ok(configRefresh, 'Should emit config refresh event');
    });

    test('refresh events should not have id (batch operation)', async () => {
      const { ticketsDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      createTicketFile(path.join(ticketsDir, 'ready'), 'TEST-001', 'ready', 'Test Ticket');

      const events: StoreChangeEvent[] = [];
      store.onDidChange((event) => {
        events.push(event);
      });

      await store.refresh(testDir);

      const ticketRefresh = events.find(e => e.type === 'ticket' && e.operation === 'refresh');
      assert.strictEqual(ticketRefresh?.id, undefined, 'Refresh event should not have id');
    });
  });

  suite('Incremental Operations', () => {

    test('addTicket should add ticket and emit add event', async () => {
      const ticket: Ticket = {
        id: 'TEST-001',
        title: 'Test Ticket',
        status: TicketStatus.Backlog,
        priority: 2,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: 'PLAN-001',
        parent_task: '',
        created_at: '2026-03-04T00:00:00Z',
        updated_at: '2026-03-04T00:00:00Z',
        completed_at: ''
      };

      const events: StoreChangeEvent[] = [];
      store.onDidChange((event) => {
        events.push(event);
      });

      store.addTicket(ticket);

      assert.strictEqual(store.getTickets().length, 1, 'Should have 1 ticket');
      assert.ok(store.getTicketById('TEST-001'), 'Should find added ticket');

      assert.strictEqual(events.length, 1, 'Should emit 1 event');
      assert.strictEqual(events[0].type, 'ticket', 'Event type should be ticket');
      assert.strictEqual(events[0].operation, 'add', 'Operation should be add');
      assert.strictEqual(events[0].id, 'TEST-001', 'Event id should match ticket id');
    });

    test('updateTicket should update ticket and emit update event', async () => {
      const ticket: Ticket = {
        id: 'TEST-001',
        title: 'Original Title',
        status: TicketStatus.Backlog,
        priority: 2,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: 'PLAN-001',
        parent_task: '',
        created_at: '2026-03-04T00:00:00Z',
        updated_at: '2026-03-04T00:00:00Z',
        completed_at: ''
      };

      store.addTicket(ticket);

      const events: StoreChangeEvent[] = [];
      store.onDidChange((event) => {
        events.push(event);
      });

      const updatedTicket: Ticket = { ...ticket, title: 'Updated Title' };
      store.updateTicket('TEST-001', updatedTicket);

      const found = store.getTicketById('TEST-001');
      assert.strictEqual(found?.title, 'Updated Title', 'Ticket should be updated');

      assert.strictEqual(events.length, 1, 'Should emit 1 event');
      assert.strictEqual(events[0].operation, 'update', 'Operation should be update');
    });

    test('updateTicket should throw if ticket not found', async () => {
      assert.throws(
        () => store.updateTicket('NONEXISTENT', {} as Ticket),
        /Ticket NONEXISTENT not found/
      );
    });

    test('removeTicket should remove ticket and emit delete event', async () => {
      const ticket: Ticket = {
        id: 'TEST-001',
        title: 'Test Ticket',
        status: TicketStatus.Backlog,
        priority: 2,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: 'PLAN-001',
        parent_task: '',
        created_at: '2026-03-04T00:00:00Z',
        updated_at: '2026-03-04T00:00:00Z',
        completed_at: ''
      };

      store.addTicket(ticket);

      const events: StoreChangeEvent[] = [];
      store.onDidChange((event) => {
        events.push(event);
      });

      store.removeTicket('TEST-001');

      assert.strictEqual(store.getTickets().length, 0, 'Should have 0 tickets');
      assert.strictEqual(store.getTicketById('TEST-001'), undefined, 'Ticket should be removed');

      assert.strictEqual(events.length, 1, 'Should emit 1 event');
      assert.strictEqual(events[0].operation, 'delete', 'Operation should be delete');
    });

    test('removeTicket should throw if ticket not found', async () => {
      assert.throws(
        () => store.removeTicket('NONEXISTENT'),
        /Ticket NONEXISTENT not found/
      );
    });

    test('addPlan should add plan and emit add event', async () => {
      const plan: Plan = {
        id: 'PLAN-001',
        title: 'Test Plan',
        status: 'active',
        author: 'Test Author',
        created_at: '2026-03-04T00:00:00Z',
        updated_at: '2026-03-04T00:00:00Z',
        completed_at: '',
        previous_plan: '',
        related_reports: []
      };

      const events: StoreChangeEvent[] = [];
      store.onDidChange((event) => {
        events.push(event);
      });

      store.addPlan(plan);

      assert.strictEqual(store.getPlans().length, 1, 'Should have 1 plan');
      assert.ok(store.getPlanById('PLAN-001'), 'Should find added plan');

      assert.strictEqual(events.length, 1, 'Should emit 1 event');
      assert.strictEqual(events[0].type, 'plan', 'Event type should be plan');
      assert.strictEqual(events[0].operation, 'add', 'Operation should be add');
    });

    test('updatePlan should update plan and emit update event', async () => {
      const plan: Plan = {
        id: 'PLAN-001',
        title: 'Original Title',
        status: 'active',
        author: 'Test Author',
        created_at: '2026-03-04T00:00:00Z',
        updated_at: '2026-03-04T00:00:00Z',
        completed_at: '',
        previous_plan: '',
        related_reports: []
      };

      store.addPlan(plan);

      const events: StoreChangeEvent[] = [];
      store.onDidChange((event) => {
        events.push(event);
      });

      const updatedPlan: Plan = { ...plan, title: 'Updated Title' };
      store.updatePlan('PLAN-001', updatedPlan);

      const found = store.getPlanById('PLAN-001');
      assert.strictEqual(found?.title, 'Updated Title', 'Plan should be updated');

      assert.strictEqual(events.length, 1, 'Should emit 1 event');
      assert.strictEqual(events[0].operation, 'update', 'Operation should be update');
    });

    test('removePlan should remove plan and emit delete event', async () => {
      const plan: Plan = {
        id: 'PLAN-001',
        title: 'Test Plan',
        status: 'active',
        author: 'Test Author',
        created_at: '2026-03-04T00:00:00Z',
        updated_at: '2026-03-04T00:00:00Z',
        completed_at: '',
        previous_plan: '',
        related_reports: []
      };

      store.addPlan(plan);

      const events: StoreChangeEvent[] = [];
      store.onDidChange((event) => {
        events.push(event);
      });

      store.removePlan('PLAN-001');

      assert.strictEqual(store.getPlans().length, 0, 'Should have 0 plans');
      assert.strictEqual(events.length, 1, 'Should emit 1 event');
      assert.strictEqual(events[0].operation, 'delete', 'Operation should be delete');
    });

    test('addReport should add report and emit add event', async () => {
      const report: Report = {
        id: 'REPORT-001',
        title: 'Test Report',
        type: 'sprint',
        created_at: '2026-03-04T00:00:00Z',
        summary: 'Test summary'
      };

      const events: StoreChangeEvent[] = [];
      store.onDidChange((event) => {
        events.push(event);
      });

      store.addReport(report);

      assert.strictEqual(store.getReports().length, 1, 'Should have 1 report');
      assert.ok(store.getReportById('REPORT-001'), 'Should find added report');

      assert.strictEqual(events.length, 1, 'Should emit 1 event');
      assert.strictEqual(events[0].type, 'report', 'Event type should be report');
      assert.strictEqual(events[0].operation, 'add', 'Operation should be add');
    });

    test('updateReport should update report and emit update event', async () => {
      const report: Report = {
        id: 'REPORT-001',
        title: 'Original Title',
        type: 'sprint',
        created_at: '2026-03-04T00:00:00Z',
        summary: 'Test summary'
      };

      store.addReport(report);

      const events: StoreChangeEvent[] = [];
      store.onDidChange((event) => {
        events.push(event);
      });

      const updatedReport: Report = { ...report, title: 'Updated Title' };
      store.updateReport('REPORT-001', updatedReport);

      const found = store.getReportById('REPORT-001');
      assert.strictEqual(found?.title, 'Updated Title', 'Report should be updated');

      assert.strictEqual(events.length, 1, 'Should emit 1 event');
      assert.strictEqual(events[0].operation, 'update', 'Operation should be update');
    });

    test('removeReport should remove report and emit delete event', async () => {
      const report: Report = {
        id: 'REPORT-001',
        title: 'Test Report',
        type: 'sprint',
        created_at: '2026-03-04T00:00:00Z',
        summary: 'Test summary'
      };

      store.addReport(report);

      const events: StoreChangeEvent[] = [];
      store.onDidChange((event) => {
        events.push(event);
      });

      store.removeReport('REPORT-001');

      assert.strictEqual(store.getReports().length, 0, 'Should have 0 reports');
      assert.strictEqual(events.length, 1, 'Should emit 1 event');
      assert.strictEqual(events[0].operation, 'delete', 'Operation should be delete');
    });
  });

  suite('Query Methods', () => {

    test('getTickets should return all tickets', async () => {
      const tickets: Ticket[] = [
        { id: 'T1', title: 'Ticket 1', status: TicketStatus.Backlog, priority: 1, type: 'IMPL', dependencies: [], conditions: [], context: {}, tags: [], complexity: 'low', parent_plan: '', parent_task: '', created_at: '', updated_at: '', completed_at: '' },
        { id: 'T2', title: 'Ticket 2', status: TicketStatus.Ready, priority: 2, type: 'IMPL', dependencies: [], conditions: [], context: {}, tags: [], complexity: 'low', parent_plan: '', parent_task: '', created_at: '', updated_at: '', completed_at: '' }
      ];

      tickets.forEach(t => store.addTicket(t));

      const all = store.getTickets();
      assert.strictEqual(all.length, 2, 'Should return all tickets');
    });

    test('getTicketById should return specific ticket', async () => {
      const ticket: Ticket = {
        id: 'TEST-001',
        title: 'Test Ticket',
        status: TicketStatus.Backlog,
        priority: 2,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'low',
        parent_plan: '',
        parent_task: '',
        created_at: '',
        updated_at: '',
        completed_at: ''
      };

      store.addTicket(ticket);

      const found = store.getTicketById('TEST-001');
      assert.ok(found, 'Should find ticket by id');
      assert.strictEqual(found?.title, 'Test Ticket', 'Should return correct ticket');
    });

    test('getTicketsByStatus should filter tickets by status', async () => {
      const tickets: Ticket[] = [
        { id: 'T1', title: 'Ticket 1', status: TicketStatus.Backlog, priority: 1, type: 'IMPL', dependencies: [], conditions: [], context: {}, tags: [], complexity: 'low', parent_plan: '', parent_task: '', created_at: '', updated_at: '', completed_at: '' },
        { id: 'T2', title: 'Ticket 2', status: TicketStatus.Ready, priority: 2, type: 'IMPL', dependencies: [], conditions: [], context: {}, tags: [], complexity: 'low', parent_plan: '', parent_task: '', created_at: '', updated_at: '', completed_at: '' },
        { id: 'T3', title: 'Ticket 3', status: TicketStatus.Backlog, priority: 3, type: 'IMPL', dependencies: [], conditions: [], context: {}, tags: [], complexity: 'low', parent_plan: '', parent_task: '', created_at: '', updated_at: '', completed_at: '' }
      ];

      tickets.forEach(t => store.addTicket(t));

      const backlog = store.getTicketsByStatus(TicketStatus.Backlog);
      assert.strictEqual(backlog.length, 2, 'Should return 2 backlog tickets');

      const ready = store.getTicketsByStatus(TicketStatus.Ready);
      assert.strictEqual(ready.length, 1, 'Should return 1 ready ticket');
    });

    test('getTicketsByPriority should filter tickets by priority', async () => {
      const tickets: Ticket[] = [
        { id: 'T1', title: 'Ticket 1', status: TicketStatus.Backlog, priority: 1, type: 'IMPL', dependencies: [], conditions: [], context: {}, tags: [], complexity: 'low', parent_plan: '', parent_task: '', created_at: '', updated_at: '', completed_at: '' },
        { id: 'T2', title: 'Ticket 2', status: TicketStatus.Backlog, priority: 2, type: 'IMPL', dependencies: [], conditions: [], context: {}, tags: [], complexity: 'low', parent_plan: '', parent_task: '', created_at: '', updated_at: '', completed_at: '' },
        { id: 'T3', title: 'Ticket 3', status: TicketStatus.Backlog, priority: 1, type: 'IMPL', dependencies: [], conditions: [], context: {}, tags: [], complexity: 'low', parent_plan: '', parent_task: '', created_at: '', updated_at: '', completed_at: '' }
      ];

      tickets.forEach(t => store.addTicket(t));

      const critical = store.getTicketsByPriority(1);
      assert.strictEqual(critical.length, 2, 'Should return 2 critical tickets');
    });

    test('getTicketsWithDependency should find tickets depending on specific ticket', async () => {
      const tickets: Ticket[] = [
        { id: 'T1', title: 'Ticket 1', status: TicketStatus.Backlog, priority: 1, type: 'IMPL', dependencies: [], conditions: [], context: {}, tags: [], complexity: 'low', parent_plan: '', parent_task: '', created_at: '', updated_at: '', completed_at: '' },
        { id: 'T2', title: 'Ticket 2', status: TicketStatus.Backlog, priority: 2, type: 'IMPL', dependencies: ['T1'], conditions: [], context: {}, tags: [], complexity: 'low', parent_plan: '', parent_task: '', created_at: '', updated_at: '', completed_at: '' },
        { id: 'T3', title: 'Ticket 3', status: TicketStatus.Backlog, priority: 3, type: 'IMPL', dependencies: ['T1', 'T2'], conditions: [], context: {}, tags: [], complexity: 'low', parent_plan: '', parent_task: '', created_at: '', updated_at: '', completed_at: '' }
      ];

      tickets.forEach(t => store.addTicket(t));

      const dependents = store.getTicketsWithDependency('T1');
      assert.strictEqual(dependents.length, 2, 'Should return 2 tickets depending on T1');
    });

    test('getPlans should return all plans', async () => {
      const plans: Plan[] = [
        { id: 'P1', title: 'Plan 1', status: 'active', author: 'Author', created_at: '', updated_at: '', completed_at: '', previous_plan: '', related_reports: [] },
        { id: 'P2', title: 'Plan 2', status: 'active', author: 'Author', created_at: '', updated_at: '', completed_at: '', previous_plan: '', related_reports: [] }
      ];

      plans.forEach(p => store.addPlan(p));

      const all = store.getPlans();
      assert.strictEqual(all.length, 2, 'Should return all plans');
    });

    test('getPlanById should return specific plan', async () => {
      const plan: Plan = {
        id: 'PLAN-001',
        title: 'Test Plan',
        status: 'active',
        author: 'Author',
        created_at: '',
        updated_at: '',
        completed_at: '',
        previous_plan: '',
        related_reports: []
      };

      store.addPlan(plan);

      const found = store.getPlanById('PLAN-001');
      assert.ok(found, 'Should find plan by id');
      assert.strictEqual(found?.title, 'Test Plan', 'Should return correct plan');
    });

    test('getCurrentPlans should return only non-completed plans', async () => {
      const plans: Plan[] = [
        { id: 'P1', title: 'Current Plan', status: 'active', author: 'Author', created_at: '', updated_at: '', completed_at: '', previous_plan: '', related_reports: [] },
        { id: 'P2', title: 'Archived Plan', status: 'archived', author: 'Author', created_at: '', updated_at: '', completed_at: '2026-03-04T12:00:00Z', previous_plan: '', related_reports: [] }
      ];

      plans.forEach(p => store.addPlan(p));

      const current = store.getCurrentPlans();
      assert.strictEqual(current.length, 1, 'Should return 1 current plan');
      assert.strictEqual(current[0].id, 'P1', 'Should return the non-completed plan');
    });

    test('getArchivedPlans should return only completed plans', async () => {
      const plans: Plan[] = [
        { id: 'P1', title: 'Current Plan', status: 'active', author: 'Author', created_at: '', updated_at: '', completed_at: '', previous_plan: '', related_reports: [] },
        { id: 'P2', title: 'Archived Plan', status: 'archived', author: 'Author', created_at: '', updated_at: '', completed_at: '2026-03-04T12:00:00Z', previous_plan: '', related_reports: [] }
      ];

      plans.forEach(p => store.addPlan(p));

      const archived = store.getArchivedPlans();
      assert.strictEqual(archived.length, 1, 'Should return 1 archived plan');
      assert.strictEqual(archived[0].id, 'P2', 'Should return the completed plan');
    });

    test('getReports should return all reports', async () => {
      const reports: Report[] = [
        { id: 'R1', title: 'Report 1', type: 'sprint', created_at: '', summary: 'Summary 1' },
        { id: 'R2', title: 'Report 2', type: 'sprint', created_at: '', summary: 'Summary 2' }
      ];

      reports.forEach(r => store.addReport(r));

      const all = store.getReports();
      assert.strictEqual(all.length, 2, 'Should return all reports');
    });

    test('getReportById should return specific report', async () => {
      const report: Report = {
        id: 'REPORT-001',
        title: 'Test Report',
        type: 'sprint',
        created_at: '',
        summary: 'Test summary'
      };

      store.addReport(report);

      const found = store.getReportById('REPORT-001');
      assert.ok(found, 'Should find report by id');
      assert.strictEqual(found?.title, 'Test Report', 'Should return correct report');
    });

    test('getConfig should return workflow config', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(testDir);

      const config = store.getConfig();
      assert.ok(config, 'Should return config');
      assert.strictEqual(config?.version, '1.0', 'Config version should match');
    });

    test('getPipeline should return pipeline config', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(testDir);

      const pipeline = store.getPipeline();
      assert.ok(pipeline, 'Should return pipeline');
      assert.strictEqual(pipeline?.pipeline.name, 'Test Pipeline', 'Pipeline name should match');
    });
  });

  suite('Utility Methods', () => {

    test('clear should remove all data', async () => {
      const ticket: Ticket = {
        id: 'T1', title: 'Ticket 1', status: TicketStatus.Backlog, priority: 1, type: 'IMPL',
        dependencies: [], conditions: [], context: {}, tags: [], complexity: 'low',
        parent_plan: '', parent_task: '', created_at: '', updated_at: '', completed_at: ''
      };
      const plan: Plan = {
        id: 'P1', title: 'Plan 1', status: 'active', author: 'Author',
        created_at: '', updated_at: '', completed_at: '', previous_plan: '', related_reports: []
      };
      const report: Report = {
        id: 'R1', title: 'Report 1', type: 'sprint', created_at: '', summary: 'Summary'
      };

      store.addTicket(ticket);
      store.addPlan(plan);
      store.addReport(report);

      store.clear();

      assert.strictEqual(store.getTickets().length, 0, 'Should clear tickets');
      assert.strictEqual(store.getPlans().length, 0, 'Should clear plans');
      assert.strictEqual(store.getReports().length, 0, 'Should clear reports');
      assert.strictEqual(store.getConfig(), undefined, 'Should clear config');
      assert.strictEqual(store.getPipeline(), undefined, 'Should clear pipeline');
    });

    test('getStats should return correct statistics', async () => {
      const ticket: Ticket = {
        id: 'T1', title: 'Ticket 1', status: TicketStatus.Backlog, priority: 1, type: 'IMPL',
        dependencies: [], conditions: [], context: {}, tags: [], complexity: 'low',
        parent_plan: '', parent_task: '', created_at: '', updated_at: '', completed_at: ''
      };
      const plan: Plan = {
        id: 'P1', title: 'Plan 1', status: 'active', author: 'Author',
        created_at: '', updated_at: '', completed_at: '', previous_plan: '', related_reports: []
      };
      const report: Report = {
        id: 'R1', title: 'Report 1', type: 'sprint', created_at: '', summary: 'Summary'
      };

      store.addTicket(ticket);
      store.addPlan(plan);
      store.addReport(report);

      const stats = store.getStats();

      assert.strictEqual(stats.ticketCount, 1, 'Should have 1 ticket');
      assert.strictEqual(stats.planCount, 1, 'Should have 1 plan');
      assert.strictEqual(stats.reportCount, 1, 'Should have 1 report');
      assert.strictEqual(stats.hasConfig, false, 'Should not have config');
      assert.strictEqual(stats.hasPipeline, false, 'Should not have pipeline');
    });

    test('getStats should reflect config after refresh', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(testDir);

      const stats = store.getStats();

      assert.strictEqual(stats.hasConfig, true, 'Should have config after refresh');
      assert.strictEqual(stats.hasPipeline, true, 'Should have pipeline after refresh');
    });

    test('getWorkflowRoot should return root after refresh', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(testDir);

      assert.strictEqual(store.getWorkflowRoot(), testDir, 'Should return workflow root');
    });
  });
});
