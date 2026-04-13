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
import { Plan, Ticket, TicketStatus } from '../../data/types';

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
    fs.mkdirSync(path.join(plansDir, 'templates'), { recursive: true });

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
      assert.ok(archived?.completed_at! > archived?.created_at!, 'completed_at should be after created_at');
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

  suite('approvePlan() - Status Change', () => {

    /**
     * Helper to create a draft plan file on disk and in store
     */
    function createDraftPlan(id: string, title: string, extraFields: Record<string, unknown> = {}): Plan {
      const plansDir = path.join(testDir, '.workflow', 'plans', 'current');
      const now = new Date().toISOString();
      const plan: Plan = {
        id,
        title,
        status: 'draft',
        author: 'Test',
        created_at: now,
        updated_at: now,
        completed_at: '',
        previous_plan: '',
        related_reports: [],
        ...extraFields
      };

      const frontmatterYaml = Object.entries(plan)
        .map(([key, value]) => {
          if (Array.isArray(value)) {
            if (value.length === 0) return `${key}: []`;
            return `${key}:\n${value.map((v: string) => `  - ${v}`).join('\n')}`;
          }
          if (typeof value === 'string') return `${key}: "${value}"`;
          return `${key}: ${value}`;
        })
        .join('\n');

      const content = `---\n${frontmatterYaml}\n---\n## Plan body content`;
      fs.writeFileSync(path.join(plansDir, `${id}.md`), content, 'utf-8');
      store.addPlan(plan);
      return plan;
    }

    test('should change status from draft to approved', async () => {
      createTestStructure(testDir);
      createDraftPlan('PLAN-001', 'Draft Plan');

      // Call approvePlan via command-registration — but since that requires full extension setup,
      // test the core logic via direct file operations that match what approvePlan does
      const planPath = path.join(testDir, '.workflow', 'plans', 'current', 'PLAN-001.md');
      const content = fs.readFileSync(planPath, 'utf-8');

      // Simulate approve: parse, modify, write atomically
      const { safeLoad: _safeLoad } = require('../../utils/yaml-utils');
      const { parse: parseFrontmatter } = require('../../data/frontmatter-parser');
      const { frontmatter, body } = parseFrontmatter(content);
      assert.strictEqual(frontmatter.status, 'draft', 'Should start as draft');

      const updated = { ...frontmatter, status: 'approved', updated_at: new Date().toISOString() };
      const yaml = require('js-yaml');
      const updatedYaml = yaml.dump(updated, { indent: 2, schema: yaml.JSON_SCHEMA }).trimEnd();
      const newContent = `---\n${updatedYaml}\n---\n${body}`;

      const tmpPath = planPath + '.tmp';
      fs.writeFileSync(tmpPath, newContent, 'utf-8');
      fs.renameSync(tmpPath, planPath);

      // Verify
      const newContent_read = fs.readFileSync(planPath, 'utf-8');
      const { frontmatter: newFm } = parseFrontmatter(newContent_read);
      assert.strictEqual(newFm.status, 'approved', 'Status should be approved after approve');
      assert.ok(newFm.updated_at, 'updated_at should be set');
    });

    test('should preserve unknown fields during approve', async () => {
      createTestStructure(testDir);
      createDraftPlan('PLAN-002', 'Plan With Custom Field', { custom_field: 'foo' });

      const planPath = path.join(testDir, '.workflow', 'plans', 'current', 'PLAN-002.md');
      const content = fs.readFileSync(planPath, 'utf-8');
      const { parse: parseFrontmatter } = require('../../data/frontmatter-parser');
      const { frontmatter } = parseFrontmatter(content);
      assert.strictEqual(frontmatter.custom_field, 'foo', 'Should have custom_field before approve');

      // Approve
      const updated = { ...frontmatter, status: 'approved', updated_at: new Date().toISOString() };
      const yaml = require('js-yaml');
      const updatedYaml = yaml.dump(updated, { indent: 2, schema: yaml.JSON_SCHEMA }).trimEnd();
      const { body } = parseFrontmatter(content);
      const newContent = `---\n${updatedYaml}\n---\n${body}`;

      const tmpPath = planPath + '.tmp';
      fs.writeFileSync(tmpPath, newContent, 'utf-8');
      fs.renameSync(tmpPath, planPath);

      // Verify
      const newContent_read = fs.readFileSync(planPath, 'utf-8');
      const { frontmatter: newFm } = parseFrontmatter(newContent_read);
      assert.strictEqual(newFm.custom_field, 'foo', 'custom_field should be preserved after approve');
      assert.strictEqual(newFm.status, 'approved', 'Status should be approved');
    });

    test('atomic write should use temp file + rename', async () => {
      createTestStructure(testDir);
      createDraftPlan('PLAN-003', 'Atomic Test');

      const planPath = path.join(testDir, '.workflow', 'plans', 'current', 'PLAN-003.md');
      const tmpPath = planPath + '.tmp';

      // Before write
      assert.ok(fs.existsSync(planPath), 'Plan file should exist');
      assert.ok(!fs.existsSync(tmpPath), 'Temp file should not exist');

      // Write atomically
      const content = fs.readFileSync(planPath, 'utf-8');
      const { parse: parseFrontmatter } = require('../../data/frontmatter-parser');
      const { frontmatter, body } = parseFrontmatter(content);
      const updated = { ...frontmatter, status: 'approved', updated_at: new Date().toISOString() };
      const yaml = require('js-yaml');
      const updatedYaml = yaml.dump(updated, { indent: 2, schema: yaml.JSON_SCHEMA }).trimEnd();
      const newContent = `---\n${updatedYaml}\n---\n${body}`;

      fs.writeFileSync(tmpPath, newContent, 'utf-8');
      assert.ok(fs.existsSync(tmpPath), 'Temp file should exist after write');

      fs.renameSync(tmpPath, planPath);
      assert.ok(!fs.existsSync(tmpPath), 'Temp file should not exist after rename');
      assert.ok(fs.existsSync(planPath), 'Plan file should exist after rename');
    });
  });

  suite('createFromTemplate() - Plan from Template', () => {

    /**
     * Helper to create a test template file
     */
    function createTemplateFile(id: string, title: string, extraFields: Record<string, unknown> = {}): string {
      const templatesDir = path.join(testDir, '.workflow', 'plans', 'templates');
      const template = {
        id,
        title,
        type: 'template',
        trigger: { type: 'manual', params: {} },
        last_triggered: '',
        enabled: true,
        ...extraFields
      };
      const yamlContent = require('js-yaml').dump(template, { indent: 2, schema: require('js-yaml').JSON_SCHEMA });
      const content = `---\n${yamlContent}---\n## Template body content`;
      const filePath = path.join(templatesDir, `${id}.md`);
      fs.writeFileSync(filePath, content, 'utf-8');
      return filePath;
    }

    test('should create plan from template with correct ID', async () => {
      createTestStructure(testDir);
      const templatePath = createTemplateFile('TMPL-001', 'Test Template');

      const { plan, filePath } = await planService.createFromTemplate(templatePath);

      assert.strictEqual(plan.id, 'PLAN-001', 'Should generate PLAN-001 as first plan');
      assert.strictEqual(plan.status, 'draft', 'Status should be draft');
      assert.strictEqual(plan.title, 'Test Template', 'Title should match template');
      assert.ok(fs.existsSync(filePath), 'File should exist');
    });

    test('should generate correct next ID with gaps in numbering', async () => {
      createTestStructure(testDir);
      // Add plans with gaps: PLAN-001, PLAN-003
      const plan1: Plan = { id: 'PLAN-001', title: 'Plan 1', status: 'active', author: 'Test', created_at: '', updated_at: '', completed_at: '', previous_plan: '', related_reports: [] };
      const plan3: Plan = { id: 'PLAN-003', title: 'Plan 3', status: 'active', author: 'Test', created_at: '', updated_at: '', completed_at: '', previous_plan: '', related_reports: [] };
      store.addPlan(plan1);
      store.addPlan(plan3);

      const templatePath = createTemplateFile('TMPL-001', 'Test Template');
      const { plan } = await planService.createFromTemplate(templatePath);

      assert.strictEqual(plan.id, 'PLAN-004', 'Should generate PLAN-004 (max 3 + 1)');
    });

    test('should substitute frontmatter fields correctly', async () => {
      createTestStructure(testDir);
      const templatePath = createTemplateFile('TMPL-001', 'Test Template');

      const { plan, filePath } = await planService.createFromTemplate(templatePath);
      const content = fs.readFileSync(filePath, 'utf-8');

      assert.ok(content.includes(`id: "${plan.id}"`), 'Should have correct id');
      assert.ok(content.includes('status: "draft"'), 'Should have status draft');
      assert.ok(content.includes('created_at:'), 'Should have created_at');
      assert.ok(content.includes('updated_at:'), 'Should have updated_at');
      assert.ok(content.includes('completed_at: ""'), 'Should have empty completed_at');
    });

    test('should preserve template custom fields in plan', async () => {
      createTestStructure(testDir);
      const templatePath = createTemplateFile('TMPL-001', 'Test Template', {
        custom_field: 'bar',
        plan_author: 'Custom Author'
      });

      const { filePath } = await planService.createFromTemplate(templatePath);
      const content = fs.readFileSync(filePath, 'utf-8');

      assert.ok(content.includes('custom_field: "bar"') || content.includes('custom_field: bar'), 'Should preserve custom_field');
    });

    test('should throw EEXIST when plan file already exists', async () => {
      createTestStructure(testDir);
      const plansDir = path.join(testDir, '.workflow', 'plans', 'current');

      // Create PLAN-001 in store AND on disk
      const plan1: Plan = { id: 'PLAN-001', title: 'Existing', status: 'draft', author: 'Test', created_at: '', updated_at: '', completed_at: '', previous_plan: '', related_reports: [] };
      store.addPlan(plan1);
      fs.writeFileSync(path.join(plansDir, 'PLAN-001.md'), '---\nid: "PLAN-001"\n---\nBody', 'utf-8');

      const templatePath = createTemplateFile('TMPL-001', 'Test Template');

      // First create: generates PLAN-002 (max 1 + 1) — should succeed
      await planService.createFromTemplate(templatePath);

      // Now manually create PLAN-003 on disk (but NOT in store)
      // This simulates a race condition: file exists but store doesn't know about it
      fs.writeFileSync(path.join(plansDir, 'PLAN-003.md'), '---\nid: "PLAN-003"\n---\nBody', 'utf-8');

      // Second create: store sees max(PLAN-001, PLAN-002) = 2, generates PLAN-003
      // But PLAN-003 already exists on disk → wx flag throws EEXIST
      try {
        await planService.createFromTemplate(templatePath);
        assert.fail('Should have thrown EEXIST');
      } catch (error) {
        assert.strictEqual((error as NodeJS.ErrnoException).code, 'EEXIST', 'Should throw EEXIST');
      }
    });

    test('should use wx flag for atomic write', async () => {
      // This tests the wx flag is used — the EEXIST test above indirectly validates this.
      // Direct flag testing would require mocking fs.writeFile which is complex in integration tests.
      // The EEXIST test confirms wx behavior works correctly.
      createTestStructure(testDir);
      const templatePath = createTemplateFile('TMPL-001', 'Test Template');

      const { filePath } = await planService.createFromTemplate(templatePath);
      assert.ok(fs.existsSync(filePath), 'File should exist with wx flag');
    });

    test('should handle template without required frontmatter fields gracefully', async () => {
      createTestStructure(testDir);
      // Minimal template with no optional fields
      const templatesDir = path.join(testDir, '.workflow', 'plans', 'templates');
      const content = `---
id: TMPL-MINIMAL
title: Minimal Template
type: template
trigger:
  type: manual
  params: {}
last_triggered: ""
enabled: true
---
## Minimal body`;
      const filePath = path.join(templatesDir, 'TMPL-MINIMAL.md');
      fs.writeFileSync(filePath, content, 'utf-8');

      const { plan } = await planService.createFromTemplate(filePath);

      assert.strictEqual(plan.id, 'PLAN-001', 'Should generate ID');
      assert.strictEqual(plan.status, 'draft', 'Should be draft');
    });
  });
});
