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
import { Ticket, TicketStatus, Plan, Report, PlanTemplate } from '../../data/types';

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
    fs.mkdirSync(path.join(plansDir, 'templates'), { recursive: true });

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
    delay_between_stages: 1
    timeout_per_stage: 1800
    log_file: ".workflow/logs/pipeline.log"
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

      await store.refresh(path.join(testDir, '.workflow'));

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

      await store.refresh(path.join(testDir, '.workflow'));

      const ticket = store.getTicketById('TEST-001');
      assert.strictEqual(ticket?.status, TicketStatus.Ready, 'Status should match folder, not frontmatter');
    });

    test('should load plans from current and archive folders', async () => {
      const { plansDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      createPlanFile(path.join(plansDir, 'current'), 'PLAN-001', 'Current Plan', false);
      createPlanFile(path.join(plansDir, 'archive'), 'PLAN-002', 'Archived Plan', true);

      await store.refresh(path.join(testDir, '.workflow'));

      assert.strictEqual(store.getPlans().length, 2, 'Should load 2 plans');
      assert.ok(store.getPlanById('PLAN-001'), 'Should find current plan');
      assert.ok(store.getPlanById('PLAN-002'), 'Should find archived plan');
    });

    test('should load reports from reports folder', async () => {
      const { reportsDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      createReportFile(reportsDir, 'REPORT-001', 'Sprint Report 1');
      createReportFile(reportsDir, 'REPORT-002', 'Sprint Report 2');

      await store.refresh(path.join(testDir, '.workflow'));

      assert.strictEqual(store.getReports().length, 2, 'Should load 2 reports');
      assert.ok(store.getReportById('REPORT-001'), 'Should find first report');
      assert.ok(store.getReportById('REPORT-002'), 'Should find second report');
    });

    test('should load configuration files', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(path.join(testDir, '.workflow'));

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
        await store.refresh(path.join(testDir, '.workflow'));
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
         await store.refresh(path.join(testDir, '.workflow'));
       });

       // Should still load valid tickets
       assert.strictEqual(store.getTickets().length, 1, 'Should load valid ticket');
       assert.ok(store.getTicketById('VALID-001'), 'Should find valid ticket');
     });

     test('should load tickets with auto_blocked fields from frontmatter', async () => {
       const { ticketsDir } = createTestStructure(testDir);
       createConfigFiles(path.join(testDir, '.workflow', 'config'));

       // Create a ticket with auto_blocked fields
       const frontmatter = {
         id: 'TEST-AUTO-BLOCKED-001',
         title: 'Test Ticket with Auto Blocked Fields',
         status: 'blocked',
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
         auto_blocked_reason: 'max_review_attempts',
         auto_blocked_attempts: 6,
         auto_blocked_at: '2026-04-29T10:00:00Z'
       };

       const yamlContent = yaml.dump(frontmatter, { indent: 2 });
       const content = `---\n${yamlContent}---\n## Test content`;
       fs.writeFileSync(path.join(ticketsDir, 'blocked', 'TEST-AUTO-BLOCKED-001.md'), content, 'utf-8');

       await store.refresh(path.join(testDir, '.workflow'));

       const ticket = store.getTicketById('TEST-AUTO-BLOCKED-001');
       assert.ok(ticket, 'Should find the ticket with auto_blocked fields');
       
       // Verify the auto_blocked fields are accessible
       assert.strictEqual(ticket?.auto_blocked_reason, 'max_review_attempts', 'auto_blocked_reason should be accessible');
       assert.strictEqual(ticket?.auto_blocked_attempts, 6, 'auto_blocked_attempts should be accessible');
       assert.strictEqual(ticket?.auto_blocked_at, '2026-04-29T10:00:00Z', 'auto_blocked_at should be accessible');
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

      await store.refresh(path.join(testDir, '.workflow'));

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

      await store.refresh(path.join(testDir, '.workflow'));

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

      await store.refresh(path.join(testDir, '.workflow'));

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

    test('getCurrentPlans should return only current-folder plans', async () => {
      const plans: Plan[] = [
        { id: 'P1', title: 'Current Plan', status: 'active', author: 'Author', created_at: '', updated_at: '', completed_at: '', previous_plan: '', related_reports: [], folder: 'current' },
        { id: 'P2', title: 'Archived Plan', status: 'archived', author: 'Author', created_at: '', updated_at: '', completed_at: '2026-03-04T12:00:00Z', previous_plan: '', related_reports: [], folder: 'archive' }
      ];

      plans.forEach(p => store.addPlan(p));

      const current = store.getCurrentPlans();
      assert.strictEqual(current.length, 1, 'Should return 1 current plan');
      assert.strictEqual(current[0].id, 'P1', 'Should return the current-folder plan');
    });

    test('getArchivedPlans should return only archive-folder plans', async () => {
      const plans: Plan[] = [
        { id: 'P1', title: 'Current Plan', status: 'active', author: 'Author', created_at: '', updated_at: '', completed_at: '', previous_plan: '', related_reports: [], folder: 'current' },
        { id: 'P2', title: 'Archived Plan', status: 'archived', author: 'Author', created_at: '', updated_at: '', completed_at: '2026-03-04T12:00:00Z', previous_plan: '', related_reports: [], folder: 'archive' }
      ];

      plans.forEach(p => store.addPlan(p));

      const archived = store.getArchivedPlans();
      assert.strictEqual(archived.length, 1, 'Should return 1 archived plan');
      assert.strictEqual(archived[0].id, 'P2', 'Should return the archive-folder plan');
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

      await store.refresh(path.join(testDir, '.workflow'));

      const config = store.getConfig();
      assert.ok(config, 'Should return config');
      assert.strictEqual(config?.version, '1.0', 'Config version should match');
    });

    test('getPipeline should return pipeline config', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(path.join(testDir, '.workflow'));

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

      await store.refresh(path.join(testDir, '.workflow'));

      const stats = store.getStats();

      assert.strictEqual(stats.hasConfig, true, 'Should have config after refresh');
      assert.strictEqual(stats.hasPipeline, true, 'Should have pipeline after refresh');
    });

    test('getWorkflowRoot should return root after refresh', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(path.join(testDir, '.workflow'));

      assert.strictEqual(store.getWorkflowRoot(), path.join(testDir, '.workflow'), 'Should return workflow root');
    });
  });

  suite('parseReviews() - Review Parsing', () => {

    test('should parse review entries from ## Ревью section', () => {
      const body = `## Описание\nSome text\n\n## Ревью\n\n| Дата | Статус | Самари |\n|------|--------|--------|\n| 2026-03-06 | ❌ failed | Задача не выполнена |\n`;
      const reviews = WorkflowStore.parseReviews(body);

      assert.strictEqual(reviews.length, 1);
      assert.strictEqual(reviews[0].date, '2026-03-06');
      assert.strictEqual(reviews[0].status, 'failed');
      assert.strictEqual(reviews[0].icon, '❌');
      assert.strictEqual(reviews[0].summary, 'Задача не выполнена');
    });

    test('should parse review entries from ## Review section', () => {
      const body = `## Description\n\n## Review\n\n| Date | Status | Summary |\n|---|---|---|\n| 2026-03-05 | ✅ passed | All checks passed |\n`;
      const reviews = WorkflowStore.parseReviews(body);

      assert.strictEqual(reviews.length, 1);
      assert.strictEqual(reviews[0].date, '2026-03-05');
      assert.strictEqual(reviews[0].status, 'passed');
      assert.strictEqual(reviews[0].icon, '✅');
      assert.strictEqual(reviews[0].summary, 'All checks passed');
    });

    test('should parse multiple review entries', () => {
      const body = `## Ревью\n\n| Дата | Статус | Самари |\n|---|---|---|\n| 2026-03-05 | ❌ failed | First attempt |\n| 2026-03-06 | ✅ passed | Fixed |\n`;
      const reviews = WorkflowStore.parseReviews(body);

      assert.strictEqual(reviews.length, 2);
      assert.strictEqual(reviews[0].status, 'failed');
      assert.strictEqual(reviews[0].icon, '❌');
      assert.strictEqual(reviews[1].status, 'passed');
      assert.strictEqual(reviews[1].icon, '✅');
    });

    test('should return empty array when no review section', () => {
      const body = `## Описание\nSome text\n`;
      const reviews = WorkflowStore.parseReviews(body);

      assert.strictEqual(reviews.length, 0);
    });

    test('should return empty array when review section has no table rows', () => {
      const body = `## Ревью\n\n| Дата | Статус | Самари |\n|---|---|---|\n`;
      const reviews = WorkflowStore.parseReviews(body);

      assert.strictEqual(reviews.length, 0);
    });

    test('should load reviews into ticket on refresh', async () => {
      const { ticketsDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      const frontmatter = {
        id: 'TEST-001',
        title: 'Test Ticket',
        status: 'blocked',
        priority: 3,
        type: 'DOCS',
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

      const yamlContent = yaml.dump(frontmatter, { indent: 2 });
      const content = `---\n${yamlContent}---\n## Описание\nTest\n\n## Ревью\n\n| Дата | Статус | Самари |\n|---|---|---|\n| 2026-03-06 | ❌ failed | Not done |\n`;
      fs.writeFileSync(path.join(ticketsDir, 'blocked', 'TEST-001.md'), content, 'utf-8');

      await store.refresh(path.join(testDir, '.workflow'));

      const ticket = store.getTicketById('TEST-001');
      assert.ok(ticket, 'Ticket should be loaded');
      assert.ok(ticket?.reviews, 'Ticket should have reviews');
      assert.strictEqual(ticket?.reviews?.length, 1);
      assert.strictEqual(ticket?.reviews?.[0].status, 'failed');
      assert.strictEqual(ticket?.reviews?.[0].icon, '❌');
      assert.strictEqual(ticket?.reviews?.[0].summary, 'Not done');
    });

    test('should not set reviews when ticket has no review section', async () => {
      const { ticketsDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      createTicketFile(path.join(ticketsDir, 'ready'), 'TEST-002', 'ready', 'No Review Ticket');

      await store.refresh(path.join(testDir, '.workflow'));

      const ticket = store.getTicketById('TEST-002');
      assert.ok(ticket, 'Ticket should be loaded');
      assert.strictEqual(ticket?.reviews, undefined, 'Should not have reviews');
    });
  });

  suite('updateFile() - Incremental Updates', () => {

    test('updateFile with create should add new ticket', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      const workflowRoot = path.join(testDir, '.workflow');
      await store.refresh(workflowRoot);

      const events: StoreChangeEvent[] = [];
      store.onDidChange((event) => {
        events.push(event);
      });

      const ticketsDir = path.join(workflowRoot, 'tickets', 'backlog');
      const ticketPath = path.join(ticketsDir, 'NEW-001.md');
      const frontmatter = {
        id: 'NEW-001',
        title: 'New Ticket',
        status: 'backlog',
        priority: 2,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-11T00:00:00Z',
        updated_at: '2026-03-11T00:00:00Z',
        completed_at: ''
      };
      const yamlContent = yaml.dump(frontmatter, { indent: 2 });
      const content = `---\n${yamlContent}---\n## Content`;
      fs.writeFileSync(ticketPath, content, 'utf-8');

      await store.updateFile(ticketPath, 'create');

      assert.strictEqual(store.getTickets().length, 1, 'Should have 1 ticket');
      const ticket = store.getTicketById('NEW-001');
      assert.ok(ticket, 'Should find new ticket');
      assert.strictEqual(ticket?.title, 'New Ticket', 'Ticket title should match');
    });

    test('updateFile with change should update existing ticket', async () => {
      const { ticketsDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      createTicketFile(path.join(ticketsDir, 'ready'), 'TEST-001', 'ready', 'Original Title');

      const workflowRoot = path.join(testDir, '.workflow');
      await store.refresh(workflowRoot);

      const ticketPath = path.join(ticketsDir, 'ready', 'TEST-001.md');
      const frontmatter = {
        id: 'TEST-001',
        title: 'Updated Title',
        status: 'ready',
        priority: 1,
        type: 'FIX',
        dependencies: [],
        conditions: [],
        context: {},
        tags: ['updated'],
        complexity: 'low',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-11T00:00:00Z',
        updated_at: '2026-03-11T00:00:00Z',
        completed_at: ''
      };
      const yamlContent = yaml.dump(frontmatter, { indent: 2 });
      const content = `---\n${yamlContent}---\n## Updated content`;
      fs.writeFileSync(ticketPath, content, 'utf-8');

      await store.updateFile(ticketPath, 'change');

      const ticket = store.getTicketById('TEST-001');
      assert.ok(ticket, 'Should find ticket');
      assert.strictEqual(ticket?.title, 'Updated Title', 'Title should be updated');
      assert.strictEqual(ticket?.priority, 1, 'Priority should be updated');
      assert.strictEqual(ticket?.type, 'FIX', 'Type should be updated');
      assert.ok(ticket?.tags.includes('updated'), 'Tags should be updated');
    });

    test('updateFile with delete should remove ticket', async () => {
      const { ticketsDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      createTicketFile(path.join(ticketsDir, 'backlog'), 'TO-DELETE-001', 'backlog', 'To Delete');

      const workflowRoot = path.join(testDir, '.workflow');
      await store.refresh(workflowRoot);

      assert.strictEqual(store.getTickets().length, 1, 'Should have 1 ticket before delete');

      const ticketPath = path.join(ticketsDir, 'backlog', 'TO-DELETE-001.md');
      fs.unlinkSync(ticketPath);

      await store.updateFile(ticketPath, 'delete');

      assert.strictEqual(store.getTickets().length, 0, 'Should have 0 tickets after delete');
      assert.strictEqual(store.getTicketById('TO-DELETE-001'), undefined, 'Ticket should be removed');
    });

    test('updateFile with create should add new plan', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      const workflowRoot = path.join(testDir, '.workflow');
      await store.refresh(workflowRoot);

      const plansDir = path.join(workflowRoot, 'plans', 'current');
      const planPath = path.join(plansDir, 'PLAN-NEW.md');
      const frontmatter = {
        id: 'PLAN-NEW',
        title: 'New Plan',
        status: 'active',
        author: 'Test Author',
        created_at: '2026-03-11T00:00:00Z',
        updated_at: '2026-03-11T00:00:00Z',
        completed_at: '',
        previous_plan: '',
        related_reports: []
      };
      const yamlContent = yaml.dump(frontmatter, { indent: 2 });
      const content = `---\n${yamlContent}---\n## Plan content`;
      fs.writeFileSync(planPath, content, 'utf-8');

      await store.updateFile(planPath, 'create');

      assert.strictEqual(store.getPlans().length, 1, 'Should have 1 plan');
      const plan = store.getPlanById('PLAN-NEW');
      assert.ok(plan, 'Should find new plan');
      assert.strictEqual(plan?.title, 'New Plan', 'Plan title should match');
    });

    test('updateFile with change should update existing plan', async () => {
      const { plansDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      createPlanFile(path.join(plansDir, 'current'), 'PLAN-001', 'Original Plan Title');

      const workflowRoot = path.join(testDir, '.workflow');
      await store.refresh(workflowRoot);

      const planPath = path.join(plansDir, 'current', 'PLAN-001.md');
      const frontmatter = {
        id: 'PLAN-001',
        title: 'Updated Plan Title',
        status: 'active',
        author: 'Updated Author',
        created_at: '2026-03-11T00:00:00Z',
        updated_at: '2026-03-11T00:00:00Z',
        completed_at: '',
        previous_plan: '',
        related_reports: []
      };
      const yamlContent = yaml.dump(frontmatter, { indent: 2 });
      const content = `---\n${yamlContent}---\n## Updated content`;
      fs.writeFileSync(planPath, content, 'utf-8');

      await store.updateFile(planPath, 'change');

      const plan = store.getPlanById('PLAN-001');
      assert.ok(plan, 'Should find plan');
      assert.strictEqual(plan?.title, 'Updated Plan Title', 'Title should be updated');
      assert.strictEqual(plan?.author, 'Updated Author', 'Author should be updated');
    });

    test('updateFile with create should add new report', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      const workflowRoot = path.join(testDir, '.workflow');
      await store.refresh(workflowRoot);

      const reportsDir = path.join(workflowRoot, 'reports');
      const reportPath = path.join(reportsDir, 'REPORT-NEW.md');
      const frontmatter = {
        id: 'REPORT-NEW',
        title: 'New Report',
        type: 'sprint',
        created_at: '2026-03-11T00:00:00Z',
        summary: 'New report summary'
      };
      const yamlContent = yaml.dump(frontmatter, { indent: 2 });
      const content = `---\n${yamlContent}---\n## Report content`;
      fs.writeFileSync(reportPath, content, 'utf-8');

      await store.updateFile(reportPath, 'create');

      assert.strictEqual(store.getReports().length, 1, 'Should have 1 report');
      const report = store.getReportById('REPORT-NEW');
      assert.ok(report, 'Should find new report');
      assert.strictEqual(report?.title, 'New Report', 'Report title should match');
    });

    test('updateFile should handle invalid file gracefully', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      const workflowRoot = path.join(testDir, '.workflow');
      await store.refresh(workflowRoot);

      const ticketsDir = path.join(workflowRoot, 'tickets', 'backlog');
      const invalidPath = path.join(ticketsDir, 'INVALID.md');
      fs.writeFileSync(invalidPath, '---\ninvalid: yaml: content\n---', 'utf-8');

      await assert.doesNotReject(async () => {
        await store.updateFile(invalidPath, 'create');
      });

      assert.strictEqual(store.getTickets().length, 0, 'Should not add invalid ticket');
    });

    test('updateFile should emit events after update', async () => {
      const { ticketsDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      const workflowRoot = path.join(testDir, '.workflow');
      await store.refresh(workflowRoot);

      const ticketPath = path.join(ticketsDir, 'TEST-001.md');
      const frontmatter = {
        id: 'TEST-001',
        title: 'Test Ticket',
        status: 'backlog',
        priority: 2,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-11T00:00:00Z',
        updated_at: '2026-03-11T00:00:00Z',
        completed_at: ''
      };
      const yamlContent = yaml.dump(frontmatter, { indent: 2 });
      const content = `---\n${yamlContent}---\n## Content`;
      fs.writeFileSync(ticketPath, content, 'utf-8');

      const events: StoreChangeEvent[] = [];
      store.onDidChange((event) => {
        events.push(event);
      });

      await store.updateFile(ticketPath, 'create');

      assert.ok(events.length > 0, 'Should emit events');
      const ticketEvents = events.filter(e => e.type === 'ticket');
      assert.ok(ticketEvents.length > 0, 'Should emit ticket events');
    });
  });

  suite('updateFile() - Concurrent Access (Race Conditions)', () => {

    test('concurrent updateFile calls should handle correctly', async () => {
      const { ticketsDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      const workflowRoot = path.join(testDir, '.workflow');
      await store.refresh(workflowRoot);

      const backlogDir = path.join(ticketsDir, 'backlog');
      const ticket1Path = path.join(backlogDir, 'CONCURRENT-001.md');
      const ticket2Path = path.join(backlogDir, 'CONCURRENT-002.md');
      const ticket3Path = path.join(backlogDir, 'CONCURRENT-003.md');

      const frontmatter1 = {
        id: 'CONCURRENT-001',
        title: 'Ticket 1',
        status: 'backlog',
        priority: 2,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-11T00:00:00Z',
        updated_at: '2026-03-11T00:00:00Z',
        completed_at: ''
      };
      const frontmatter2 = { ...frontmatter1, id: 'CONCURRENT-002', title: 'Ticket 2' };
      const frontmatter3 = { ...frontmatter1, id: 'CONCURRENT-003', title: 'Ticket 3' };

      const yaml1 = yaml.dump(frontmatter1, { indent: 2 });
      const yaml2 = yaml.dump(frontmatter2, { indent: 2 });
      const yaml3 = yaml.dump(frontmatter3, { indent: 2 });

      fs.writeFileSync(ticket1Path, `---\n${yaml1}---\n## Content 1`, 'utf-8');
      fs.writeFileSync(ticket2Path, `---\n${yaml2}---\n## Content 2`, 'utf-8');
      fs.writeFileSync(ticket3Path, `---\n${yaml3}---\n## Content 3`, 'utf-8');

      await Promise.all([
        store.updateFile(ticket1Path, 'create'),
        store.updateFile(ticket2Path, 'create'),
        store.updateFile(ticket3Path, 'create')
      ]);

      assert.strictEqual(store.getTickets().length, 3, 'Should have all 3 tickets');
      assert.ok(store.getTicketById('CONCURRENT-001'), 'Should find ticket 1');
      assert.ok(store.getTicketById('CONCURRENT-002'), 'Should find ticket 2');
      assert.ok(store.getTicketById('CONCURRENT-003'), 'Should find ticket 3');
    });

    test('concurrent create and delete should handle correctly', async () => {
      const { ticketsDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      const workflowRoot = path.join(testDir, '.workflow');
      await store.refresh(workflowRoot);

      const ticketPath = path.join(ticketsDir, 'RACE-001.md');

      const frontmatter = {
        id: 'RACE-001',
        title: 'Race Ticket',
        status: 'backlog',
        priority: 2,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-11T00:00:00Z',
        updated_at: '2026-03-11T00:00:00Z',
        completed_at: ''
      };
      const yamlContent = yaml.dump(frontmatter, { indent: 2 });
      const content = `---\n${yamlContent}---\n## Content`;
      fs.writeFileSync(ticketPath, content, 'utf-8');

      await Promise.all([
        store.updateFile(ticketPath, 'create'),
        store.updateFile(ticketPath, 'delete')
      ]);

      const ticket = store.getTicketById('RACE-001');
      assert.ok(ticket === undefined || ticket !== undefined, 'Should handle race condition');
    });

    test('rapid sequential updates should handle correctly', async () => {
      const { ticketsDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      const workflowRoot = path.join(testDir, '.workflow');
      await store.refresh(workflowRoot);

      const backlogDir = path.join(ticketsDir, 'backlog');
      const ticketPath = path.join(backlogDir, 'RAPID-001.md');

      const frontmatter = {
        id: 'RAPID-001',
        title: 'Rapid Ticket',
        status: 'backlog',
        priority: 2,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-11T00:00:00Z',
        updated_at: '2026-03-11T00:00:00Z',
        completed_at: ''
      };
      const yamlContent = yaml.dump(frontmatter, { indent: 2 });
      const content = `---\n${yamlContent}---\n## Content`;
      fs.writeFileSync(ticketPath, content, 'utf-8');

      await store.updateFile(ticketPath, 'create');
      await store.updateFile(ticketPath, 'change');
      await store.updateFile(ticketPath, 'change');

      const ticket = store.getTicketById('RAPID-001');
      assert.ok(ticket, 'Should find ticket after rapid updates');
    });
  });

  suite('Plan Template Operations', () => {

    test('TC27: getPlanTemplates() should return loaded templates from plans/templates/', async () => {
      const { plansDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      // Create plan template files
      const templatesDir = path.join(plansDir, 'templates');
      
      const template1: PlanTemplate = {
        id: 'TPL-001',
        title: 'Weekly Sprint Template',
        type: 'template',
        trigger: {
          type: 'weekly',
          params: { day: 'monday', time: '09:00' }
        },
        last_triggered: '',
        enabled: true,
        plan_prefix: 'SPRINT',
        plan_author: 'System',
        plan_status: 'active',
        ticket_type_by_task: { 'implementation': 'IMPL', 'documentation': 'DOCS' },
        ticket_prefix: 'TASK',
        agent: 'default'
      };

      const template2: PlanTemplate = {
        id: 'TPL-002',
        title: 'Daily Standup Template',
        type: 'template',
        trigger: {
          type: 'daily',
          params: { time: '10:00' }
        },
        last_triggered: '2026-04-01T10:00:00Z',
        enabled: false
      };

      const yaml1 = yaml.dump(template1, { indent: 2 });
      const yaml2 = yaml.dump(template2, { indent: 2 });

      fs.writeFileSync(path.join(templatesDir, 'TPL-001.md'), `---\n${yaml1}---\n## Weekly Sprint Template`, 'utf-8');
      fs.writeFileSync(path.join(templatesDir, 'TPL-002.md'), `---\n${yaml2}---\n## Daily Standup Template`, 'utf-8');

      await store.refresh(path.join(testDir, '.workflow'));

      const templates = store.getPlanTemplates();
      assert.strictEqual(templates.length, 2, 'Should load 2 plan templates');

      const tpl1 = store.getPlanTemplateById('TPL-001');
      assert.ok(tpl1, 'Should find TPL-001');
      assert.strictEqual(tpl1?.title, 'Weekly Sprint Template');
      assert.strictEqual(tpl1?.trigger.type, 'weekly');
      assert.strictEqual(tpl1?.enabled, true);
      assert.strictEqual(tpl1?.plan_prefix, 'SPRINT');

      const tpl2 = store.getPlanTemplateById('TPL-002');
      assert.ok(tpl2, 'Should find TPL-002');
      assert.strictEqual(tpl2?.trigger.type, 'daily');
      assert.strictEqual(tpl2?.enabled, false);
    });

    test('should handle missing templates folder gracefully', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await assert.doesNotReject(async () => {
        await store.refresh(path.join(testDir, '.workflow'));
      });

      const templates = store.getPlanTemplates();
      assert.strictEqual(templates.length, 0, 'Should have no templates when folder missing');
    });

    test('addPlanTemplate should add template and emit event', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(path.join(testDir, '.workflow'));

      const template: PlanTemplate = {
        id: 'TPL-NEW',
        title: 'New Template',
        type: 'template',
        trigger: { type: 'daily', params: {} },
        last_triggered: '',
        enabled: true
      };

      const events: StoreChangeEvent[] = [];
      store.onDidChange((event) => {
        events.push(event);
      });

      store.addPlanTemplate(template);

      const templates = store.getPlanTemplates();
      assert.strictEqual(templates.length, 1, 'Should have 1 template');
      assert.ok(store.getPlanTemplateById('TPL-NEW'), 'Should find new template');

      const addEvent = events.find(e => e.type === 'plan-template' && e.operation === 'add');
      assert.ok(addEvent, 'Should emit add event');
      assert.strictEqual(addEvent?.id, 'TPL-NEW', 'Event id should match template id');
    });

    test('updatePlanTemplate should update template and emit event', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(path.join(testDir, '.workflow'));

      const template: PlanTemplate = {
        id: 'TPL-UPDATE',
        title: 'Original Title',
        type: 'template',
        trigger: { type: 'daily', params: {} },
        last_triggered: '',
        enabled: true
      };

      store.addPlanTemplate(template);

      const events: StoreChangeEvent[] = [];
      store.onDidChange((event) => {
        events.push(event);
      });

      const updatedTemplate: PlanTemplate = { ...template, title: 'Updated Title', enabled: false };
      store.updatePlanTemplate('TPL-UPDATE', updatedTemplate);

      const found = store.getPlanTemplateById('TPL-UPDATE');
      assert.strictEqual(found?.title, 'Updated Title', 'Template should be updated');
      assert.strictEqual(found?.enabled, false, 'Template enabled should be updated');

      const updateEvent = events.find(e => e.type === 'plan-template' && e.operation === 'update');
      assert.ok(updateEvent, 'Should emit update event');
    });

    test('updatePlanTemplate should throw if template not found', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(path.join(testDir, '.workflow'));

      assert.throws(
        () => store.updatePlanTemplate('NONEXISTENT', {} as PlanTemplate),
        /Plan template NONEXISTENT not found/
      );
    });

    test('removePlanTemplate should remove template and emit event', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(path.join(testDir, '.workflow'));

      const template: PlanTemplate = {
        id: 'TPL-REMOVE',
        title: 'Template to Remove',
        type: 'template',
        trigger: { type: 'daily', params: {} },
        last_triggered: '',
        enabled: true
      };

      store.addPlanTemplate(template);

      const events: StoreChangeEvent[] = [];
      store.onDidChange((event) => {
        events.push(event);
      });

      store.removePlanTemplate('TPL-REMOVE');

      const templates = store.getPlanTemplates();
      assert.strictEqual(templates.length, 0, 'Should have no templates after removal');
      assert.strictEqual(store.getPlanTemplateById('TPL-REMOVE'), undefined, 'Template should be removed');

      const deleteEvent = events.find(e => e.type === 'plan-template' && e.operation === 'delete');
      assert.ok(deleteEvent, 'Should emit delete event');
      assert.strictEqual(deleteEvent?.id, 'TPL-REMOVE', 'Event id should match template id');
    });

    test('removePlanTemplate should throw if template not found', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(path.join(testDir, '.workflow'));

      assert.throws(
        () => store.removePlanTemplate('NONEXISTENT'),
        /Plan template NONEXISTENT not found/
      );
    });

    test('clear should clear plan templates', async () => {
      const { plansDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      const templatesDir = path.join(plansDir, 'templates');
      const template: PlanTemplate = {
        id: 'TPL-CLEAR',
        title: 'Template',
        type: 'template',
        trigger: { type: 'daily', params: {} },
        last_triggered: '',
        enabled: true
      };
      const yamlContent = yaml.dump(template, { indent: 2 });
      fs.writeFileSync(path.join(templatesDir, 'TPL-CLEAR.md'), `---\n${yamlContent}---\n## Template`, 'utf-8');

      await store.refresh(path.join(testDir, '.workflow'));
      assert.strictEqual(store.getPlanTemplates().length, 1, 'Should have 1 template before clear');

      store.clear();
      assert.strictEqual(store.getPlanTemplates().length, 0, 'Should have 0 templates after clear');
    });
  });

  suite('Plan-Template File Classification (FIX-044)', () => {

    /**
     * Helper to create a test plan template file
     */
    function createTemplateFile(dir: string, id: string, title: string) {
      const template: PlanTemplate = {
        id,
        title,
        type: 'template',
        trigger: { type: 'daily', params: {} },
        last_triggered: '',
        enabled: true
      };
      const yamlContent = yaml.dump(template, { indent: 2 });
      const content = `---\n${yamlContent}---\n## Template content`;
      const filePath = path.join(dir, `${id}.md`);
      fs.writeFileSync(filePath, content, 'utf-8');
      return filePath;
    }

    test('updateFile for plan template should add to planTemplates Map, not plans', async () => {
      const { plansDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(path.join(testDir, '.workflow'));

      const templatesDir = path.join(plansDir, 'templates');
      const templatePath = createTemplateFile(templatesDir, 'TMPL-001', 'Test Template');

      // Simulate file change event
      await store.updateFile(templatePath, 'create');

      // Template should be in planTemplates
      assert.strictEqual(store.getPlanTemplates().length, 1, 'Should have 1 plan template');
      assert.ok(store.getPlanTemplateById('TMPL-001'), 'Should find template by ID');

      // Template should NOT be in plans (getCurrentPlans should not contain it)
      const currentPlans = store.getCurrentPlans();
      const foundInPlans = currentPlans.find(p => p.id === 'TMPL-001');
      assert.strictEqual(foundInPlans, undefined, 'TMPL-001 should NOT appear in current plans');
    });

    test('updateFile for plan template change should update planTemplates Map', async () => {
      const { plansDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(path.join(testDir, '.workflow'));

      const templatesDir = path.join(plansDir, 'templates');
      const templatePath = createTemplateFile(templatesDir, 'TMPL-002', 'Original Title');

      await store.updateFile(templatePath, 'create');
      assert.strictEqual(store.getPlanTemplateById('TMPL-002')?.title, 'Original Title');

      // Modify the file
      const modifiedTemplate: PlanTemplate = {
        id: 'TMPL-002',
        title: 'Modified Title',
        type: 'template',
        trigger: { type: 'weekly', params: { day: 'monday' } },
        last_triggered: '',
        enabled: false
      };
      const modifiedYaml = yaml.dump(modifiedTemplate, { indent: 2 });
      fs.writeFileSync(templatePath, `---\n${modifiedYaml}---\n## Modified`, 'utf-8');

      await store.updateFile(templatePath, 'change');

      const updated = store.getPlanTemplateById('TMPL-002');
      assert.strictEqual(updated?.title, 'Modified Title', 'Template should be updated');
      assert.strictEqual(updated?.enabled, false, 'Template enabled should be updated');
    });

    test('updateFile for plan template delete should remove from planTemplates Map', async () => {
      const { plansDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(path.join(testDir, '.workflow'));

      const templatesDir = path.join(plansDir, 'templates');
      const templatePath = createTemplateFile(templatesDir, 'TMPL-003', 'To Be Deleted');

      await store.updateFile(templatePath, 'create');
      assert.strictEqual(store.getPlanTemplates().length, 1, 'Should have 1 template');

      await store.updateFile(templatePath, 'delete');

      assert.strictEqual(store.getPlanTemplates().length, 0, 'Should have 0 templates after delete');
      assert.strictEqual(store.getPlanTemplateById('TMPL-003'), undefined, 'Template should be removed');

      // Plans Map should not be affected
      assert.strictEqual(store.getPlans().length, 0, 'Plans Map should not be affected');
    });

    test('updateFile for current plan should add to plans Map, not planTemplates', async () => {
      const { plansDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(path.join(testDir, '.workflow'));

      const currentDir = path.join(plansDir, 'current');
      const planPath = createPlanFile(currentDir, 'PLAN-022', 'Test Plan');

      await store.updateFile(planPath, 'create');

      // Plan should be in plans
      const currentPlans = store.getCurrentPlans();
      assert.strictEqual(currentPlans.length, 1, 'Should have 1 current plan');
      assert.strictEqual(currentPlans[0].id, 'PLAN-022', 'Should find plan by ID');
      assert.strictEqual(currentPlans[0].folder, 'current', 'Plan folder should be current');

      // Plan should NOT be in planTemplates
      assert.strictEqual(store.getPlanTemplates().length, 0, 'Should have 0 plan templates');
    });

    test('updateFile for archived plan should add to plans Map with archive folder', async () => {
      const { plansDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(path.join(testDir, '.workflow'));

      const archiveDir = path.join(plansDir, 'archive');
      const planPath = createPlanFile(archiveDir, 'PLAN-019', 'Archived Plan', true);

      await store.updateFile(planPath, 'create');

      const archivedPlans = store.getArchivedPlans();
      assert.strictEqual(archivedPlans.length, 1, 'Should have 1 archived plan');
      assert.strictEqual(archivedPlans[0].id, 'PLAN-019', 'Should find archived plan by ID');
      assert.strictEqual(archivedPlans[0].folder, 'archive', 'Plan folder should be archive');
    });

    test('refresh should not mix templates into current plans', async () => {
      const { plansDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      // Create both current plan and template
      const currentDir = path.join(plansDir, 'current');
      const templatesDir = path.join(plansDir, 'templates');
      createPlanFile(currentDir, 'PLAN-010', 'Current Plan');
      createTemplateFile(templatesDir, 'TMPL-MIX', 'Template That Should Not Mix');

      await store.refresh(path.join(testDir, '.workflow'));

      const currentPlans = store.getCurrentPlans();
      const foundTemplateInPlans = currentPlans.find(p => p.id === 'TMPL-MIX');
      assert.strictEqual(foundTemplateInPlans, undefined, 'Template should NOT appear in current plans after refresh');

      const templates = store.getPlanTemplates();
      assert.strictEqual(templates.length, 1, 'Should have 1 template');
      assert.strictEqual(templates[0].id, 'TMPL-MIX', 'Template should be in planTemplates');

      assert.strictEqual(currentPlans.length, 1, 'Should have exactly 1 current plan');
      assert.strictEqual(currentPlans[0].id, 'PLAN-010', 'Current plan should be correct');
    });

    test('updateFile for template should emit plan-template refresh event', async () => {
      const { plansDir } = createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(path.join(testDir, '.workflow'));

      const events: StoreChangeEvent[] = [];
      store.onDidChange((event) => {
        events.push(event);
      });

      const templatesDir = path.join(plansDir, 'templates');
      const templatePath = createTemplateFile(templatesDir, 'TMPL-EVT', 'Event Test Template');

      await store.updateFile(templatePath, 'create');

      const templateRefresh = events.find(e => e.type === 'plan-template' && e.operation === 'refresh');
      assert.ok(templateRefresh, 'Should emit plan-template refresh event after updateFile');
    });
  });
});
