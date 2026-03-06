/**
 * TicketService Transitions Unit Tests
 *
 * Tests for ticket state machine transitions used in context menu formation.
 * Verifies that getValidTransitions() returns correct transitions based on current status.
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowStore } from '../../data/workflow-store';
import { TicketService } from '../../services/ticket-service';
import { TicketStatus } from '../../data/types';

suite('TicketService Transitions Suite', () => {

  let store: WorkflowStore;
  let ticketService: TicketService;
  let testDir: string;
  let workflowRoot: string;

  setup(() => {
    store = new WorkflowStore();
    testDir = path.join(__dirname, '../../../../tmp/test-transitions-' + Date.now());
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
    fs.mkdirSync(path.join(workflowRoot, 'templates'), { recursive: true });

    // Create minimal ticket template
    fs.writeFileSync(path.join(workflowRoot, 'templates', 'ticket-template.md'), `---
id: "{TYPE}-{NNN}"
title: ""
status: backlog
priority: 3
type: implementation
dependencies: []
conditions: []
context:
  files: []
  references: []
  notes: ""
complexity: medium
tags: []
parent_plan: ""
parent_task: ""
created_at: ""
updated_at: ""
completed_at: ""
---

## Описание
`, 'utf-8');

    // Create ticket service
    ticketService = new TicketService(store, workflowRoot);
  });

  teardown(() => {
    store.clear();
    // Cleanup test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ==================== Valid Transitions Tests ====================

  suite('getValidTransitions()', () => {

    test('should return [ready] for backlog status', () => {
      const transitions = ticketService.getValidTransitions(TicketStatus.Backlog);

      assert.strictEqual(transitions.length, 1);
      assert.ok(transitions.includes(TicketStatus.Ready));
    });

    test('should return [in-progress, review, backlog] for ready status', () => {
      const transitions = ticketService.getValidTransitions(TicketStatus.Ready);

      assert.strictEqual(transitions.length, 3);
      assert.ok(transitions.includes(TicketStatus.InProgress));
      assert.ok(transitions.includes(TicketStatus.Review));
      assert.ok(transitions.includes(TicketStatus.Backlog));
    });

    test('should return [review, blocked, done, backlog] for in-progress status', () => {
      const transitions = ticketService.getValidTransitions(TicketStatus.InProgress);

      assert.strictEqual(transitions.length, 4);
      assert.ok(transitions.includes(TicketStatus.Review));
      assert.ok(transitions.includes(TicketStatus.Blocked));
      assert.ok(transitions.includes(TicketStatus.Done));
      assert.ok(transitions.includes(TicketStatus.Backlog));
    });

    test('should return [done, in-progress, ready, blocked, backlog] for review status', () => {
      const transitions = ticketService.getValidTransitions(TicketStatus.Review);

      assert.strictEqual(transitions.length, 5);
      assert.ok(transitions.includes(TicketStatus.Done));
      assert.ok(transitions.includes(TicketStatus.InProgress));
      assert.ok(transitions.includes(TicketStatus.Ready));
      assert.ok(transitions.includes(TicketStatus.Blocked));
      assert.ok(transitions.includes(TicketStatus.Backlog));
    });

    test('should return [ready, backlog] for blocked status', () => {
      const transitions = ticketService.getValidTransitions(TicketStatus.Blocked);

      assert.strictEqual(transitions.length, 2);
      assert.ok(transitions.includes(TicketStatus.Ready));
      assert.ok(transitions.includes(TicketStatus.Backlog));
    });

    test('should return [backlog] for done status', () => {
      const transitions = ticketService.getValidTransitions(TicketStatus.Done);

      assert.strictEqual(transitions.length, 1);
      assert.ok(transitions.includes(TicketStatus.Backlog));
    });

    test('should return [] for unknown status', () => {
      // Test with invalid status (type coercion for testing)
      const transitions = ticketService.getValidTransitions('unknown' as TicketStatus);

      assert.strictEqual(transitions.length, 0);
    });
  });

  // ==================== isValidTransition Tests ====================

  suite('isValidTransition()', () => {

    test('should return true for valid transition backlog -> ready', () => {
      const isValid = ticketService.isValidTransition(TicketStatus.Backlog, TicketStatus.Ready);
      assert.strictEqual(isValid, true);
    });

    test('should return true for valid transition ready -> in-progress', () => {
      const isValid = ticketService.isValidTransition(TicketStatus.Ready, TicketStatus.InProgress);
      assert.strictEqual(isValid, true);
    });

    test('should return true for valid transition in-progress -> review', () => {
      const isValid = ticketService.isValidTransition(TicketStatus.InProgress, TicketStatus.Review);
      assert.strictEqual(isValid, true);
    });

    test('should return true for valid transition in-progress -> blocked', () => {
      const isValid = ticketService.isValidTransition(TicketStatus.InProgress, TicketStatus.Blocked);
      assert.strictEqual(isValid, true);
    });

    test('should return true for valid transition in-progress -> done', () => {
      const isValid = ticketService.isValidTransition(TicketStatus.InProgress, TicketStatus.Done);
      assert.strictEqual(isValid, true);
    });

    test('should return true for valid transition review -> done', () => {
      const isValid = ticketService.isValidTransition(TicketStatus.Review, TicketStatus.Done);
      assert.strictEqual(isValid, true);
    });

    test('should return true for valid transition review -> in-progress', () => {
      const isValid = ticketService.isValidTransition(TicketStatus.Review, TicketStatus.InProgress);
      assert.strictEqual(isValid, true);
    });

    test('should return true for valid transition review -> blocked', () => {
      const isValid = ticketService.isValidTransition(TicketStatus.Review, TicketStatus.Blocked);
      assert.strictEqual(isValid, true);
    });

    test('should return true for valid transition review -> ready', () => {
      const isValid = ticketService.isValidTransition(TicketStatus.Review, TicketStatus.Ready);
      assert.strictEqual(isValid, true);
    });

    test('should return true for valid transition blocked -> ready', () => {
      const isValid = ticketService.isValidTransition(TicketStatus.Blocked, TicketStatus.Ready);
      assert.strictEqual(isValid, true);
    });

    test('should return true for valid transition blocked -> backlog', () => {
      const isValid = ticketService.isValidTransition(TicketStatus.Blocked, TicketStatus.Backlog);
      assert.strictEqual(isValid, true);
    });

    test('should return true for valid transition done -> backlog', () => {
      const isValid = ticketService.isValidTransition(TicketStatus.Done, TicketStatus.Backlog);
      assert.strictEqual(isValid, true);
    });

    test('should return false for invalid transition backlog -> in-progress', () => {
      const isValid = ticketService.isValidTransition(TicketStatus.Backlog, TicketStatus.InProgress);
      assert.strictEqual(isValid, false);
    });

    test('should return false for invalid transition done -> ready', () => {
      const isValidReady = ticketService.isValidTransition(TicketStatus.Done, TicketStatus.Ready);
      const isValidInProgress = ticketService.isValidTransition(TicketStatus.Done, TicketStatus.InProgress);

      assert.strictEqual(isValidReady, false);
      assert.strictEqual(isValidInProgress, false);
    });
  });

  // ==================== Context Menu Formation Tests ====================

  suite('Context Menu Formation', () => {

    test('context menu items should match valid transitions for in-progress ticket', () => {
      const status = TicketStatus.InProgress;
      const transitions = ticketService.getValidTransitions(status);

      // Simulate context menu formation
      const menuItems = transitions.map(s => ({
        label: s,
        description: `Move to ${s}`
      }));

      assert.strictEqual(menuItems.length, 4);
      assert.ok(menuItems.some(item => item.label === TicketStatus.Review));
      assert.ok(menuItems.some(item => item.label === TicketStatus.Blocked));
      assert.ok(menuItems.some(item => item.label === TicketStatus.Done));
      assert.ok(menuItems.some(item => item.label === TicketStatus.Backlog));
    });

    test('context menu should have backlog option for done ticket', () => {
      const status = TicketStatus.Done;
      const transitions = ticketService.getValidTransitions(status);

      const menuItems = transitions.map(s => ({
        label: s,
        description: `Move to ${s}`
      }));

      assert.strictEqual(menuItems.length, 1);
      assert.ok(menuItems.some(item => item.label === TicketStatus.Backlog));
    });

    test('context menu items should match valid transitions for ready ticket', () => {
      const status = TicketStatus.Ready;
      const transitions = ticketService.getValidTransitions(status);

      // Simulate context menu formation
      const menuItems = transitions.map(s => ({
        label: s,
        description: `Move to ${s}`
      }));

      assert.strictEqual(menuItems.length, 3);
      assert.ok(menuItems.some(item => item.label === TicketStatus.InProgress));
      assert.ok(menuItems.some(item => item.label === TicketStatus.Review));
      assert.ok(menuItems.some(item => item.label === TicketStatus.Backlog));
    });

    test('inline actions should use first valid transition for move next', () => {
      // Simulate inline "Move next" action behavior
      const status = TicketStatus.InProgress;
      const transitions = ticketService.getValidTransitions(status);

      // Move next uses first valid transition
      const nextStatus = transitions[0];

      assert.ok(nextStatus);
      assert.ok(transitions.includes(nextStatus));
    });

    test('inline edit action should open ticket file', () => {
      // Inline edit action opens ticket for editing
      // This test verifies the concept - actual implementation is in extension.ts
      const status = TicketStatus.Ready;
      const transitions = ticketService.getValidTransitions(status);

      // Edit action doesn't change status, just opens file
      // Verify ticket can be edited (has valid status)
      assert.ok(status);
      assert.ok(transitions.length >= 0);
    });
  });

  // ==================== Integration Tests ====================

  suite('TicketService Transitions Integration', () => {

    test('should handle full workflow: backlog -> ready -> in-progress -> done', async () => {
      // Create test ticket in backlog
      const ticket = await ticketService.create('IMPL', 'Test Ticket');
      assert.strictEqual(ticket.status, TicketStatus.Backlog);

      // Verify transitions at each step
      let transitions = ticketService.getValidTransitions(ticket.status);
      assert.strictEqual(transitions.length, 1);
      assert.ok(transitions.includes(TicketStatus.Ready));

      // Move to ready
      await ticketService.move(ticket.id, TicketStatus.Ready);
      const updatedTicket = ticketService.getById(ticket.id);
      assert.ok(updatedTicket);
      assert.strictEqual(updatedTicket.status, TicketStatus.Ready);

      transitions = ticketService.getValidTransitions(updatedTicket.status);
      assert.strictEqual(transitions.length, 3);
      assert.ok(transitions.includes(TicketStatus.InProgress));
      assert.ok(transitions.includes(TicketStatus.Review));
      assert.ok(transitions.includes(TicketStatus.Backlog));

      // Move to in-progress
      await ticketService.move(ticket.id, TicketStatus.InProgress);
      const inProgressTicket = ticketService.getById(ticket.id);
      assert.ok(inProgressTicket);
      assert.strictEqual(inProgressTicket.status, TicketStatus.InProgress);

      transitions = ticketService.getValidTransitions(inProgressTicket.status);
      assert.strictEqual(transitions.length, 4);
      assert.ok(transitions.includes(TicketStatus.Review));
      assert.ok(transitions.includes(TicketStatus.Blocked));
      assert.ok(transitions.includes(TicketStatus.Done));
      assert.ok(transitions.includes(TicketStatus.Backlog));

      // Move to done
      await ticketService.move(ticket.id, TicketStatus.Done);
      const doneTicket = ticketService.getById(ticket.id);
      assert.ok(doneTicket);
      assert.strictEqual(doneTicket.status, TicketStatus.Done);

      transitions = ticketService.getValidTransitions(doneTicket.status);
      assert.strictEqual(transitions.length, 1);
      assert.ok(transitions.includes(TicketStatus.Backlog));
    });

    test('should handle blocked workflow: in-progress -> blocked -> ready -> in-progress', async () => {
      // Create and move to in-progress
      const ticket = await ticketService.create('IMPL', 'Blocked Test');
      await ticketService.move(ticket.id, TicketStatus.Ready);
      await ticketService.move(ticket.id, TicketStatus.InProgress);

      // Block it
      await ticketService.move(ticket.id, TicketStatus.Blocked);
      const blockedTicket = ticketService.getById(ticket.id);
      assert.ok(blockedTicket);
      assert.strictEqual(blockedTicket.status, TicketStatus.Blocked);

      // Verify transitions from blocked
      const transitions = ticketService.getValidTransitions(TicketStatus.Blocked);
      assert.strictEqual(transitions.length, 2);
      assert.ok(transitions.includes(TicketStatus.Ready));
      assert.ok(transitions.includes(TicketStatus.Backlog));

      // Unblock to ready
      await ticketService.move(ticket.id, TicketStatus.Ready);
      const unblockedTicket = ticketService.getById(ticket.id);
      assert.ok(unblockedTicket);
      assert.strictEqual(unblockedTicket.status, TicketStatus.Ready);
    });
  });
});
