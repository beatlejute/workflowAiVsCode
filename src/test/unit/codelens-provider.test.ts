/**
 * Unit tests for CodeLensProvider
 *
 * Tests:
 * - TicketCodeLensProvider: Status line with Move actions
 * - TicketCodeLensProvider: Dependencies line with status icons
 * - TicketCodeLensProvider: Plan link
 * - TicketCodeLensProvider: Review status (if present)
 * - Valid transitions match state machine
 * - Non-existent tickets don't create CodeLenses
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowStore } from '../../data/workflow-store';
import { TicketService } from '../../services/ticket-service';
import { DependencyService } from '../../services/dependency-service';
import {
  TicketCodeLensProvider,
  WorkflowCodeLensProvider
} from '../../ui/codelens-provider';
import { Ticket, TicketStatus } from '../../data/types';

suite('CodeLensProvider Tests', () => {
  let store: WorkflowStore;
  let ticketService: TicketService;
  let dependencyService: DependencyService;
  let tempWorkflowRoot: string;

  suiteSetup(async () => {
    // Create temporary workflow directory for testing
    const tempDir = path.join(__dirname, '../../../tmp/test-workflow-codelens');

    // Create directory structure
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'tickets', 'ready'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'tickets', 'in-progress'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'tickets', 'blocked'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'tickets', 'done'), { recursive: true });
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

    // Create ticket template
    fs.writeFileSync(
      path.join(tempDir, '.workflow', 'templates', 'ticket-template.md'),
      `---
id: "{id}"
title: "{title}"
status: backlog
priority: 3
type: "{type}"
---

# {title}
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
      fs.rmSync(path.join(__dirname, '../../../tmp/test-workflow-codelens'), {
        recursive: true,
        force: true
      });
    } catch (error) {
      console.error('Failed to cleanup test directory:', error);
    }
  });

  suite('TicketCodeLensProvider', () => {
    let provider: TicketCodeLensProvider;

    setup(() => {
      ticketService = new TicketService(store, tempWorkflowRoot);
      dependencyService = new DependencyService(store);
      provider = new TicketCodeLensProvider(store, ticketService, dependencyService);
      provider.setWorkflowRoot(tempWorkflowRoot);
    });

    test('creates status CodeLens with correct icon', async () => {
      // Create test ticket
      const ticket: Ticket = {
        id: 'CODELENS-001',
        title: 'CodeLens Test Ticket',
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

      // Create ticket file
      const ticketContent = `---
id: CODELENS-001
title: CodeLens Test Ticket
status: ready
priority: 3
type: IMPL
---

# CodeLens Test Ticket
`;
      const ticketPath = path.join(tempWorkflowRoot, 'tickets', 'ready', 'CODELENS-001.md');
      fs.writeFileSync(ticketPath, ticketContent);

      const document = await vscode.workspace.openTextDocument(ticketPath);
      const lenses = provider.provideCodeLenses(document);

      // Should have at least status lens
      assert.ok(lenses.length >= 1, 'Should have at least status CodeLens');

      // Verify status lens has correct icon
      const statusLens = lenses[0];
      assert.ok(statusLens.command, 'Status lens should have command');
      assert.ok(
        statusLens.command!.title.includes('✅ ready'),
        `Status lens should show ready icon, got: ${statusLens.command!.title}`
      );
    });

    test('creates Move actions based on valid transitions', async () => {
      const ticket: Ticket = {
        id: 'CODELENS-002',
        title: 'Move Actions Test',
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

      const ticketContent = `---
id: CODELENS-002
title: Move Actions Test
status: ready
priority: 3
type: IMPL
---

# Move Actions Test
`;
      const ticketPath = path.join(tempWorkflowRoot, 'tickets', 'ready', 'CODELENS-002.md');
      fs.writeFileSync(ticketPath, ticketContent);

      const document = await vscode.workspace.openTextDocument(ticketPath);
      const lenses = provider.provideCodeLenses(document);

      assert.ok(lenses.length >= 1, 'Should have status CodeLens');
      const statusLens = lenses[0];
      assert.ok(statusLens.command, 'Status lens should have command');

      // Ready status should allow transition to in-progress
      assert.ok(
        statusLens.command!.title.includes('Move:'),
        'Should have Move actions'
      );
      assert.ok(
        statusLens.command!.title.includes('[in-progress]'),
        'Should allow transition to in-progress from ready'
      );
    });

    test('creates dependencies CodeLens with status icons', async () => {
      // Create dependency tickets
      const depTicket: Ticket = {
        id: 'DEP-001',
        title: 'Dependency Ticket',
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
      store.addTicket(depTicket);

      const mainTicket: Ticket = {
        id: 'CODELENS-003',
        title: 'Dependencies Test',
        status: TicketStatus.Ready,
        priority: 3,
        type: 'IMPL',
        dependencies: ['DEP-001'],
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
      store.addTicket(mainTicket);

      const ticketContent = `---
id: CODELENS-003
title: Dependencies Test
status: ready
priority: 3
type: IMPL
dependencies:
  - DEP-001
---

# Dependencies Test
`;
      const ticketPath = path.join(tempWorkflowRoot, 'tickets', 'ready', 'CODELENS-003.md');
      fs.writeFileSync(ticketPath, ticketContent);

      const document = await vscode.workspace.openTextDocument(ticketPath);
      const lenses = provider.provideCodeLenses(document);

      // Should have status and dependencies lenses
      assert.ok(lenses.length >= 2, 'Should have status and dependencies CodeLenses');

      // Find dependencies lens
      const depsLens = lenses.find(l => l.command?.title?.includes('Deps:'));
      assert.ok(depsLens, 'Should have dependencies CodeLens');
      assert.ok(
        depsLens!.command!.title.includes('DEP-001'),
        'Should show dependency ID'
      );
      assert.ok(
        depsLens!.command!.title.includes('✅'),
        'Should show done status icon for dependency'
      );
    });

    test('creates plan CodeLens', async () => {
      const ticket: Ticket = {
        id: 'CODELENS-004',
        title: 'Plan Link Test',
        status: TicketStatus.Ready,
        priority: 3,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: 'PLAN-005',
        parent_task: '',
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
        completed_at: ''
      };
      store.addTicket(ticket);

      const ticketContent = `---
id: CODELENS-004
title: Plan Link Test
status: ready
priority: 3
type: IMPL
parent_plan: PLAN-005
---

# Plan Link Test
`;
      const ticketPath = path.join(tempWorkflowRoot, 'tickets', 'ready', 'CODELENS-004.md');
      fs.writeFileSync(ticketPath, ticketContent);

      const document = await vscode.workspace.openTextDocument(ticketPath);
      const lenses = provider.provideCodeLenses(document);

      // Should have status and plan lenses
      assert.ok(lenses.length >= 2, 'Should have status and plan CodeLenses');

      // Find plan lens
      const planLens = lenses.find(l => l.command?.title?.includes('Plan:'));
      assert.ok(planLens, 'Should have plan CodeLens');
      assert.ok(
        planLens!.command!.title.includes('PLAN-005'),
        'Should show plan ID'
      );
    });

    test('returns empty array for non-existent ticket', async () => {
      // Create ticket file without adding to store
      const ticketContent = `---
id: NONEXISTENT-001
title: Non-existent Test
status: ready
priority: 3
type: IMPL
---

# Non-existent Test
`;
      const ticketPath = path.join(tempWorkflowRoot, 'tickets', 'ready', 'NONEXISTENT-001.md');
      fs.writeFileSync(ticketPath, ticketContent);

      const document = await vscode.workspace.openTextDocument(ticketPath);
      const lenses = provider.provideCodeLenses(document);

      assert.strictEqual(lenses.length, 0, 'Should have 0 CodeLenses for non-existent ticket');
    });

    test('returns empty array when workflow root not set', async () => {
      const providerWithoutRoot = new TicketCodeLensProvider(store, ticketService, dependencyService);
      // Don't set workflow root

      const ticket: Ticket = {
        id: 'CODELENS-005',
        title: 'No Root Test',
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

      const ticketContent = `---
id: CODELENS-005
title: No Root Test
status: ready
priority: 3
type: IMPL
---

# No Root Test
`;
      const ticketPath = path.join(tempWorkflowRoot, 'tickets', 'ready', 'CODELENS-005.md');
      fs.writeFileSync(ticketPath, ticketContent);

      const document = await vscode.workspace.openTextDocument(ticketPath);
      const lenses = providerWithoutRoot.provideCodeLenses(document);

      assert.strictEqual(lenses.length, 0, 'Should have 0 CodeLenses when workflow root not set');
    });

    test('shows correct icons for different statuses', async () => {
      const testCases = [
        { status: TicketStatus.Backlog, expectedIcon: '📋' },
        { status: TicketStatus.Ready, expectedIcon: '✅' },
        { status: TicketStatus.InProgress, expectedIcon: '🔄' },
        { status: TicketStatus.Review, expectedIcon: '👀' },
        { status: TicketStatus.Blocked, expectedIcon: '🚫' },
        { status: TicketStatus.Done, expectedIcon: '✨' }
      ];

      for (const testCase of testCases) {
        const ticket: Ticket = {
          id: `STATUS-${testCase.status.toUpperCase()}`,
          title: `Status Test ${testCase.status}`,
          status: testCase.status,
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

        const statusDir = path.join(tempWorkflowRoot, 'tickets', testCase.status);
        fs.mkdirSync(statusDir, { recursive: true });

        const ticketContent = `---
id: STATUS-${testCase.status.toUpperCase()}
title: Status Test ${testCase.status}
status: ${testCase.status}
priority: 3
type: IMPL
---

# Status Test
`;
        const ticketPath = path.join(statusDir, `STATUS-${testCase.status.toUpperCase()}.md`);
        fs.writeFileSync(ticketPath, ticketContent);

        const document = await vscode.workspace.openTextDocument(ticketPath);
        const lenses = provider.provideCodeLenses(document);

        assert.ok(lenses.length >= 1, `Should have CodeLens for ${testCase.status}`);
        assert.ok(
          lenses[0].command?.title?.includes(testCase.expectedIcon),
          `Should show ${testCase.expectedIcon} for ${testCase.status}, got: ${lenses[0].command?.title}`
        );
      }
    });

    test('shows dependency status icons correctly', async () => {
      const depStatusTests = [
        { status: TicketStatus.Backlog, expectedIcon: '⬜' },
        { status: TicketStatus.Ready, expectedIcon: '🔵' },
        { status: TicketStatus.InProgress, expectedIcon: '🔷' },
        { status: TicketStatus.Review, expectedIcon: '👁️' },
        { status: TicketStatus.Blocked, expectedIcon: '🔴' },
        { status: TicketStatus.Done, expectedIcon: '✅' }
      ];

      for (const test of depStatusTests) {
        const depTicket: Ticket = {
          id: `DEPSTATUS-${test.status.toUpperCase()}`,
          title: `Dep Status ${test.status}`,
          status: test.status,
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
        store.addTicket(depTicket);

        const mainTicket: Ticket = {
          id: `MAIN-${test.status.toUpperCase()}`,
          title: `Main ${test.status}`,
          status: TicketStatus.Ready,
          priority: 3,
          type: 'IMPL',
          dependencies: [`DEPSTATUS-${test.status.toUpperCase()}`],
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
        store.addTicket(mainTicket);

        const statusDir = path.join(tempWorkflowRoot, 'tickets', test.status);
        fs.mkdirSync(statusDir, { recursive: true });

        const depTicketContent = `---
id: DEPSTATUS-${test.status.toUpperCase()}
title: Dep Status ${test.status}
status: ${test.status}
priority: 3
type: IMPL
---

# Dep Status Test
`;
        const depTicketPath = path.join(statusDir, `DEPSTATUS-${test.status.toUpperCase()}.md`);
        fs.writeFileSync(depTicketPath, depTicketContent);

        const mainTicketContent = `---
id: MAIN-${test.status.toUpperCase()}
title: Main ${test.status}
status: ready
priority: 3
type: IMPL
dependencies:
  - DEPSTATUS-${test.status.toUpperCase()}
---

# Main Test
`;
        const mainTicketPath = path.join(tempWorkflowRoot, 'tickets', 'ready', `MAIN-${test.status.toUpperCase()}.md`);
        fs.writeFileSync(mainTicketPath, mainTicketContent);

        const document = await vscode.workspace.openTextDocument(mainTicketPath);
        const lenses = provider.provideCodeLenses(document);

        const depsLens = lenses.find(l => l.command?.title?.includes('Deps:'));
        assert.ok(depsLens, `Should have dependencies lens for ${test.status}`);
        assert.ok(
          depsLens!.command!.title.includes(test.expectedIcon),
          `Should show ${test.expectedIcon} for dependency with status ${test.status}, got: ${depsLens!.command!.title}`
        );
      }
    });
  });

  suite('WorkflowCodeLensProvider', () => {
    let provider: WorkflowCodeLensProvider;

    setup(() => {
      ticketService = new TicketService(store, tempWorkflowRoot);
      dependencyService = new DependencyService(store);
      provider = new WorkflowCodeLensProvider(store, ticketService, dependencyService);
      provider.setWorkflowRoot(tempWorkflowRoot);
    });

    test('delegates to TicketCodeLensProvider for .md files', async () => {
      const ticket: Ticket = {
        id: 'WORKFLOW-001',
        title: 'Workflow Provider Test',
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

      const ticketContent = `---
id: WORKFLOW-001
title: Workflow Provider Test
status: ready
priority: 3
type: IMPL
---

# Workflow Provider Test
`;
      const ticketPath = path.join(tempWorkflowRoot, 'tickets', 'ready', 'WORKFLOW-001.md');
      fs.writeFileSync(ticketPath, ticketContent);

      const document = await vscode.workspace.openTextDocument(ticketPath);
      const lenses = provider.provideCodeLenses(document);

      assert.ok(lenses.length >= 1, 'Should have CodeLenses for ticket .md file');
    });

    test('returns empty array for non-ticket files', async () => {
      // Create a non-ticket .md file
      const otherContent = `# Other File

Not a workflow ticket.
`;
      const otherPath = path.join(tempWorkflowRoot, 'other-file.md');
      fs.writeFileSync(otherPath, otherContent);

      const document = await vscode.workspace.openTextDocument(otherPath);
      const lenses = provider.provideCodeLenses(document);

      assert.strictEqual(lenses.length, 0, 'Should have 0 CodeLenses for non-ticket files');
    });
  });

  suite('State Machine Transitions', () => {
    test('valid transitions match state machine', () => {
      const validTransitions = {
        [TicketStatus.Backlog]: [TicketStatus.Ready],
        [TicketStatus.Ready]: [TicketStatus.InProgress, TicketStatus.Review, TicketStatus.Backlog],
        [TicketStatus.InProgress]: [TicketStatus.Review, TicketStatus.Blocked, TicketStatus.Done, TicketStatus.Backlog],
        [TicketStatus.Review]: [TicketStatus.Done, TicketStatus.InProgress, TicketStatus.Ready, TicketStatus.Blocked, TicketStatus.Backlog],
        [TicketStatus.Blocked]: [TicketStatus.Ready, TicketStatus.Backlog],
        [TicketStatus.Done]: [TicketStatus.Backlog]
      };

      for (const [fromStatus, expectedToStatuses] of Object.entries(validTransitions)) {
        const ticket: Ticket = {
          id: `TRANSITION-${fromStatus.toUpperCase()}`,
          title: `Transition Test ${fromStatus}`,
          status: fromStatus as TicketStatus,
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

        const ts = new TicketService(store, tempWorkflowRoot);
        const transitions = ts.getValidTransitions(fromStatus as TicketStatus);

        assert.deepStrictEqual(
          transitions,
          expectedToStatuses,
          `Transitions from ${fromStatus} should match state machine`
        );
      }
    });
  });
});
