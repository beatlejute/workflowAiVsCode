/**
 * PlanService Unit Tests
 *
 * Tests for plan management service including:
 * - CRUD operations (getAll, getCurrent, getArchived, getById, create, archive)
 * - Plan-ticket relationships (getTicketsForPlan, getPlanProgress)
 * - Archive functionality
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowStore } from '../../data/workflow-store';
import { PlanService } from '../../services/plan-service';
import { Plan, Ticket } from '../../data/types';

suite('PlanService Suite', () => {

  let store: WorkflowStore;
  let planService: PlanService;
  let testDir: string;

  setup(() => {
    store = new WorkflowStore();
    testDir = path.join(__dirname, '../../../../tmp/test-planservice-' + Date.now());
    planService = new PlanService(store, path.join(testDir, '.workflow'));
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
    const plansDir = path.join(workflowDir, 'plans');
    const ticketsDir = path.join(workflowDir, 'tickets');
    const templatesDir = path.join(workflowDir, 'templates');

    // Create plan folders
    fs.mkdirSync(path.join(plansDir, 'current'), { recursive: true });
    fs.mkdirSync(path.join(plansDir, 'archive'), { recursive: true });

    // Create ticket folders
    const statuses = ['backlog', 'ready', 'in-progress', 'blocked', 'review', 'done'];
    for (const status of statuses) {
      fs.mkdirSync(path.join(ticketsDir, status), { recursive: true });
    }

    // Create templates folder and plan template
    fs.mkdirSync(templatesDir, { recursive: true });
    createPlanTemplate(templatesDir);

    return { workflowDir, plansDir, ticketsDir, templatesDir };
  }

  /**
   * Helper to create plan template
   */
  function createPlanTemplate(templatesDir: string) {
    const template = `---
id: "PLAN-{NNN}"
title: "Название плана"
status: draft
author: architect

created_at: ""
updated_at: ""
completed_at: ""

previous_plan: ""
related_reports: []
---

# План: {Название}

## Цель

<!-- Чего хотим достичь. Конкретная, измеримая цель. -->

## Контекст

<!-- Почему это важно -->
`;
    fs.writeFileSync(path.join(templatesDir, 'plan-template.md'), template, 'utf-8');
  }

  /**
   * Helper to create a test plan in store
   */
  function createPlanInStore(id: string, title: string, completed = false): Plan {
    const plan: Plan = {
      id,
      title,
      status: completed ? 'archived' : 'active',
      author: 'Test Author',
      created_at: '2026-03-04T00:00:00Z',
      updated_at: '2026-03-04T00:00:00Z',
      completed_at: completed ? '2026-03-04T12:00:00Z' : '',
      previous_plan: '',
      related_reports: [],
      folder: completed ? 'archive' : 'current'
    };
    store.addPlan(plan);
    return plan;
  }

  /**
   * Helper to create a test ticket in store
   */
  function createTicketInStore(id: string, title: string, status: TicketStatus, parentPlan: string): Ticket {
    const ticket: Ticket = {
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
      parent_plan: parentPlan,
      parent_task: '',
      created_at: '2026-03-04T00:00:00Z',
      updated_at: '2026-03-04T00:00:00Z',
      completed_at: status === TicketStatus.Done ? '2026-03-04T12:00:00Z' : ''
    };
    store.addTicket(ticket);
    return ticket;
  }

  suite('getAll()', () => {

    test('should return all plans from store', () => {
      createPlanInStore('PLAN-001', 'Plan 1');
      createPlanInStore('PLAN-002', 'Plan 2');
      createPlanInStore('PLAN-003', 'Plan 3');

      const all = planService.getAll();

      assert.strictEqual(all.length, 3, 'Should return all 3 plans');
    });

    test('should return empty array when no plans', () => {
      const all = planService.getAll();

      assert.strictEqual(all.length, 0, 'Should return empty array');
    });
  });

  suite('getCurrent()', () => {

    test('should return only non-archived plans', () => {
      createPlanInStore('PLAN-001', 'Active Plan', false);
      createPlanInStore('PLAN-002', 'Archived Plan', true);
      createPlanInStore('PLAN-003', 'Another Active Plan', false);

      const current = planService.getCurrent();

      assert.strictEqual(current.length, 2, 'Should return 2 non-archived plans');
      assert.ok(current.find(p => p.id === 'PLAN-001'), 'Should include active plan');
      assert.ok(current.find(p => p.id === 'PLAN-003'), 'Should include another active plan');
      assert.strictEqual(current.find(p => p.id === 'PLAN-002'), undefined, 'Should not include archived plan');
    });

    test('should return empty array when all plans are archived', () => {
      createPlanInStore('PLAN-001', 'Archived Plan 1', true);
      createPlanInStore('PLAN-002', 'Archived Plan 2', true);

      const current = planService.getCurrent();

      assert.strictEqual(current.length, 0, 'Should return empty array');
    });
  });

  suite('getArchived()', () => {

    test('should return only archived plans', () => {
      createPlanInStore('PLAN-001', 'Active Plan', false);
      createPlanInStore('PLAN-002', 'Archived Plan', true);
      createPlanInStore('PLAN-003', 'Another Archived Plan', true);

      const archived = planService.getArchived();

      assert.strictEqual(archived.length, 2, 'Should return 2 archived plans');
      assert.ok(archived.find(p => p.id === 'PLAN-002'), 'Should include first archived plan');
      assert.ok(archived.find(p => p.id === 'PLAN-003'), 'Should include second archived plan');
      assert.strictEqual(archived.find(p => p.id === 'PLAN-001'), undefined, 'Should not include active plan');
    });

    test('should return empty array when no plans are archived', () => {
      createPlanInStore('PLAN-001', 'Active Plan 1', false);
      createPlanInStore('PLAN-002', 'Active Plan 2', false);

      const archived = planService.getArchived();

      assert.strictEqual(archived.length, 0, 'Should return empty array');
    });
  });

  suite('getById()', () => {

    test('should return plan by ID', () => {
      createPlanInStore('PLAN-001', 'Test Plan');

      const found = planService.getById('PLAN-001');

      assert.ok(found, 'Should find plan by ID');
      assert.strictEqual(found?.title, 'Test Plan', 'Should return correct plan');
    });

    test('should return undefined for non-existent plan', () => {
      const found = planService.getById('NONEXISTENT');

      assert.strictEqual(found, undefined, 'Should return undefined for non-existent plan');
    });
  });

  suite('create()', () => {

    test('should create plan with generated ID', async () => {
      createTestStructure(testDir);

      const plan = await planService.create('Test Plan');

      assert.strictEqual(plan.id, 'PLAN-001', 'Should generate PLAN-001 as first ID');
      assert.strictEqual(plan.title, 'Test Plan', 'Should set title');
      assert.strictEqual(plan.status, 'draft', 'Should set status to draft');
    });

    test('should generate next sequential ID', async () => {
      createTestStructure(testDir);
      createPlanInStore('PLAN-001', 'Existing Plan');
      createPlanInStore('PLAN-002', 'Another Plan');

      const plan = await planService.create('New Plan');

      assert.strictEqual(plan.id, 'PLAN-003', 'Should generate PLAN-003');
    });

    test('should create plan file in plans/current/', async () => {
      createTestStructure(testDir);

      const plan = await planService.create('Test Plan');

      const filePath = path.join(testDir, '.workflow', 'plans', 'current', `${plan.id}.md`);
      assert.ok(fs.existsSync(filePath), 'Should create file in plans/current/');
    });

    test('should include template content', async () => {
      createTestStructure(testDir);

      const plan = await planService.create('Test Plan');

      const filePath = path.join(testDir, '.workflow', 'plans', 'current', `${plan.id}.md`);
      const content = fs.readFileSync(filePath, 'utf-8');

      // Check for template structure (uses Cyrillic characters from actual template)
      assert.ok(content.includes('# План:'), 'Should include plan header in template');
      assert.ok(content.includes('## Цель'), 'Should include Goal section in template');
      assert.ok(content.includes('title: "Test Plan"'), 'Should include plan title in frontmatter');
    });

    test('should accept optional fields', async () => {
      createTestStructure(testDir);

      const plan = await planService.create('Test Plan', {
        author: 'Custom Author',
        previous_plan: 'PLAN-000',
        related_reports: ['REPORT-001']
      });

      assert.strictEqual(plan.author, 'Custom Author', 'Should set custom author');
      assert.strictEqual(plan.previous_plan, 'PLAN-000', 'Should set previous_plan');
      assert.strictEqual(plan.related_reports.length, 1, 'Should set related_reports');
      assert.strictEqual(plan.related_reports[0], 'REPORT-001', 'Should include report in related_reports');
    });

    test('should update store with created plan', async () => {
      createTestStructure(testDir);

      const plan = await planService.create('Test Plan');

      const found = store.getPlanById(plan.id);
      assert.ok(found, 'Should add plan to store');
      assert.strictEqual(found?.id, plan.id, 'Store should contain created plan');
    });
  });

  suite('getTicketsForPlan()', () => {

    test('should return tickets for specific plan', () => {
      createPlanInStore('PLAN-001', 'Test Plan');
      createTicketInStore('TKT-001', 'Ticket 1', TicketStatus.Backlog, 'PLAN-001');
      createTicketInStore('TKT-002', 'Ticket 2', TicketStatus.Ready, 'PLAN-001');
      createTicketInStore('TKT-003', 'Ticket 3', TicketStatus.Done, 'PLAN-002');

      const tickets = planService.getTicketsForPlan('PLAN-001');

      assert.strictEqual(tickets.length, 2, 'Should return 2 tickets for PLAN-001');
      assert.ok(tickets.find(t => t.id === 'TKT-001'), 'Should include TKT-001');
      assert.ok(tickets.find(t => t.id === 'TKT-002'), 'Should include TKT-002');
      assert.strictEqual(tickets.find(t => t.id === 'TKT-003'), undefined, 'Should not include TKT-003');
    });

    test('should return empty array when no tickets for plan', () => {
      createPlanInStore('PLAN-001', 'Test Plan');
      createTicketInStore('TKT-001', 'Ticket 1', TicketStatus.Backlog, 'PLAN-002');

      const tickets = planService.getTicketsForPlan('PLAN-001');

      assert.strictEqual(tickets.length, 0, 'Should return empty array');
    });
  });

  suite('getPlanProgress()', () => {

    test('should calculate progress percentage correctly', () => {
      createPlanInStore('PLAN-001', 'Test Plan');
      createTicketInStore('TKT-001', 'Ticket 1', TicketStatus.Done, 'PLAN-001');
      createTicketInStore('TKT-002', 'Ticket 2', TicketStatus.Backlog, 'PLAN-001');
      createTicketInStore('TKT-003', 'Ticket 3', TicketStatus.Done, 'PLAN-001');
      createTicketInStore('TKT-004', 'Ticket 4', TicketStatus.InProgress, 'PLAN-001');

      const progress = planService.getPlanProgress('PLAN-001');

      assert.strictEqual(progress.total, 4, 'Should count total tickets');
      assert.strictEqual(progress.done, 2, 'Should count done tickets');
      assert.strictEqual(progress.percentage, 50, 'Should calculate 50% progress');
    });

    test('should return 0% when no tickets', () => {
      createPlanInStore('PLAN-001', 'Test Plan');

      const progress = planService.getPlanProgress('PLAN-001');

      assert.strictEqual(progress.total, 0, 'Should have 0 total tickets');
      assert.strictEqual(progress.done, 0, 'Should have 0 done tickets');
      assert.strictEqual(progress.percentage, 0, 'Should return 0%');
    });

    test('should return 100% when all tickets are done', () => {
      createPlanInStore('PLAN-001', 'Test Plan');
      createTicketInStore('TKT-001', 'Ticket 1', TicketStatus.Done, 'PLAN-001');
      createTicketInStore('TKT-002', 'Ticket 2', TicketStatus.Done, 'PLAN-001');

      const progress = planService.getPlanProgress('PLAN-001');

      assert.strictEqual(progress.total, 2, 'Should count total tickets');
      assert.strictEqual(progress.done, 2, 'Should count done tickets');
      assert.strictEqual(progress.percentage, 100, 'Should calculate 100% progress');
    });
  });

  suite('archive()', () => {

    test('should update plan status to archived', async () => {
      createTestStructure(testDir);
      createPlanInStore('PLAN-001', 'Test Plan', false);

      await planService.archive('PLAN-001');

      const archived = store.getPlanById('PLAN-001');
      assert.strictEqual(archived?.status, 'archived', 'Should update status to archived');
    });

    test('should set completed_at date', async () => {
      createTestStructure(testDir);
      createPlanInStore('PLAN-001', 'Test Plan', false);

      await planService.archive('PLAN-001');

      const archived = store.getPlanById('PLAN-001');
      assert.ok(archived?.completed_at, 'Should set completed_at');
      assert.ok(archived?.completed_at > plan.created_at, 'completed_at should be after created_at');
    });

    test('should throw error for non-existent plan', async () => {
      createTestStructure(testDir);

      await assert.rejects(
        async () => planService.archive('NONEXISTENT'),
        /Plan NONEXISTENT not found/
      );
    });

    test('should move file from current to archive', async () => {
      createTestStructure(testDir);
      await planService.create('Test Plan');

      await planService.archive('PLAN-001');

      const currentPath = path.join(testDir, '.workflow', 'plans', 'current', 'PLAN-001.md');
      const archivePath = path.join(testDir, '.workflow', 'plans', 'archive', 'PLAN-001.md');

      assert.strictEqual(fs.existsSync(currentPath), false, 'Should remove file from current');
      assert.ok(fs.existsSync(archivePath), 'Should create file in archive');
    });

    test('should update file content with archived status', async () => {
      createTestStructure(testDir);
      await planService.create('Test Plan');

      await planService.archive('PLAN-001');

      const archivePath = path.join(testDir, '.workflow', 'plans', 'archive', 'PLAN-001.md');
      const content = fs.readFileSync(archivePath, 'utf-8');

      assert.ok(content.includes('status: archived'), 'Should update status to archived in file');
      assert.ok(content.includes('completed_at:'), 'Should include completed_at in file');
    });
  });

  suite('Integration Tests', () => {

    test('full lifecycle: create, add tickets, check progress, archive', async () => {
      createTestStructure(testDir);

      // Create plan
      const plan = await planService.create('Full Lifecycle Plan');
      assert.strictEqual(plan.status, 'draft', 'Plan should be created with draft status');

      // Add tickets
      createTicketInStore('TKT-001', 'Task 1', TicketStatus.Done, plan.id);
      createTicketInStore('TKT-002', 'Task 2', TicketStatus.InProgress, plan.id);
      createTicketInStore('TKT-003', 'Task 3', TicketStatus.Backlog, plan.id);

      // Check progress
      let progress = planService.getPlanProgress(plan.id);
      assert.strictEqual(progress.total, 3, 'Should have 3 total tickets');
      assert.strictEqual(progress.done, 1, 'Should have 1 done ticket');
      assert.strictEqual(progress.percentage, 33, 'Should calculate ~33% progress');

      // Mark all as done
      const ticket2 = store.getTicketById('TKT-002')!;
      store.updateTicket('TKT-002', { ...ticket2, status: TicketStatus.Done });

      const ticket3 = store.getTicketById('TKT-003')!;
      store.updateTicket('TKT-003', { ...ticket3, status: TicketStatus.Done });

      progress = planService.getPlanProgress(plan.id);
      assert.strictEqual(progress.done, 3, 'Should have 3 done tickets');
      assert.strictEqual(progress.percentage, 100, 'Should calculate 100% progress');

      // Archive plan
      await planService.archive(plan.id);

      const archived = planService.getById(plan.id);
      assert.strictEqual(archived?.status, 'archived', 'Plan should be archived');
      assert.ok(archived?.completed_at, 'Archived plan should have completed_at');

      // Verify getCurrent returns empty, getArchived returns the plan
      const current = planService.getCurrent();
      const archivedPlans = planService.getArchived();

      assert.strictEqual(current.length, 0, 'getCurrent should return empty');
      assert.strictEqual(archivedPlans.length, 1, 'getArchived should return 1 plan');
    });
  });

  suite('getWorkflowRoot()', () => {

    test('should return workflow root path', () => {
      const root = planService.getWorkflowRoot();
      assert.strictEqual(root, path.join(testDir, '.workflow'));
    });
  });

  suite('create() - Edge Cases', () => {

    test('should use default template when template file not found', async () => {
      // Don't create template file
      const workflowDir = path.join(testDir, '.workflow');
      const plansDir = path.join(workflowDir, 'plans');
      fs.mkdirSync(plansDir, { recursive: true });

      const plan = await planService.create('Test Plan');

      assert.strictEqual(plan.id, 'PLAN-001', 'Should generate ID');
      assert.strictEqual(plan.title, 'Test Plan', 'Should set title');
      
      // Verify file was created with default template
      const filePath = path.join(testDir, '.workflow', 'plans', 'current', `${plan.id}.md`);
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(content.includes('# Plan:'), 'Should include default plan header');
    });

    test('should handle non-PLAN IDs when generating next ID', async () => {
      createTestStructure(testDir);
      // Add a plan with non-standard ID
      const nonStandardPlan = createPlanInStore('CUSTOM-001', 'Custom Plan');
      store.addPlan(nonStandardPlan);

      const plan = await planService.create('New Plan');

      assert.strictEqual(plan.id, 'PLAN-001', 'Should start PLAN sequence at 001');
    });

    test('should handle gaps in plan numbering', async () => {
      createTestStructure(testDir);
      createPlanInStore('PLAN-001', 'Plan 1');
      createPlanInStore('PLAN-005', 'Plan 5');
      createPlanInStore('PLAN-010', 'Plan 10');

      const plan = await planService.create('New Plan');

      assert.strictEqual(plan.id, 'PLAN-011', 'Should generate next number after max');
    });

    test('should handle empty related_reports array', async () => {
      createTestStructure(testDir);

      const plan = await planService.create('Test Plan', {
        related_reports: []
      });

      const filePath = path.join(testDir, '.workflow', 'plans', 'current', `${plan.id}.md`);
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(content.includes('related_reports: []'), 'Should include empty related_reports');
    });

    test('should handle multiple related_reports', async () => {
      createTestStructure(testDir);

      const plan = await planService.create('Test Plan', {
        related_reports: ['REPORT-001', 'REPORT-002', 'REPORT-003']
      });

      const filePath = path.join(testDir, '.workflow', 'plans', 'current', `${plan.id}.md`);
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(content.includes('related_reports:'), 'Should include related_reports');
      assert.ok(content.includes('- REPORT-001'), 'Should include first report');
      assert.ok(content.includes('- REPORT-002'), 'Should include second report');
      assert.ok(content.includes('- REPORT-003'), 'Should include third report');
    });
  });

  suite('archive() - Edge Cases', () => {

    test('should handle missing current file gracefully', async () => {
      createTestStructure(testDir);
      // Add plan to store but don't create file
      const plan = createPlanInStore('PLAN-001', 'Test Plan');
      store.addPlan(plan);

      // Should not throw, should still update store
      await planService.archive('PLAN-001');

      const archived = store.getPlanById('PLAN-001');
      assert.strictEqual(archived?.status, 'archived', 'Should update status in store');
    });
  });
});
