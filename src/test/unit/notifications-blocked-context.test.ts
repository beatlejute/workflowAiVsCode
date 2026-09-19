/**
 * Unit tests for showTicketBlockedNotification with auto_blocked context
 *
 * Tests three scenarios:
 * 1. max_review_attempts: message includes attempts count
 * 2. human_gate_rejected: message includes rejection reason
 * 3. No auto_blocked_reason: backward-compatible message
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { NotificationsManager } from '../../ui/notifications';
import { PipelineService } from '../../services/pipeline-service';
import { TicketStatus, Ticket } from '../../data/types';
import { WorkflowStore } from '../../data/workflow-store';

interface MockTicket extends Ticket {
  id: string;
  status: TicketStatus;
  title: string;
  type: string;
  priority: number;
  dependencies: string[];
  conditions: any[];
  context: any;
  tags: string[];
  complexity: string;
  parent_plan: string;
  parent_task: string;
  created_at: string;
  updated_at: string;
  completed_at: string;
  auto_blocked_reason?: string;
  auto_blocked_attempts?: number;
  auto_blocked_at?: string;
}

interface StoreChangeEvent {
  type: string;
  operation: string;
  id?: string;
}

interface MockStore {
  getTickets: () => MockTicket[];
  getTicketById: (id: string) => MockTicket | undefined;
  getReports: () => unknown[];
  onDidChange: (listener: (e: StoreChangeEvent) => void) => () => void;
  _fireChange: (event: StoreChangeEvent) => void;
  _updateTicket: (id: string, status: TicketStatus) => void;
  eventEmitter: { removeListener: (event: string, listener: any) => void };
}

interface MockPipelineService {
  onStateChange: (listener: (s: any) => void) => { dispose: () => void };
  onManualGateActivated: (listener: (data: { stage: string | undefined; ticketId: string | undefined }) => void) => MockPipelineService;
  removeListener: (event: string, listener: any) => void;
}

function createBaseTicket(id: string, status: TicketStatus): MockTicket {
  return {
    id,
    status,
    title: `Ticket ${id}`,
    type: 'impl',
    priority: 3,
    dependencies: [],
    conditions: [],
    context: { files: [], references: [], notes: '' },
    tags: [],
    complexity: 'low',
    parent_plan: '',
    parent_task: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: ''
  };
}

function createMockStore(tickets: MockTicket[] = [], reports: unknown[] = []): MockStore {
  const changeListeners: ((event: StoreChangeEvent) => void)[] = [];
  const ticketMap = new Map<string, MockTicket>(tickets.map(t => [t.id, t]));

  return {
    getTickets: () => tickets,
    getTicketById: (id: string) => ticketMap.get(id),
    getReports: () => reports,
    onDidChange: (listener: (e: StoreChangeEvent) => void) => {
      changeListeners.push(listener);
      return () => {
        const idx = changeListeners.indexOf(listener);
        if (idx > -1) { changeListeners.splice(idx, 1); }
      };
    },
    _fireChange: (event: StoreChangeEvent) => {
      changeListeners.forEach(l => l(event));
    },
    _updateTicket: (id: string, status: TicketStatus) => {
      const t = ticketMap.get(id);
      if (t) {
        t.status = status;
        ticketMap.set(id, t);
      }
    },
    eventEmitter: {
      removeListener: (event: string, listener: any) => {
        const idx = changeListeners.indexOf(listener);
        if (idx > -1) { changeListeners.splice(idx, 1); }
      }
    }
  };
}

function createMockPipelineService(): MockPipelineService {
  const stateChangeListeners: ((state: any) => void)[] = [];
  const gateActivatedListeners: ((data: { stage: string | undefined; ticketId: string | undefined }) => void)[] = [];
  const service: MockPipelineService = {
    onStateChange: (listener: (s: any) => void) => {
      stateChangeListeners.push(listener);
      return { dispose: () => {} };
    },
    onManualGateActivated: (listener: (data: { stage: string | undefined; ticketId: string | undefined }) => void) => {
      gateActivatedListeners.push(listener);
      return service;
    },
    removeListener: (event: string, listener: any) => {
      if (event === 'stateChange') {
        const idx = stateChangeListeners.indexOf(listener);
        if (idx > -1) { stateChangeListeners.splice(idx, 1); }
      } else if (event === 'manual-gate-activated') {
        const idx = gateActivatedListeners.indexOf(listener);
        if (idx > -1) { gateActivatedListeners.splice(idx, 1); }
      }
    }
  };
  return service;
}

suite('showTicketBlockedNotification - auto_blocked context', () => {
  let store: MockStore;
  let pipelineService: MockPipelineService;
  let shownWarnings: string[];

  setup(() => {
    shownWarnings = [];

    // Patch vscode mock
    const origWarn = vscode.window.showWarningMessage;
    (vscode.window as unknown as Record<string, unknown>)._origWarn = origWarn;

    vscode.window.showWarningMessage = async (msg: string) => {
      shownWarnings.push(msg);
      return undefined;
    };

    store = createMockStore();
    pipelineService = createMockPipelineService();
  });

  teardown(() => {
    const origWarn = (vscode.window as unknown as Record<string, unknown>)._origWarn;
    if (origWarn) {
      vscode.window.showWarningMessage = origWarn as typeof vscode.window.showWarningMessage;
    }
  });

  suite('Scenario 1: max_review_attempts', () => {
    test('shows message with attempts count when auto_blocked_reason is max_review_attempts', async () => {
      const ticket = createBaseTicket('QA-41-SC1', TicketStatus.InProgress);
      ticket.auto_blocked_reason = 'max_review_attempts';
      ticket.auto_blocked_attempts = 6;

      store = createMockStore([ticket]);
      const manager = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
      manager.initialize();

      // Transition to Blocked status
      store._updateTicket('QA-41-SC1', TicketStatus.Blocked);
      store._fireChange({ type: 'ticket', operation: 'update', id: 'QA-41-SC1' });

      // Wait for async notification
      await new Promise(resolve => setTimeout(resolve, 10));

      // Assert: message was shown
      assert.strictEqual(shownWarnings.length, 1, 'Warning should be shown');

      // Assert: message contains ticketId
      assert.ok(shownWarnings[0].includes('QA-41-SC1'), 'Message should contain ticketId');

      // Assert: message contains attempts count
      assert.ok(shownWarnings[0].includes('6'), 'Message should contain attempts count');

      // Assert: message format contains "auto-blocked" and "attempts" (English source keys; localized variants may differ)
      assert.ok(shownWarnings[0].includes('auto-blocked'), 'Message should contain "auto-blocked"');
      assert.ok(shownWarnings[0].includes('attempts') || shownWarnings[0].includes('попыток'), 'Message should contain "attempts" or its localized form');

      manager.dispose();
    });
  });

  suite('Scenario 2: human_gate_rejected', () => {
    test('shows message with rejection reason when auto_blocked_reason is human_gate_rejected', async () => {
      const ticket = createBaseTicket('QA-41-SC2', TicketStatus.InProgress);
      ticket.auto_blocked_reason = 'human_gate_rejected';

      store = createMockStore([ticket]);
      const manager = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
      manager.initialize();

      // Transition to Blocked status
      store._updateTicket('QA-41-SC2', TicketStatus.Blocked);
      store._fireChange({ type: 'ticket', operation: 'update', id: 'QA-41-SC2' });

      // Wait for async notification
      await new Promise(resolve => setTimeout(resolve, 10));

      // Assert: message was shown
      assert.strictEqual(shownWarnings.length, 1, 'Warning should be shown');

      // Assert: message contains ticketId
      assert.ok(shownWarnings[0].includes('QA-41-SC2'), 'Message should contain ticketId');

      // Assert: message contains reason
      assert.ok(shownWarnings[0].includes('human_gate_rejected'), 'Message should contain reason');

      // Assert: message identifies it as a human ticket and rejection (English source keys; localized variants may differ)
      assert.ok(shownWarnings[0].includes('Human') || shownWarnings[0].includes('Человеческий') || shownWarnings[0].includes('Human-тикет'), 'Message should identify it as a human ticket');
      assert.ok(shownWarnings[0].includes('rejected') || shownWarnings[0].includes('отклонён'), 'Message should contain "rejected" or its localized form');

      manager.dispose();
    });
  });

  suite('Scenario 3: no auto_blocked_reason (backward-compatibility)', () => {
    test('shows old format message when auto_blocked_reason is undefined', async () => {
      const ticket = createBaseTicket('QA-41-SC3', TicketStatus.InProgress);
      // Do NOT set auto_blocked_reason

      store = createMockStore([ticket]);
      const manager = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
      manager.initialize();

      // Transition to Blocked status
      store._updateTicket('QA-41-SC3', TicketStatus.Blocked);
      store._fireChange({ type: 'ticket', operation: 'update', id: 'QA-41-SC3' });

      // Wait for async notification
      await new Promise(resolve => setTimeout(resolve, 10));

      // Assert: message was shown
      assert.strictEqual(shownWarnings.length, 1, 'Warning should be shown');

      // Assert: message contains only basic format
      assert.ok(shownWarnings[0].includes('QA-41-SC3'), 'Message should contain ticketId');
      assert.ok(shownWarnings[0].includes('is blocked'), 'Message should contain "is blocked"');

      // Assert: message does NOT contain auto-blocked context
      assert.ok(!shownWarnings[0].includes('auto-blocked'), 'Message should NOT contain "auto-blocked"');
      assert.ok(!shownWarnings[0].includes('Human ticket') && !shownWarnings[0].includes('Человеческий') && !shownWarnings[0].includes('Human-тикет'), 'Message should NOT identify as human ticket');

      manager.dispose();
    });
  });
});
