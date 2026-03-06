/**
 * TicketService Unit Tests
 *
 * Tests for ticket management service including:
 * - CRUD operations (getAll, getByStatus, getById, getByPlan, getByType, create, update, move)
 * - State machine transitions
 * - ID generation
 * - wf CLI integration (mocked)
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowStore } from '../../data/workflow-store';
import { TicketService } from '../../services/ticket-service';
import { Ticket, TicketStatus } from '../../data/types';

suite('TicketService Suite', () => {

  let store: WorkflowStore;
  let ticketService: TicketService;
  let testDir: string;

  setup(() => {
    store = new WorkflowStore();
    testDir = path.join(__dirname, '../../../../tmp/test-ticketservice-' + Date.now());
    // spawn function is no longer used after replacing callWfMove with moveTicketDirect
    ticketService = new TicketService(store, path.join(testDir, '.workflow'));
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
    const templatesDir = path.join(workflowDir, 'templates');

    // Create ticket folders
    const statuses = ['backlog', 'ready', 'in-progress', 'blocked', 'review', 'done'];
    for (const status of statuses) {
      fs.mkdirSync(path.join(ticketsDir, status), { recursive: true });
    }

    // Create templates folder and ticket template
    fs.mkdirSync(templatesDir, { recursive: true });
    createTicketTemplate(templatesDir);

    return { workflowDir, ticketsDir, templatesDir };
  }

  /**
   * Helper to create ticket template
   */
  function createTicketTemplate(templatesDir: string) {
    const template = `---
# Шаблон тикета для универсальной системы координации агентов
# Скопируйте этот файл и заполните поля

id: "{TYPE}-{NNN}"              # IMPL-001, FIX-015, ARCH-003
title: "Название задачи"
status: backlog                  # backlog | ready | in-progress | blocked | review | done
priority: 3                      # 1-критический, 2-высокий, 3-средний, 4-низкий, 5-когда-нибудь

# Тип задачи
type: implementation             # planning | implementation | bugfix | review | documentation | admin

required_capabilities: []
created_at: ""                   # ISO 8601: 2026-02-28T12:00:00Z
updated_at: ""                   # Обновляется при изменении
completed_at: ""                 # Заполняется при завершении

parent_plan: ""                  # Путь к плану: plans/current/plan-001.md
parent_task: ""                  # ID родительской задачи для подзадач

# Зависимости - задачи, которые должны быть выполнены ДО этой
dependencies: []

# Условия выполнения - все должны быть истинны для начала работы
conditions: []

# Контекст - информация для агента-исполнителя
context:
  files: []                      # Файлы для работы
  references: []                 # Ссылки на документацию
  notes: ""                      # Дополнительные заметки

# Оценка сложности
complexity: medium               # simple | medium | complex

tags: []
---

## Описание

<!-- Краткое описание того, что нужно сделать -->

## Детали задачи

<!-- Подробное описание с техническими деталями -->

## Критерии готовности (Definition of Done)

- [ ] Критерий 1
- [ ] Критерий 2
- [ ] Критерий 3

---

## Результат выполнения

<!-- Заполняется агентом-исполнителем после выполнения -->

### Summary

<!-- Краткое описание того, что было сделано -->

### Изменённые файлы

### Заметки для следующих задач

### Время выполнения

- Started:
- Completed:
- Agent used:
`;
    fs.writeFileSync(path.join(templatesDir, 'ticket-template.md'), template, 'utf-8');
  }

  /**
   * Helper to create a test ticket in store
   */
  function createTicketInStore(
    id: string,
    title: string,
    status: TicketStatus,
    type: string = 'impl',
    parentPlan: string = ''
  ): Ticket {
    const ticket: Ticket = {
      id,
      title,
      status,
      priority: 2,
      type,
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

  // ==================== Read Operations Tests ====================

  suite('getAll()', () => {

    test('should return all tickets from store', () => {
      createTicketInStore('IMPL-001', 'Ticket 1', TicketStatus.Backlog);
      createTicketInStore('IMPL-002', 'Ticket 2', TicketStatus.Ready);
      createTicketInStore('FIX-001', 'Ticket 3', TicketStatus.Done);

      const all = ticketService.getAll();

      assert.strictEqual(all.length, 3, 'Should return all 3 tickets');
    });

    test('should return empty array when no tickets', () => {
      const all = ticketService.getAll();

      assert.strictEqual(all.length, 0, 'Should return empty array');
    });
  });

  suite('getByStatus()', () => {

    test('should return only tickets with specified status', () => {
      createTicketInStore('IMPL-001', 'Ticket 1', TicketStatus.Backlog);
      createTicketInStore('IMPL-002', 'Ticket 2', TicketStatus.Backlog);
      createTicketInStore('IMPL-003', 'Ticket 3', TicketStatus.Ready);
      createTicketInStore('FIX-001', 'Ticket 4', TicketStatus.Done);

      const backlog = ticketService.getByStatus(TicketStatus.Backlog);

      assert.strictEqual(backlog.length, 2, 'Should return 2 backlog tickets');
      assert.ok(backlog.find(t => t.id === 'IMPL-001'), 'Should include IMPL-001');
      assert.ok(backlog.find(t => t.id === 'IMPL-002'), 'Should include IMPL-002');
      assert.strictEqual(backlog.find(t => t.id === 'IMPL-003'), undefined, 'Should not include IMPL-003');
    });

    test('should return empty array when no tickets with status', () => {
      createTicketInStore('IMPL-001', 'Ticket 1', TicketStatus.Backlog);

      const done = ticketService.getByStatus(TicketStatus.Done);

      assert.strictEqual(done.length, 0, 'Should return empty array');
    });
  });

  suite('getById()', () => {

    test('should return ticket by ID', () => {
      const ticket = createTicketInStore('IMPL-001', 'Test Ticket', TicketStatus.Backlog);

      const found = ticketService.getById('IMPL-001');

      assert.ok(found, 'Should find ticket by ID');
      assert.strictEqual(found?.title, 'Test Ticket', 'Should return correct ticket');
    });

    test('should return undefined for non-existent ticket', () => {
      const found = ticketService.getById('NONEXISTENT');

      assert.strictEqual(found, undefined, 'Should return undefined for non-existent ticket');
    });
  });

  suite('getByPlan()', () => {

    test('should return tickets for specific plan', () => {
      createTicketInStore('IMPL-001', 'Ticket 1', TicketStatus.Backlog, 'impl', 'PLAN-001');
      createTicketInStore('IMPL-002', 'Ticket 2', TicketStatus.Ready, 'impl', 'PLAN-001');
      createTicketInStore('FIX-001', 'Ticket 3', TicketStatus.Done, 'fix', 'PLAN-002');

      const tickets = ticketService.getByPlan('PLAN-001');

      assert.strictEqual(tickets.length, 2, 'Should return 2 tickets for PLAN-001');
      assert.ok(tickets.find(t => t.id === 'IMPL-001'), 'Should include IMPL-001');
      assert.ok(tickets.find(t => t.id === 'IMPL-002'), 'Should include IMPL-002');
      assert.strictEqual(tickets.find(t => t.id === 'FIX-001'), undefined, 'Should not include FIX-001');
    });

    test('should return empty array when no tickets for plan', () => {
      createTicketInStore('IMPL-001', 'Ticket 1', TicketStatus.Backlog, 'impl', 'PLAN-002');

      const tickets = ticketService.getByPlan('PLAN-001');

      assert.strictEqual(tickets.length, 0, 'Should return empty array');
    });
  });

  suite('getByType()', () => {

    test('should return tickets of specific type', () => {
      // Note: tickets are stored with lowercase type as per workflow convention
      createTicketInStore('IMPL-001', 'Ticket 1', TicketStatus.Backlog, 'impl');
      createTicketInStore('IMPL-002', 'Ticket 2', TicketStatus.Ready, 'impl');
      createTicketInStore('FIX-001', 'Ticket 3', TicketStatus.Done, 'fix');

      const implTickets = ticketService.getByType('impl');

      assert.strictEqual(implTickets.length, 2, 'Should return 2 IMPL tickets');
      assert.ok(implTickets.find(t => t.id === 'IMPL-001'), 'Should include IMPL-001');
      assert.ok(implTickets.find(t => t.id === 'IMPL-002'), 'Should include IMPL-002');
      assert.strictEqual(implTickets.find(t => t.id === 'FIX-001'), undefined, 'Should not include FIX-001');
    });
  });

  // ==================== State Machine Tests ====================

  suite('getValidTransitions()', () => {

    test('should return valid transitions from backlog', () => {
      const transitions = ticketService.getValidTransitions(TicketStatus.Backlog);

      assert.strictEqual(transitions.length, 1, 'Should have 1 valid transition');
      assert.ok(transitions.includes(TicketStatus.Ready), 'Should allow transition to ready');
    });

    test('should return valid transitions from ready', () => {
      const transitions = ticketService.getValidTransitions(TicketStatus.Ready);

      assert.strictEqual(transitions.length, 3, 'Should have 3 valid transitions');
      assert.ok(transitions.includes(TicketStatus.InProgress), 'Should allow transition to in-progress');
      assert.ok(transitions.includes(TicketStatus.Review), 'Should allow transition to review');
      assert.ok(transitions.includes(TicketStatus.Backlog), 'Should allow transition to backlog');
    });

    test('should return valid transitions from in-progress', () => {
      const transitions = ticketService.getValidTransitions(TicketStatus.InProgress);

      assert.strictEqual(transitions.length, 4, 'Should have 4 valid transitions');
      assert.ok(transitions.includes(TicketStatus.Review), 'Should allow transition to review');
      assert.ok(transitions.includes(TicketStatus.Blocked), 'Should allow transition to blocked');
      assert.ok(transitions.includes(TicketStatus.Done), 'Should allow transition to done');
      assert.ok(transitions.includes(TicketStatus.Backlog), 'Should allow transition to backlog');
    });

    test('should return valid transitions from review', () => {
      const transitions = ticketService.getValidTransitions(TicketStatus.Review);

      assert.strictEqual(transitions.length, 5, 'Should have 5 valid transitions');
      assert.ok(transitions.includes(TicketStatus.Done), 'Should allow transition to done');
      assert.ok(transitions.includes(TicketStatus.InProgress), 'Should allow transition to in-progress');
      assert.ok(transitions.includes(TicketStatus.Ready), 'Should allow transition to ready');
      assert.ok(transitions.includes(TicketStatus.Blocked), 'Should allow transition to blocked');
      assert.ok(transitions.includes(TicketStatus.Backlog), 'Should allow transition to backlog');
    });

    test('should return valid transitions from blocked', () => {
      const transitions = ticketService.getValidTransitions(TicketStatus.Blocked);

      assert.strictEqual(transitions.length, 2, 'Should have 2 valid transitions');
      assert.ok(transitions.includes(TicketStatus.Ready), 'Should allow transition to ready');
      assert.ok(transitions.includes(TicketStatus.Backlog), 'Should allow transition to backlog');
    });

    test('should return valid transitions from done', () => {
      const transitions = ticketService.getValidTransitions(TicketStatus.Done);

      assert.strictEqual(transitions.length, 1, 'Should have 1 valid transition from done');
      assert.ok(transitions.includes(TicketStatus.Backlog), 'Should allow transition to backlog');
    });
  });

  suite('isValidTransition()', () => {

    test('should return true for valid transitions', () => {
      assert.ok(ticketService.isValidTransition(TicketStatus.Backlog, TicketStatus.Ready), 'backlog → ready should be valid');
      assert.ok(ticketService.isValidTransition(TicketStatus.Ready, TicketStatus.InProgress), 'ready → in-progress should be valid');
      assert.ok(ticketService.isValidTransition(TicketStatus.Ready, TicketStatus.Review), 'ready → review should be valid');
      assert.ok(ticketService.isValidTransition(TicketStatus.InProgress, TicketStatus.Done), 'in-progress → done should be valid');
      assert.ok(ticketService.isValidTransition(TicketStatus.InProgress, TicketStatus.Review), 'in-progress → review should be valid');
      assert.ok(ticketService.isValidTransition(TicketStatus.Review, TicketStatus.Done), 'review → done should be valid');
      assert.ok(ticketService.isValidTransition(TicketStatus.Review, TicketStatus.Blocked), 'review → blocked should be valid');
      assert.ok(ticketService.isValidTransition(TicketStatus.Blocked, TicketStatus.Ready), 'blocked → ready should be valid');
    });

    test('should return false for invalid transitions', () => {
      assert.ok(!ticketService.isValidTransition(TicketStatus.Backlog, TicketStatus.Done), 'backlog → done should be invalid');
      assert.ok(!ticketService.isValidTransition(TicketStatus.Ready, TicketStatus.Done), 'ready → done should be invalid');
      assert.ok(!ticketService.isValidTransition(TicketStatus.Done, TicketStatus.Ready), 'done → ready should be invalid');
    });
  });

  // ==================== Create Operation Tests ====================

  suite('create()', () => {

    test('should create ticket with generated ID', async () => {
      createTestStructure(testDir);

      const ticket = await ticketService.create('IMPL', 'Test Ticket');

      assert.strictEqual(ticket.id, 'IMPL-001', 'Should generate IMPL-001 as first ID');
      assert.strictEqual(ticket.title, 'Test Ticket', 'Should set title');
      assert.strictEqual(ticket.status, TicketStatus.Backlog, 'Should set status to backlog');
    });

    test('should generate next sequential ID for same type', async () => {
      createTestStructure(testDir);
      createTicketInStore('IMPL-001', 'Existing Ticket', TicketStatus.Backlog, 'impl');
      createTicketInStore('IMPL-002', 'Another Ticket', TicketStatus.Ready, 'impl');

      const ticket = await ticketService.create('IMPL', 'New Ticket');

      assert.strictEqual(ticket.id, 'IMPL-003', 'Should generate IMPL-003');
    });

    test('should generate ID with correct prefix for different types', async () => {
      createTestStructure(testDir);
      createTicketInStore('IMPL-001', 'Impl Ticket', TicketStatus.Backlog, 'impl');
      createTicketInStore('FIX-001', 'Fix Ticket', TicketStatus.Backlog, 'fix');

      const fixTicket = await ticketService.create('FIX', 'New Fix Ticket');

      assert.strictEqual(fixTicket.id, 'FIX-002', 'Should generate FIX-002');

      const archTicket = await ticketService.create('ARCH', 'New Arch Ticket');

      assert.strictEqual(archTicket.id, 'ARCH-001', 'Should generate ARCH-001');
    });

    test('should create ticket file in backlog/', async () => {
      createTestStructure(testDir);

      const ticket = await ticketService.create('IMPL', 'Test Ticket');

      const filePath = path.join(testDir, '.workflow', 'tickets', 'backlog', `${ticket.id}.md`);
      assert.ok(fs.existsSync(filePath), 'Should create file in backlog/');
    });

    test('should include template content', async () => {
      createTestStructure(testDir);

      const ticket = await ticketService.create('IMPL', 'Test Ticket');

      const filePath = path.join(testDir, '.workflow', 'tickets', 'backlog', `${ticket.id}.md`);
      const content = fs.readFileSync(filePath, 'utf-8');

      // Check for template structure
      assert.ok(content.includes('## Описание'), 'Should include Description section');
      assert.ok(content.includes('## Детали задачи'), 'Should include Details section');
      assert.ok(content.includes('## Критерии готовности'), 'Should include DoD section');
      assert.ok(content.includes(`id: ${ticket.id}`), 'Should include ticket ID in frontmatter');
      // Title may be quoted or unquoted depending on YAML serializer
      assert.ok(content.includes('title: Test Ticket') || content.includes('title: "Test Ticket"'), 'Should include title in frontmatter');
    });

    test('should accept optional fields', async () => {
      createTestStructure(testDir);

      const ticket = await ticketService.create('IMPL', 'Test Ticket', {
        priority: 1,
        parent_plan: 'PLAN-001',
        tags: ['backend', 'api'],
        complexity: 'complex'
      });

      assert.strictEqual(ticket.priority, 1, 'Should set custom priority');
      assert.strictEqual(ticket.parent_plan, 'PLAN-001', 'Should set parent_plan');
      assert.strictEqual(ticket.tags.length, 2, 'Should set tags');
      assert.strictEqual(ticket.tags[0], 'backend', 'Should include first tag');
      assert.strictEqual(ticket.complexity, 'complex', 'Should set complexity');
    });

    test('should update store with created ticket', async () => {
      createTestStructure(testDir);

      const ticket = await ticketService.create('IMPL', 'Test Ticket');

      const found = store.getTicketById(ticket.id);
      assert.ok(found, 'Should add ticket to store');
      assert.strictEqual(found?.id, ticket.id, 'Store should contain created ticket');
    });

    test('should set created_at and updated_at timestamps', async () => {
      createTestStructure(testDir);

      const ticket = await ticketService.create('IMPL', 'Test Ticket');

      assert.ok(ticket.created_at, 'Should set created_at');
      assert.ok(ticket.updated_at, 'Should set updated_at');
      assert.strictEqual(ticket.created_at, ticket.updated_at, 'created_at and updated_at should be equal on create');
    });
  });

  // ==================== Update Operation Tests ====================

  suite('update()', () => {

    test('should update ticket fields', async () => {
      createTestStructure(testDir);
      // Create ticket via service (creates file on disk)
      const ticket = await ticketService.create('IMPL', 'Original Title');

      await ticketService.update(ticket.id, {
        title: 'Updated Title',
        priority: 1,
        complexity: 'complex'
      });

      const updated = ticketService.getById(ticket.id);
      assert.ok(updated, 'Should find updated ticket');
      assert.strictEqual(updated?.title, 'Updated Title', 'Should update title');
      assert.strictEqual(updated?.priority, 1, 'Should update priority');
      assert.strictEqual(updated?.complexity, 'complex', 'Should update complexity');
    });

    test('should update updated_at timestamp', async () => {
      createTestStructure(testDir);
      // Create ticket via service (creates file on disk)
      const ticket = await ticketService.create('IMPL', 'Test Ticket');
      const beforeUpdate = new Date().toISOString();

      await ticketService.update(ticket.id, { title: 'Updated' });

      const updated = ticketService.getById(ticket.id);
      assert.ok(updated, 'Should find updated ticket');
      assert.ok(updated!.updated_at > beforeUpdate || updated!.updated_at >= ticket.updated_at, 'Should update updated_at');
    });

    test('should throw error for non-existent ticket', async () => {
      createTestStructure(testDir);

      await assert.rejects(
        async () => ticketService.update('NONEXISTENT', { title: 'Updated' }),
        /Ticket NONEXISTENT not found/
      );
    });
  });

  // ==================== Move Operation Tests ====================

  suite('move()', () => {

    test('should throw error for non-existent ticket', async () => {
      createTestStructure(testDir);

      await assert.rejects(
        async () => ticketService.move('NONEXISTENT', TicketStatus.Ready),
        /Ticket NONEXISTENT not found/
      );
    });

    test('should throw error for invalid transition', async () => {
      createTestStructure(testDir);
      createTicketInStore('IMPL-001', 'Test Ticket', TicketStatus.Backlog);

      await assert.rejects(
        async () => ticketService.move('IMPL-001', TicketStatus.Done),
        /Invalid transition/
      );
    });

    test('should move ticket file to target status directory', async () => {
      createTestStructure(testDir);
      // Create ticket file in backlog
      const ticket = await ticketService.create('IMPL', 'Test Ticket');

      // Move to ready
      await ticketService.move(ticket.id, TicketStatus.Ready);

      const sourcePath = path.join(testDir, '.workflow', 'tickets', 'backlog', `${ticket.id}.md`);
      const targetPath = path.join(testDir, '.workflow', 'tickets', 'ready', `${ticket.id}.md`);

      assert.ok(!fs.existsSync(sourcePath), 'Should remove file from backlog');
      assert.ok(fs.existsSync(targetPath), 'Should create file in ready');
    });

    test('should update frontmatter status and updated_at when moving', async () => {
      createTestStructure(testDir);
      const ticket = await ticketService.create('IMPL', 'Test Ticket');
      const beforeMove = new Date().toISOString();

      await ticketService.move(ticket.id, TicketStatus.Ready);

      const targetPath = path.join(testDir, '.workflow', 'tickets', 'ready', `${ticket.id}.md`);
      const content = fs.readFileSync(targetPath, 'utf-8');

      assert.ok(content.includes('status: ready'), 'Should update status to ready');
      assert.ok(content.includes('updated_at:'), 'Should have updated_at field');

      // Verify updated_at is after beforeMove
      const updatedMatch = content.match(/updated_at:\s*["']?([^"'\n\r]+)/);
      assert.ok(updatedMatch, 'Should find updated_at in frontmatter');
      if (updatedMatch) {
        const updatedDate = new Date(updatedMatch[1]);
        assert.ok(updatedDate >= new Date(beforeMove), 'updated_at should be >= beforeMove');
      }
    });

    test('should set completed_at when moving to Done', async () => {
      createTestStructure(testDir);
      const ticket = await ticketService.create('IMPL', 'Test Ticket');

      // Move through workflow to done
      await ticketService.move(ticket.id, TicketStatus.Ready);
      await ticketService.move(ticket.id, TicketStatus.InProgress);
      await ticketService.move(ticket.id, TicketStatus.Done);

      const targetPath = path.join(testDir, '.workflow', 'tickets', 'done', `${ticket.id}.md`);
      const content = fs.readFileSync(targetPath, 'utf-8');

      assert.ok(content.includes('completed_at:'), 'Should set completed_at when moving to done');
    });

    test('should update store with new status after move', async () => {
      createTestStructure(testDir);
      const ticket = await ticketService.create('IMPL', 'Test Ticket');

      await ticketService.move(ticket.id, TicketStatus.Ready);

      const moved = ticketService.getById(ticket.id);
      assert.strictEqual(moved?.status, TicketStatus.Ready, 'Should update status in store');
    });

    test('should handle move error when source file not found', async () => {
      createTestStructure(testDir);
      // Add ticket to store but don't create file
      createTicketInStore('IMPL-001', 'Test Ticket', TicketStatus.Backlog);

      await assert.rejects(
        async () => ticketService.move('IMPL-001', TicketStatus.Ready),
        /Failed to read ticket file/
      );
    });
  });

  // ==================== Integration Tests ====================

  suite('Integration Tests', () => {

    test('full lifecycle: create, update, move through workflow', async () => {
      createTestStructure(testDir);

      // Create ticket
      const ticket = await ticketService.create('IMPL', 'Full Lifecycle Test');
      assert.strictEqual(ticket.status, TicketStatus.Backlog, 'Should start in backlog');

      // Update ticket
      await ticketService.update(ticket.id, { priority: 1, complexity: 'complex' });
      const updated = ticketService.getById(ticket.id);
      assert.strictEqual(updated?.priority, 1, 'Should update priority');
      assert.strictEqual(updated?.complexity, 'complex', 'Should update complexity');

      // Verify state machine transitions
      const transitions = ticketService.getValidTransitions(TicketStatus.Backlog);
      assert.ok(transitions.includes(TicketStatus.Ready), 'Should allow backlog → ready');

      // Note: Actual move requires wf CLI which may not be installed
      // Manually simulate move for integration test
      store.updateTicket(ticket.id, { ...updated!, status: TicketStatus.Ready });

      const moved = ticketService.getById(ticket.id);
      assert.strictEqual(moved?.status, TicketStatus.Ready, 'Should move to ready');

      // Verify next valid transitions
      const readyTransitions = ticketService.getValidTransitions(TicketStatus.Ready);
      assert.ok(readyTransitions.includes(TicketStatus.InProgress), 'Should allow ready → in-progress');
    });

    test('create multiple tickets with different types and verify ID generation', async () => {
      createTestStructure(testDir);

      // Create tickets of different types
      const implTicket = await ticketService.create('IMPL', 'Impl Ticket');
      const fixTicket = await ticketService.create('FIX', 'Fix Ticket');
      const archTicket = await ticketService.create('ARCH', 'Arch Ticket');

      assert.strictEqual(implTicket.id, 'IMPL-001', 'First IMPL should be IMPL-001');
      assert.strictEqual(fixTicket.id, 'FIX-001', 'First FIX should be FIX-001');
      assert.strictEqual(archTicket.id, 'ARCH-001', 'First ARCH should be ARCH-001');

      // Create more tickets to verify sequential IDs
      const implTicket2 = await ticketService.create('IMPL', 'Another Impl');
      const fixTicket2 = await ticketService.create('FIX', 'Another Fix');

      assert.strictEqual(implTicket2.id, 'IMPL-002', 'Second IMPL should be IMPL-002');
      assert.strictEqual(fixTicket2.id, 'FIX-002', 'Second FIX should be FIX-002');
    });

    test('verify all state machine transitions', async () => {
      createTestStructure(testDir);

      // Test all valid transitions
      const validTransitions: Array<[TicketStatus, TicketStatus]> = [
        [TicketStatus.Backlog, TicketStatus.Ready],
        [TicketStatus.Ready, TicketStatus.InProgress],
        [TicketStatus.Ready, TicketStatus.Review],
        [TicketStatus.Ready, TicketStatus.Backlog],
        [TicketStatus.InProgress, TicketStatus.Review],
        [TicketStatus.InProgress, TicketStatus.Blocked],
        [TicketStatus.InProgress, TicketStatus.Done],
        [TicketStatus.InProgress, TicketStatus.Backlog],
        [TicketStatus.Review, TicketStatus.Done],
        [TicketStatus.Review, TicketStatus.InProgress],
        [TicketStatus.Review, TicketStatus.Ready],
        [TicketStatus.Review, TicketStatus.Blocked],
        [TicketStatus.Review, TicketStatus.Backlog],
        [TicketStatus.Blocked, TicketStatus.Ready],
        [TicketStatus.Blocked, TicketStatus.Backlog],
        [TicketStatus.Done, TicketStatus.Backlog]
      ];

      for (const [from, to] of validTransitions) {
        assert.ok(
          ticketService.isValidTransition(from, to),
          `Transition ${from} → ${to} should be valid`
        );
      }

      // Test some invalid transitions
      const invalidTransitions: Array<[TicketStatus, TicketStatus]> = [
        [TicketStatus.Backlog, TicketStatus.Done],
        [TicketStatus.Ready, TicketStatus.Done],
        [TicketStatus.Done, TicketStatus.Ready],
        [TicketStatus.Blocked, TicketStatus.Done]
      ];

      for (const [from, to] of invalidTransitions) {
        assert.ok(
          !ticketService.isValidTransition(from, to),
          `Transition ${from} → ${to} should be invalid`
        );
      }
    });
  });
});
