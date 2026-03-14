/**
 * Unit tests for show-statistics command handler
 *
 * Tests:
 * - executeShowStatistics: calculate and display statistics by status, type, priority
 * - Happy path: show statistics with ASCII bars
 * - Error path: no tickets to analyze
 * - User cancellation
 * - Helper functions: calculateByStatus, calculateByType, calculateByPriority, buildAsciiBars
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { executeShowStatistics } from '../../commands/show-statistics';
import { WorkflowStore } from '../../data/workflow-store';
import { TicketStatus } from '../../data/types';

suite('executeShowStatistics Command Tests', () => {
  let store: WorkflowStore;
  let getTicketsStub: sinon.SinonStub;
  let showQuickPickStub: sinon.SinonStub;
  let showInformationMessageStub: sinon.SinonStub;
  let writeTextStub: sinon.SinonStub;

  setup(() => {
    // Create mock store
    getTicketsStub = sinon.stub();

    store = {
      getTickets: getTicketsStub
    } as unknown as WorkflowStore;

    // Stub vscode methods
    showQuickPickStub = sinon.stub(vscode.window, 'showQuickPick');
    showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
    writeTextStub = sinon.stub(vscode.env.clipboard, 'writeText').resolves();
  });

  teardown(() => {
    sinon.restore();
  });

  suite('Happy Path', () => {
    test('should show statistics when tickets are available', async () => {
      // Arrange
      const tickets = [
        { id: 'IMPL-001', title: 'Task 1', status: TicketStatus.Backlog, type: 'impl', priority: 2 },
        { id: 'FIX-001', title: 'Fix 1', status: TicketStatus.Ready, type: 'fix', priority: 3 },
        { id: 'IMPL-002', title: 'Task 2', status: TicketStatus.InProgress, type: 'impl', priority: 1 }
      ];
      getTicketsStub.returns(tickets);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowStatistics(store);

      // Assert
      assert.ok(showQuickPickStub.calledOnce);
      const items = showQuickPickStub.firstCall.args[0];
      assert.ok(items.length > 0);
      const mainItem = items[0];
      assert.ok(mainItem.label?.includes('Statistics'));
      assert.ok(mainItem.detail?.includes('Total Tickets'));
    });

    test('should calculate statistics by status correctly', async () => {
      // Arrange
      const tickets = [
        { id: 'IMPL-001', status: TicketStatus.Backlog, type: 'impl', priority: 2 },
        { id: 'IMPL-002', status: TicketStatus.Backlog, type: 'impl', priority: 3 },
        { id: 'FIX-001', status: TicketStatus.Ready, type: 'fix', priority: 3 },
        { id: 'DOCS-001', status: TicketStatus.Done, type: 'docs', priority: 4 }
      ];
      getTicketsStub.returns(tickets);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowStatistics(store);

      // Assert
      const items = showQuickPickStub.firstCall.args[0];
      const detail = items[0].detail;
      assert.ok(detail?.includes('backlog'));
      assert.ok(detail?.includes('ready'));
      assert.ok(detail?.includes('done'));
      // Backlog should have 2 tickets
      assert.ok(detail?.includes('2'));
    });

    test('should calculate statistics by type correctly', async () => {
      // Arrange
      const tickets = [
        { id: 'IMPL-001', status: TicketStatus.Backlog, type: 'impl', priority: 2 },
        { id: 'IMPL-002', status: TicketStatus.Ready, type: 'impl', priority: 3 },
        { id: 'FIX-001', status: TicketStatus.InProgress, type: 'fix', priority: 3 },
        { id: 'DOCS-001', status: TicketStatus.Done, type: 'docs', priority: 4 }
      ];
      getTicketsStub.returns(tickets);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowStatistics(store);

      // Assert
      const items = showQuickPickStub.firstCall.args[0];
      const detail = items[0].detail;
      assert.ok(detail?.includes('IMPL'));
      assert.ok(detail?.includes('FIX'));
      assert.ok(detail?.includes('DOCS'));
    });

    test('should calculate statistics by priority correctly', async () => {
      // Arrange
      const tickets = [
        { id: 'IMPL-001', status: TicketStatus.Backlog, type: 'impl', priority: 1 },
        { id: 'IMPL-002', status: TicketStatus.Ready, type: 'impl', priority: 1 },
        { id: 'FIX-001', status: TicketStatus.InProgress, type: 'fix', priority: 3 },
        { id: 'DOCS-001', status: TicketStatus.Done, type: 'docs', priority: 5 }
      ];
      getTicketsStub.returns(tickets);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowStatistics(store);

      // Assert
      const items = showQuickPickStub.firstCall.args[0];
      const detail = items[0].detail;
      assert.ok(detail?.includes('1'));
      assert.ok(detail?.includes('3'));
      assert.ok(detail?.includes('5'));
    });

    test('should display ASCII bar chart', async () => {
      // Arrange
      const tickets = [
        { id: 'IMPL-001', status: TicketStatus.Backlog, type: 'impl', priority: 2 },
        { id: 'IMPL-002', status: TicketStatus.Backlog, type: 'impl', priority: 3 },
        { id: 'FIX-001', status: TicketStatus.Ready, type: 'fix', priority: 3 }
      ];
      getTicketsStub.returns(tickets);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowStatistics(store);

      // Assert
      const items = showQuickPickStub.firstCall.args[0];
      const detail = items[0].detail;
      assert.ok(detail?.includes('█'));
      assert.ok(detail?.includes('░'));
      assert.ok(detail?.includes('%'));
    });

    test('should offer to copy statistics to clipboard', async () => {
      // Arrange
      const tickets = [
        { id: 'IMPL-001', status: TicketStatus.Backlog, type: 'impl', priority: 2 }
      ];
      getTicketsStub.returns(tickets);
      showQuickPickStub.resolves(undefined);
      showInformationMessageStub.resolves('Copy');

      // Act
      await executeShowStatistics(store);

      // Assert
      assert.ok(showInformationMessageStub.calledWithMatch(/copy.*clipboard/i));
      assert.ok(writeTextStub.calledOnce);
    });

    test('should not copy to clipboard when user declines', async () => {
      // Arrange
      const tickets = [
        { id: 'IMPL-001', status: TicketStatus.Backlog, type: 'impl', priority: 2 }
      ];
      getTicketsStub.returns(tickets);
      showQuickPickStub.resolves(undefined);
      showInformationMessageStub.resolves(undefined);

      // Act
      await executeShowStatistics(store);

      // Assert
      assert.ok(writeTextStub.notCalled);
    });
  });

  suite('User Cancellation', () => {
    test('should not copy to clipboard when user cancels statistics view', async () => {
      // Note: source always asks about clipboard after showQuickPick, even when cancelled.
      // The meaningful assertion is that writeText is not called when user dismisses both prompts.
      // Arrange
      const tickets = [
        { id: 'IMPL-001', status: TicketStatus.Backlog, type: 'impl', priority: 2 }
      ];
      getTicketsStub.returns(tickets);
      showQuickPickStub.resolves(undefined);
      showInformationMessageStub.resolves(undefined);

      // Act
      await executeShowStatistics(store);

      // Assert
      assert.ok(writeTextStub.notCalled);
    });
  });

  suite('Error Handling', () => {
    test('should show info message when no tickets available', async () => {
      // Arrange
      getTicketsStub.returns([]);

      // Act
      await executeShowStatistics(store);

      // Assert
      assert.ok(showInformationMessageStub.calledWithMatch(/no tickets to analyze/i));
      assert.ok(showQuickPickStub.notCalled);
    });
  });

  suite('QuickPick Configuration', () => {
    test('should show QuickPick with correct options', async () => {
      // Arrange
      const tickets = [
        { id: 'IMPL-001', status: TicketStatus.Backlog, type: 'impl', priority: 2 }
      ];
      getTicketsStub.returns(tickets);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowStatistics(store);

      // Assert
      assert.ok(showQuickPickStub.calledOnce);
      const options = showQuickPickStub.firstCall.args[1];
      assert.strictEqual(options?.placeHolder, 'Statistics');
      assert.strictEqual(options?.title, 'Statistics');
      assert.strictEqual(options?.matchOnDescription, false);
      assert.strictEqual(options?.matchOnDetail, false);
    });

    test('should create QuickPick item with statistics summary', async () => {
      // Arrange
      const tickets = [
        { id: 'IMPL-001', status: TicketStatus.Backlog, type: 'impl', priority: 2 }
      ];
      getTicketsStub.returns(tickets);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowStatistics(store);

      // Assert
      const items = showQuickPickStub.firstCall.args[0];
      assert.strictEqual(items.length, 1);
      assert.ok(items[0].label?.includes('$(graph)'));
      assert.ok(items[0].label?.includes('Statistics Summary'));
    });
  });

  suite('Statistics Content', () => {
    test('should include total ticket count', async () => {
      // Arrange
      const tickets = [
        { id: 'IMPL-001', status: TicketStatus.Backlog, type: 'impl', priority: 2 },
        { id: 'IMPL-002', status: TicketStatus.Ready, type: 'impl', priority: 3 },
        { id: 'FIX-001', status: TicketStatus.InProgress, type: 'fix', priority: 3 }
      ];
      getTicketsStub.returns(tickets);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowStatistics(store);

      // Assert
      const items = showQuickPickStub.firstCall.args[0];
      const detail = items[0].detail;
      assert.ok(detail?.includes('Total Tickets: 3'));
    });

    test('should include By Status section', async () => {
      // Arrange
      const tickets = [
        { id: 'IMPL-001', status: TicketStatus.Backlog, type: 'impl', priority: 2 }
      ];
      getTicketsStub.returns(tickets);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowStatistics(store);

      // Assert
      const items = showQuickPickStub.firstCall.args[0];
      const detail = items[0].detail;
      assert.ok(detail?.includes('By Status'));
    });

    test('should include By Type section', async () => {
      // Arrange
      const tickets = [
        { id: 'IMPL-001', status: TicketStatus.Backlog, type: 'impl', priority: 2 }
      ];
      getTicketsStub.returns(tickets);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowStatistics(store);

      // Assert
      const items = showQuickPickStub.firstCall.args[0];
      const detail = items[0].detail;
      assert.ok(detail?.includes('By Type'));
    });

    test('should include By Priority section', async () => {
      // Arrange
      const tickets = [
        { id: 'IMPL-001', status: TicketStatus.Backlog, type: 'impl', priority: 2 }
      ];
      getTicketsStub.returns(tickets);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowStatistics(store);

      // Assert
      const items = showQuickPickStub.firstCall.args[0];
      const detail = items[0].detail;
      assert.ok(detail?.includes('By Priority'));
    });

    test('should include percentage in bar chart', async () => {
      // Arrange
      const tickets = [
        { id: 'IMPL-001', status: TicketStatus.Backlog, type: 'impl', priority: 2 },
        { id: 'IMPL-002', status: TicketStatus.Backlog, type: 'impl', priority: 3 }
      ];
      getTicketsStub.returns(tickets);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowStatistics(store);

      // Assert
      const items = showQuickPickStub.firstCall.args[0];
      const detail = items[0].detail;
      assert.ok(detail?.includes('100%') || detail?.includes('50%') || detail?.includes('0%'));
    });
  });

  suite('Clipboard Integration', () => {
    test('should copy statistics to clipboard when user confirms', async () => {
      // Arrange
      const tickets = [
        { id: 'IMPL-001', status: TicketStatus.Backlog, type: 'impl', priority: 2 }
      ];
      getTicketsStub.returns(tickets);
      showQuickPickStub.resolves(undefined);
      showInformationMessageStub.resolves('Copy');

      // Act
      await executeShowStatistics(store);

      // Assert
      assert.ok(writeTextStub.calledOnce);
      const copiedText = writeTextStub.firstCall.args[0];
      assert.ok(copiedText.includes('Statistics'));
      assert.ok(copiedText.includes('Total Tickets'));
    });

    test('should show confirmation after copying', async () => {
      // Arrange
      const tickets = [
        { id: 'IMPL-001', status: TicketStatus.Backlog, type: 'impl', priority: 2 }
      ];
      getTicketsStub.returns(tickets);
      showQuickPickStub.resolves(undefined);
      showInformationMessageStub.resolves('Copy');

      // Act
      await executeShowStatistics(store);

      // Assert
      const copyCall = showInformationMessageStub.getCalls().find(call =>
        call.args[0]?.includes('copied to clipboard')
      );
      assert.ok(copyCall);
    });
  });

  suite('Edge Cases', () => {
    test('should handle single ticket', async () => {
      // Arrange
      const tickets = [
        { id: 'IMPL-001', status: TicketStatus.Backlog, type: 'impl', priority: 2 }
      ];
      getTicketsStub.returns(tickets);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowStatistics(store);

      // Assert
      assert.ok(showQuickPickStub.calledOnce);
      const items = showQuickPickStub.firstCall.args[0];
      assert.ok(items[0].detail?.includes('Total Tickets: 1'));
    });

    test('should handle tickets with same status', async () => {
      // Arrange
      const tickets = [
        { id: 'IMPL-001', status: TicketStatus.Backlog, type: 'impl', priority: 2 },
        { id: 'IMPL-002', status: TicketStatus.Backlog, type: 'impl', priority: 3 },
        { id: 'IMPL-003', status: TicketStatus.Backlog, type: 'impl', priority: 1 }
      ];
      getTicketsStub.returns(tickets);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowStatistics(store);

      // Assert
      const items = showQuickPickStub.firstCall.args[0];
      const detail = items[0].detail;
      assert.ok(detail?.includes('backlog'));
      assert.ok(detail?.includes('3'));
    });

    test('should handle tickets with same type', async () => {
      // Arrange
      const tickets = [
        { id: 'IMPL-001', status: TicketStatus.Backlog, type: 'impl', priority: 2 },
        { id: 'IMPL-002', status: TicketStatus.Ready, type: 'impl', priority: 3 }
      ];
      getTicketsStub.returns(tickets);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowStatistics(store);

      // Assert
      const items = showQuickPickStub.firstCall.args[0];
      const detail = items[0].detail;
      assert.ok(detail?.includes('IMPL'));
      assert.ok(detail?.includes('2'));
    });

    test('should handle tickets with same priority', async () => {
      // Arrange
      const tickets = [
        { id: 'IMPL-001', status: TicketStatus.Backlog, type: 'impl', priority: 3 },
        { id: 'FIX-001', status: TicketStatus.Ready, type: 'fix', priority: 3 }
      ];
      getTicketsStub.returns(tickets);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowStatistics(store);

      // Assert
      const items = showQuickPickStub.firstCall.args[0];
      const detail = items[0].detail;
      assert.ok(detail?.includes('3'));
      assert.ok(detail?.includes('2') || detail?.includes('(100%)'));
    });
  });
});
