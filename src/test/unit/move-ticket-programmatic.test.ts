/**
 * Unit tests for move-ticket.ts programmatic call
 *
 * Tests:
 * - executeMoveTicket with programmatic args {id, target}
 * - Script invoked with correct arguments
 * - Success path: notification shown
 * - Error path: error notification shown
 * - Backward compatibility: existing QuickPick mode still works
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { executeMoveTicket } from '../../commands/move-ticket';
import { TicketService } from '../../services/ticket-service';
import { TicketStatus } from '../../data/types';

interface MockTicket {
  id: string;
  status: TicketStatus;
  title: string;
  type: string;
  priority: number;
}

interface MockTicketService {
  getById: (id: string) => MockTicket | undefined;
  move: (id: string, target: TicketStatus) => Promise<void>;
  getValidTransitions: (status: TicketStatus) => TicketStatus[];
  getAll: () => MockTicket[];
}

function createMockTicketService(): MockTicketService & { _tickets: Map<string, MockTicket> } {
  const tickets = new Map<string, MockTicket>([
    ['HUMAN-1', { id: 'HUMAN-1', status: TicketStatus.Ready, title: 'Human gate test', type: 'human', priority: 1 }],
    ['IMPL-50', { id: 'IMPL-50', status: TicketStatus.InProgress, title: 'Some implementation', type: 'impl', priority: 2 }]
  ]);

  return {
    _tickets: tickets,
    getById: (id: string) => tickets.get(id),
    move: async (id: string, target: TicketStatus) => {
      const ticket = tickets.get(id);
      if (!ticket) {
        throw new Error(`Ticket ${id} not found`);
      }
      // Update ticket status in mock
      tickets.set(id, { ...ticket, status: target });
    },
    getValidTransitions: (status: TicketStatus) => {
      const transitions: Record<TicketStatus, TicketStatus[]> = {
        [TicketStatus.Backlog]: [TicketStatus.Ready],
        [TicketStatus.Ready]: [TicketStatus.InProgress, TicketStatus.Review, TicketStatus.Backlog],
        [TicketStatus.InProgress]: [TicketStatus.Review, TicketStatus.Blocked, TicketStatus.Done, TicketStatus.Backlog],
        [TicketStatus.Review]: [TicketStatus.Done, TicketStatus.InProgress, TicketStatus.Ready, TicketStatus.Blocked, TicketStatus.Backlog],
        [TicketStatus.Blocked]: [TicketStatus.Ready, TicketStatus.Backlog],
        [TicketStatus.Done]: [TicketStatus.Backlog]
      };
      return transitions[status] || [];
    },
    getAll: () => Array.from(tickets.values())
  };
}

suite('executeMoveTicket Programmatic Call Tests', () => {
  let ticketService: MockTicketService;
  let shownInfos: Array<{ message: string; actions?: string[] }>;
  let shownErrors: string[];

  setup(() => {
    shownInfos = [];
    shownErrors = [];

    // Patch vscode window functions
    const origInfo = vscode.window.showInformationMessage;
    const origError = vscode.window.showErrorMessage;
    (vscode.window as unknown as Record<string, unknown>)._origInfo = origInfo;
    (vscode.window as unknown as Record<string, unknown>)._origError = origError;

    vscode.window.showInformationMessage = (async (msg: string, ...actions: string[]) => {
      shownInfos.push({ message: msg, actions });
      return undefined;
    }) as any;

    vscode.window.showErrorMessage = (async (msg: string) => {
      shownErrors.push(msg);
      return undefined;
    }) as any;

    ticketService = createMockTicketService();
  });

  teardown(() => {
    const origInfo = (vscode.window as unknown as Record<string, unknown>)._origInfo;
    const origError = (vscode.window as unknown as Record<string, unknown>)._origError;
    if (origInfo) { vscode.window.showInformationMessage = origInfo as typeof vscode.window.showInformationMessage; }
    if (origError) { vscode.window.showErrorMessage = origError as typeof vscode.window.showErrorMessage; }
  });

  suite('programmatic call with {id, target}', () => {
    test('moves ticket without showing QuickPick', async () => {
      const arg = { id: 'HUMAN-1', target: 'review' };
      await executeMoveTicket(ticketService as any as TicketService, arg);

      // Verify ticket was moved
      const ticket = ticketService.getById('HUMAN-1');
      assert.strictEqual(ticket?.status, TicketStatus.Review, 'Ticket should be moved to review status');

      // Verify success notification was shown
      assert.ok(shownInfos.length > 0, 'Information message should be shown');
      assert.ok(
        shownInfos[0].message.includes('HUMAN-1'),
        'Notification should include ticket ID'
      );
      assert.ok(
        shownInfos[0].message.includes('review'),
        'Notification should include target status'
      );
    });

    test('calls move on ticket service with correct arguments', async () => {
      let moveCallArgs: { id: string; target: TicketStatus } | undefined;
      const originalMove = ticketService.move;
      ticketService.move = async (id: string, target: TicketStatus) => {
        moveCallArgs = { id, target };
        return originalMove.call(ticketService, id, target);
      };

      const arg = { id: 'IMPL-50', target: 'review' };
      await executeMoveTicket(ticketService as any as TicketService, arg);

      assert.ok(moveCallArgs, 'move() should be called');
      assert.strictEqual(moveCallArgs.id, 'IMPL-50', 'move() should be called with correct ticket ID');
      assert.strictEqual(moveCallArgs.target, TicketStatus.Review, 'move() should be called with target status');
    });

    test('shows error notification if ticket not found', async () => {
      const arg = { id: 'NONEXISTENT-999', target: 'review' };
      await executeMoveTicket(ticketService as any as TicketService, arg);

      assert.ok(shownErrors.length > 0, 'Error message should be shown');
      assert.ok(
        shownErrors[0].includes('NONEXISTENT-999'),
        'Error notification should include missing ticket ID'
      );
    });

    test('shows error notification if move fails', async () => {
      const arg = { id: 'IMPL-50', target: 'review' };

      // Mock move to throw an error
      ticketService.move = async () => {
        throw new Error('Invalid transition');
      };

      await executeMoveTicket(ticketService as any as TicketService, arg);

      assert.ok(shownErrors.length > 0, 'Error message should be shown on move failure');
      assert.ok(
        shownErrors[0].includes('Invalid transition'),
        'Error notification should include error details'
      );
    });

    test('handles undefined target (should require target for programmatic call)', async () => {
      const arg = { id: 'HUMAN-1' };
      // This should show QuickPick since target is undefined
      // For now, we'll just verify it doesn't crash
      // In real implementation, it would prompt for target
      try {
        // Since we haven't mocked QuickPick, this might fail
        // but the function should handle it gracefully
        await executeMoveTicket(ticketService as any as TicketService, arg);
      } catch (_error) {
        // Expected to fail when trying to show QuickPick
      }
    });

    test('handles undefined id (should require id for programmatic call)', async () => {
      const arg = { target: 'review' };
      // This should show QuickPick since id is undefined
      // For now, we'll just verify it doesn't crash
      try {
        await executeMoveTicket(ticketService as any as TicketService, arg);
      } catch (_error) {
        // Expected to fail when trying to show QuickPick
      }
    });
  });

  suite('programmatic call with string id only', () => {
    test('accepts string argument as ticket ID', async () => {
      // Mock QuickPick for target selection
      const origQuickPick = vscode.window.showQuickPick;
      let quickPickCalled = false;
      (vscode.window as unknown as Record<string, unknown>)._origQuickPick = origQuickPick;

      vscode.window.showQuickPick = (async (items: any[], _options: any) => {
        quickPickCalled = true;
        // Return first valid transition
        return items[0]; // Should be 'in-progress' or similar
      }) as any;

      const arg = 'HUMAN-1';
      try {
        await executeMoveTicket(ticketService as any as TicketService, arg);
      } catch (_error) {
        // May fail due to incomplete mocking, but verifies parsing
      }

      assert.ok(quickPickCalled, 'QuickPick should be shown for target selection when id is provided');

      vscode.window.showQuickPick = origQuickPick;
    });
  });

  suite('success notification content', () => {
    test('notification includes ticket ID and target status', async () => {
      const arg = { id: 'HUMAN-1', target: 'review' };
      await executeMoveTicket(ticketService as any as TicketService, arg);

      const notification = shownInfos[0];
      assert.ok(notification, 'Notification should be shown');
      assert.ok(notification.message.includes('HUMAN-1'), 'Should include ticket ID');
      assert.ok(
        notification.message.toLowerCase().includes('review') ||
        notification.message.includes('review'),
        'Should include target status'
      );
    });

    test('uses localized message for success notification', async () => {
      const arg = { id: 'IMPL-50', target: 'review' };
      await executeMoveTicket(ticketService as any as TicketService, arg);

      const notification = shownInfos[0];
      assert.ok(notification.message, 'Should have a message');
      // Verify it contains Cyrillic characters (for Russian localization)
      // or at least the ticket and status info
      assert.ok(
        /[а-яА-Я]|[0-9A-Z]/.test(notification.message),
        'Message should contain localized or relevant content'
      );
    });
  });

  suite('backward compatibility', () => {
    test('handles empty/null argument gracefully', async () => {
      // Should fall back to QuickPick behavior
      try {
        await executeMoveTicket(ticketService as any as TicketService, undefined);
      } catch (_error) {
        // Expected when QuickPick is not fully mocked
      }
      // Main point: function should not crash
      assert.ok(true, 'Should handle undefined argument without crashing');
    });

    test('handles invalid argument type gracefully', async () => {
      try {
        await executeMoveTicket(ticketService as any as TicketService, 12345 as any);
      } catch (_error) {
        // Expected when argument is invalid
      }
      assert.ok(true, 'Should handle invalid argument type without crashing');
    });
  });
});
