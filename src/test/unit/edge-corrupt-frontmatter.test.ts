/**
 * Edge case test: Corrupt frontmatter with graceful fallback
 *
 * Tests that when a ticket has malformed frontmatter fields (e.g., auto_blocked_attempts
 * is a string instead of a number), the notification system gracefully handles the error
 * and shows a fallback "Ticket X is blocked" message without crashing the extension.
 *
 * This emulates the scenario from PLAN-025 Task 2:
 * "Когда блокировка вызвана исчерпанием попыток review-result (новые поля frontmatter:
 * auto_blocked_reason, auto_blocked_attempts, auto_blocked_at), сообщение должно содержать
 * причину и счётчик попыток."
 *
 * Edge case: auto_blocked_attempts = "not-a-number" (string instead of number)
 *
 * Requirement: graceful fallback to "Ticket X is blocked", no exception thrown
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { NotificationsManager } from '../../ui/notifications';
import { PipelineService, PipelineState } from '../../services/pipeline-service';
import { TicketStatus } from '../../data/types';
import { WorkflowStore } from '../../data/workflow-store';

interface MockTicket {
  id: string;
  status: TicketStatus;
  title: string;
  type: string;
  priority: number;
  auto_blocked_reason?: string;
  auto_blocked_attempts?: number | string; // Can be malformed (string)
  auto_blocked_at?: string;
}

interface StoreChangeEvent {
  type: string;
  operation: string;
  id?: string;
  ticket?: MockTicket;
}

interface MockStore {
  getTickets: () => MockTicket[];
  getTicketById: (id: string) => MockTicket | undefined;
  getReports: () => unknown[];
  onDidChange: (listener: (e: StoreChangeEvent) => void) => () => void;
  eventEmitter?: { removeListener: (event: string, listener: any) => void };
  _fireChange: (event: StoreChangeEvent) => void;
}

interface MockPipelineService {
  onStateChange: (listener: (s: PipelineState) => void) => () => void;
  onManualGateActivated: (listener: (data: { stage: string | undefined; ticketId: string | undefined }) => void) => () => void;
  removeListener: (event: string, listener: any) => void;
  _fireStateChange: (s: PipelineState) => void;
}

function createMockStore(initialTickets: MockTicket[] = [], reports: unknown[] = []): MockStore {
  const changeListeners: ((event: StoreChangeEvent) => void)[] = [];
  const tickets = [...initialTickets]; // Create mutable copy
  const ticketMap = new Map<string, MockTicket>(tickets.map(t => [t.id, t]));

  return {
    getTickets: () => tickets,
    getTicketById: (id: string) => ticketMap.get(id),
    getReports: () => reports,
    onDidChange: (listener: (e: StoreChangeEvent) => void) => {
      changeListeners.push(listener);
      return () => {};
    },
    eventEmitter: {
      removeListener: (event: string, listener: any) => {
        const idx = changeListeners.indexOf(listener);
        if (idx >= 0) changeListeners.splice(idx, 1);
      }
    },
    _fireChange: (event: StoreChangeEvent) => {
      // Update the ticket in the internal list if it's an update operation
      if (event.operation === 'update' && event.ticket) {
        const idx = tickets.findIndex(t => t.id === event.id);
        if (idx >= 0) {
          tickets[idx] = event.ticket;
          ticketMap.set(event.id!, event.ticket);
        }
      }
      changeListeners.forEach(l => l(event));
    }
  };
}

function createMockPipelineService(): MockPipelineService {
  const stateChangeListeners: ((state: PipelineState) => void)[] = [];
  const gateActivatedListeners: ((data: { stage: string | undefined; ticketId: string | undefined }) => void)[] = [];

  return {
    onStateChange: (listener: (s: PipelineState) => void) => {
      stateChangeListeners.push(listener);
      return () => {};
    },
    onManualGateActivated: (listener: (data: { stage: string | undefined; ticketId: string | undefined }) => void) => {
      gateActivatedListeners.push(listener);
      return () => {};
    },
    removeListener: (event: string, listener: any) => {
      if (event === 'stateChange') {
        const idx = stateChangeListeners.indexOf(listener);
        if (idx >= 0) stateChangeListeners.splice(idx, 1);
      } else if (event === 'manual-gate-activated') {
        const idx = gateActivatedListeners.indexOf(listener);
        if (idx >= 0) gateActivatedListeners.splice(idx, 1);
      }
    },
    _fireStateChange: (s: PipelineState) => {
      stateChangeListeners.forEach(l => l(s));
    }
  };
}

suite('Edge case: Corrupt frontmatter (auto_blocked_attempts as string)', () => {
  let _store: MockStore;
  let pipelineService: MockPipelineService;
  let shownWarnings: Array<{ message: string }> = [];
  let exceptionCaught: Error | null = null;

  setup(() => {
    shownWarnings = [];
    exceptionCaught = null;

    // Patch vscode mock to capture warning messages
    const origWarn = vscode.window.showWarningMessage;
    (vscode.window as unknown as Record<string, unknown>)._origWarn = origWarn;

    vscode.window.showWarningMessage = (async (msg: string, ..._items: string[]) => {
      shownWarnings.push({ message: msg });
      return undefined;
    }) as any;

    _store = createMockStore();
    pipelineService = createMockPipelineService();
  });

  teardown(() => {
    const origWarn = (vscode.window as unknown as Record<string, unknown>)._origWarn;
    if (origWarn) { vscode.window.showWarningMessage = origWarn as typeof vscode.window.showWarningMessage; }
  });

  test('malformed auto_blocked_attempts (string instead of number) shows graceful fallback message', async () => {
    const readyTicket: MockTicket = {
      id: 'BLOCKED-1',
      status: 'ready' as TicketStatus,
      title: 'Test ticket before blocking',
      type: 'impl',
      priority: 1
    };

    const storeWithMutableTickets = createMockStore([readyTicket]);

    const manager = new NotificationsManager(storeWithMutableTickets as any as WorkflowStore, pipelineService as any as PipelineService);
    manager.initialize();

    // Update the ticket in store to blocked with corrupt attempts field
    const corruptBlockedTicket: MockTicket = {
      id: 'BLOCKED-1',
      status: 'blocked' as TicketStatus,
      title: 'Test blocked ticket',
      type: 'impl',
      priority: 1,
      auto_blocked_reason: 'max_review_attempts',
      auto_blocked_attempts: 'not-a-number', // Malformed: should be number
      auto_blocked_at: '2026-04-30T10:00:00Z'
    };

    storeWithMutableTickets._fireChange({
      type: 'ticket',
      operation: 'update',
      id: 'BLOCKED-1',
      ticket: corruptBlockedTicket
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    // Should show warning notification (not crash)
    assert.ok(shownWarnings.length > 0, 'Notification should be shown despite malformed data');

    const message = shownWarnings[0].message;
    // Fallback message should contain "Ticket X is blocked"
    assert.ok(
      message.includes('BLOCKED-1') && message.includes('blocked'),
      `Fallback message should contain ticket ID and status, got: "${message}"`
    );

    manager.dispose();
  });

  test('extension does not crash when processing ticket with corrupt frontmatter', async () => {
    const readyTicket: MockTicket = {
      id: 'BLOCKED-2',
      status: 'ready' as TicketStatus,
      title: 'Another ticket before blocking',
      type: 'impl',
      priority: 1
    };

    const storeWithMutableTickets = createMockStore([readyTicket]);

    const manager = new NotificationsManager(storeWithMutableTickets as any as WorkflowStore, pipelineService as any as PipelineService);

    try {
      manager.initialize();

      const corruptTicket: MockTicket = {
        id: 'BLOCKED-2',
        status: 'blocked' as TicketStatus,
        title: 'Another corrupt ticket',
        type: 'impl',
        priority: 1,
        auto_blocked_reason: 'max_review_attempts',
        auto_blocked_attempts: 'invalid_number', // String instead of number
        auto_blocked_at: '2026-04-30T10:00:00Z'
      };

      storeWithMutableTickets._fireChange({
        type: 'ticket',
        operation: 'update',
        id: 'BLOCKED-2',
        ticket: corruptTicket
      });
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (e) {
      exceptionCaught = e as Error;
    }

    assert.strictEqual(exceptionCaught, null, `No exception should be thrown, but got: ${exceptionCaught?.message}`);
    assert.ok(shownWarnings.length > 0, 'Notification should still be shown');

    manager.dispose();
  });

  test('graceful fallback when auto_blocked_attempts cannot be parsed as number', async () => {
    const readyTicket: MockTicket = {
      id: 'BLOCKED-3',
      status: 'ready' as TicketStatus,
      title: 'Ticket before blocking',
      type: 'qa',
      priority: 2
    };

    const storeWithMutableTickets = createMockStore([readyTicket]);

    const manager = new NotificationsManager(storeWithMutableTickets as any as WorkflowStore, pipelineService as any as PipelineService);
    manager.initialize();

    const corruptTicket: MockTicket = {
      id: 'BLOCKED-3',
      status: 'blocked' as TicketStatus,
      title: 'Corrupt attempts field',
      type: 'qa',
      priority: 2,
      auto_blocked_reason: 'max_review_attempts',
      auto_blocked_attempts: 'NaN', // Cannot be parsed
      auto_blocked_at: '2026-04-30T10:00:00Z'
    };

    storeWithMutableTickets._fireChange({
      type: 'ticket',
      operation: 'update',
      id: 'BLOCKED-3',
      ticket: corruptTicket
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    assert.ok(shownWarnings.length > 0, 'Notification should be shown');
    const message = shownWarnings[0].message;

    // Fallback should show basic "Ticket X is blocked" without attempting to format with corrupt attempts value
    assert.ok(
      message.includes('BLOCKED-3') && (message.includes('blocked') || message.includes('блокирован')),
      `Message should have fallback format, got: "${message}"`
    );

    manager.dispose();
  });

  test('notification shows "Ticket X is blocked" when auto_blocked_attempts is malformed', async () => {
    const readyTicket: MockTicket = {
      id: 'BLOCKED-4',
      status: 'ready' as TicketStatus,
      title: 'Ticket before graceful degradation',
      type: 'impl',
      priority: 1
    };

    const storeWithMutableTickets = createMockStore([readyTicket]);

    const manager = new NotificationsManager(storeWithMutableTickets as any as WorkflowStore, pipelineService as any as PipelineService);
    manager.initialize();

    const corruptTicket: MockTicket = {
      id: 'BLOCKED-4',
      status: 'blocked' as TicketStatus,
      title: 'Test graceful degradation',
      type: 'impl',
      priority: 1,
      auto_blocked_reason: 'max_review_attempts',
      auto_blocked_attempts: 'not_a_valid_number', // Malformed
      auto_blocked_at: '2026-04-30T10:00:00Z'
    };

    storeWithMutableTickets._fireChange({
      type: 'ticket',
      operation: 'update',
      id: 'BLOCKED-4',
      ticket: corruptTicket
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    assert.strictEqual(shownWarnings.length, 1, 'Exactly one notification should be shown');

    const message = shownWarnings[0].message;
    // Should contain ticket ID and indicate blocked status
    assert.ok(message.includes('BLOCKED-4'), 'Message should contain ticket ID');
    assert.ok(
      message.includes('blocked') || message.includes('блокирован') || message.includes('Ticket'),
      'Message should indicate blocked status'
    );

    manager.dispose();
  });
});
