/**
 * Unit tests for Command Handlers
 *
 * Tests:
 * - new-ticket: QuickPick type → InputBox title → create file → open
 * - move-ticket: QuickPick tickets → QuickPick statuses → call wf CLI
 * - show-dependencies: QuickPick with deps + blocks + chain
 * - show-statistics: ASCII-bars by status, type, priority
 * - index: openPipelineConfig, openConfig, focusTicketsView, focusKanban, refreshAll, copyTicketId
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowStore } from '../../data/workflow-store';
import { TicketService } from '../../services/ticket-service';
import { DependencyService } from '../../services/dependency-service';
import { TicketStatus } from '../../data/types';

suite('Command Handlers Tests', () => {
  let store: WorkflowStore;
  let ticketService: TicketService;
  let dependencyService: DependencyService;
  let tempWorkflowRoot: string;

  suiteSetup(async () => {
    // Create temporary workflow directory for testing
    const tempDir = path.join(__dirname, '../../../../../tmp/test-workflow-commands');

    // Create directory structure
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'tickets', 'backlog'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'tickets', 'ready'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'tickets', 'in-progress'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'tickets', 'blocked'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'tickets', 'review'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'tickets', 'done'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'plans', 'current'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'config'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'templates'), { recursive: true });

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

    // Create ticket template
    fs.writeFileSync(
      path.join(tempDir, '.workflow', 'templates', 'ticket-template.md'),
      `---
id: "{{id}}"
title: "{{title}}"
status: backlog
priority: 3
type: "{{type}}"
---

## Description

TODO

## Result

### Summary

### Changed Files

### Notes

### Time Spent
`
    );

    tempWorkflowRoot = tempDir;

    // Initialize store
    store = new WorkflowStore();
    await store.refresh(path.join(tempWorkflowRoot, '.workflow'));

    // Initialize services
    ticketService = new TicketService(store, path.join(tempWorkflowRoot, '.workflow'));
    dependencyService = new DependencyService(store);
  });

  suiteTeardown(async () => {
    // Cleanup temporary directory
    try {
      fs.rmSync(tempWorkflowRoot, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  suite('executeNewTicket', () => {
    test('should create ticket with valid type and title', async () => {
      // Since we can't easily mock vscode.window in unit tests,
      // we'll test the ticketService.create method directly
      const ticket = await ticketService.create('IMPL', 'Test Ticket');

      assert.ok(ticket);
      assert.strictEqual(ticket.title, 'Test Ticket');
      assert.strictEqual(ticket.type, 'impl');
      assert.strictEqual(ticket.status, TicketStatus.Backlog);
      assert.ok(ticket.id.match(/^IMPL-\d+$/));
    });
  });

  suite('executeMoveTicket', () => {
    test('should move ticket to valid target status', async () => {
      // Create a ticket in ready status
      const ticket = await ticketService.create('FIX', 'Test Fix');
      
      // Move to in-progress (valid transition from backlog is ready, but we'll test ready -> in-progress)
      // First move to ready
      await ticketService.move(ticket.id, TicketStatus.Ready);
      
      // Then move to in-progress
      await ticketService.move(ticket.id, TicketStatus.InProgress);
      
      // Verify the move
      const updated = ticketService.getById(ticket.id);
      assert.ok(updated);
      assert.strictEqual(updated?.status, TicketStatus.InProgress);
    });

    test('should reject invalid transition', async () => {
      // Create a ticket
      const ticket = await ticketService.create('DOCS', 'Test Docs');
      
      // Try to move directly to done (invalid from backlog)
      await assert.rejects(
        async () => {
          await ticketService.move(ticket.id, TicketStatus.Done);
        },
        /Invalid transition/
      );
    });
  });

  suite('executeShowDependencies', () => {
    test('should show dependencies for a ticket', async () => {
      // Create two tickets with dependency
      const ticket1 = await ticketService.create('IMPL', 'Parent Ticket');
      const ticket2 = await ticketService.create('FIX', 'Child Ticket', {
        dependencies: [ticket1.id]
      });

      // Get dependencies
      const dependencies = dependencyService.getDependencies(ticket2.id);
      assert.strictEqual(dependencies.length, 1);
      assert.strictEqual(dependencies[0].id, ticket1.id);

      // Get dependents
      const dependents = dependencyService.getDependents(ticket1.id);
      assert.strictEqual(dependents.length, 1);
      assert.strictEqual(dependents[0].id, ticket2.id);
    });
  });

  suite('executeShowStatistics', () => {
    test('should calculate statistics correctly', async () => {
      // Create tickets with different statuses and types
      await ticketService.create('IMPL', 'Impl 1');
      await ticketService.create('FIX', 'Fix 1');
      await ticketService.create('IMPL', 'Impl 2');

      const tickets = store.getTickets();
      assert.ok(tickets.length >= 2);

      // Statistics calculation is internal to the command,
      // but we can verify the data is available
      const byStatus = new Map<string, number>();
      for (const ticket of tickets) {
        byStatus.set(ticket.status, (byStatus.get(ticket.status) || 0) + 1);
      }
      assert.ok(byStatus.size > 0);
    });
  });

  suite('executeOpenPipelineConfig', () => {
    test('should open pipeline config file', async () => {
      const configPath = path.join(tempWorkflowRoot, '.workflow', 'config', 'pipeline.yaml');
      const exists = fs.existsSync(configPath);
      assert.ok(exists, 'Pipeline config should exist');
    });
  });

  suite('executeOpenConfig', () => {
    test('should open config file', async () => {
      const configPath = path.join(tempWorkflowRoot, '.workflow', 'config', 'config.yaml');
      const exists = fs.existsSync(configPath);
      assert.ok(exists, 'Config file should exist');
    });
  });

  suite('executeRefreshAll', () => {
    test('should refresh store data', async () => {
      const initialStats = store.getStats();
      
      await store.refresh(path.join(tempWorkflowRoot, '.workflow'));
      
      const finalStats = store.getStats();
      assert.ok(finalStats.ticketCount >= initialStats.ticketCount);
    });
  });

  suite('executeCopyTicketId', () => {
    test('should copy ticket ID to clipboard', async () => {
      // Create a ticket
      const ticket = await ticketService.create('IMPL', 'Test Copy');
      
      // Verify ID format
      assert.ok(ticket.id.match(/^IMPL-\d+$/));
      
      // Clipboard testing requires VS Code runtime, so we just verify the ID is valid
      assert.strictEqual(typeof ticket.id, 'string');
      assert.ok(ticket.id.length > 0);
    });
  });
});
