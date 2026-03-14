/**
 * Unit tests for move-ticket command handler
 *
 * Tests:
 * - executeMoveTicket: ticket selection via QuickPick, status selection via QuickPick
 * - Happy path: successful ticket move
 * - Error path: ticket not found, invalid transition
 * - User cancellation: QuickPick cancel
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { executeMoveTicket } from '../../commands/move-ticket';
import { TicketService } from '../../services/ticket-service';
import { TicketStatus } from '../../data/types';

suite('executeMoveTicket Command Tests', () => {
  let ticketService: TicketService;
  let showQuickPickStub: sinon.SinonStub;
  let showInformationMessageStub: sinon.SinonStub;
  let showErrorMessageStub: sinon.SinonStub;
  let moveStub: sinon.SinonStub;
  let getByIdStub: sinon.SinonStub;
  let getAllStub: sinon.SinonStub;
  let getValidTransitionsStub: sinon.SinonStub;
  let getWorkflowRootStub: sinon.SinonStub;

  setup(() => {
    // Create stubs for vscode.window methods FIRST (before creating ticket service)
    showQuickPickStub = sinon.stub(vscode.window, 'showQuickPick');
    showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
    showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');

    // Create stubs for ticket service methods
    moveStub = sinon.stub();
    getByIdStub = sinon.stub();
    getAllStub = sinon.stub();
    getValidTransitionsStub = sinon.stub();
    getWorkflowRootStub = sinon.stub().returns('/test/workflow');

    // Create mock ticket service with stubs - cast to any to allow partial mocking
    ticketService = {
      move: moveStub,
      getById: getByIdStub,
      getAll: getAllStub,
      getValidTransitions: getValidTransitionsStub,
      getWorkflowRoot: getWorkflowRootStub
    } as unknown as TicketService;
  });

  teardown(() => {
    sinon.restore();
  });

  suite('Happy Path', () => {
    test('should move ticket when ticketId is provided and transition is valid', async () => {
      // Arrange
      const ticketId = 'IMPL-001';
      const ticket = { id: ticketId, title: 'Test Ticket', status: TicketStatus.Ready };
      getByIdStub.withArgs(ticketId).returns(ticket);
      getValidTransitionsStub.withArgs(TicketStatus.Ready).returns([TicketStatus.InProgress, TicketStatus.Blocked]);
      moveStub.resolves();
      showQuickPickStub.resolves({ label: TicketStatus.InProgress });

      // Act
      await executeMoveTicket(ticketService, ticketId);

      // Assert
      assert.ok(moveStub.calledOnceWith(ticketId, TicketStatus.InProgress));
      assert.ok(showInformationMessageStub.calledWithMatch(/Moved IMPL-001 to in-progress/i));
    });

    test('should move ticket from active editor when ticketId is not provided', async () => {
      // Arrange
      const ticketId = 'FIX-002';
      const ticket = { id: ticketId, title: 'Fix Bug', status: TicketStatus.Backlog };
      
      // Mock active editor with ticket file name
      const mockEditor = {
        document: {
          fileName: '/test/workflow/.workflow/tickets/backlog/FIX-002.md'
        }
      };
      Object.defineProperty(vscode.window, 'activeTextEditor', { get: () => mockEditor, configurable: true });
      
      getByIdStub.withArgs(ticketId).returns(ticket);
      getValidTransitionsStub.withArgs(TicketStatus.Backlog).returns([TicketStatus.Ready]);
      moveStub.resolves();
      showQuickPickStub.resolves({ label: TicketStatus.Ready });

      // Act
      await executeMoveTicket(ticketService);

      // Assert
      assert.ok(moveStub.calledOnceWith(ticketId, TicketStatus.Ready));
    });

    test('should show ticket selection QuickPick when ticketId is not provided and no active editor', async () => {
      // Arrange
      Object.defineProperty(vscode.window, 'activeTextEditor', { get: () => undefined, configurable: true });
      const tickets = [
        { id: 'IMPL-001', title: 'Task 1', status: TicketStatus.Backlog },
        { id: 'FIX-002', title: 'Task 2', status: TicketStatus.Ready }
      ];
      getAllStub.returns(tickets);
      showQuickPickStub.onFirstCall().resolves({ label: 'FIX-002' });
      getByIdStub.withArgs('FIX-002').returns(tickets[1]);
      getValidTransitionsStub.withArgs(TicketStatus.Ready).returns([TicketStatus.InProgress]);
      moveStub.resolves();
      showQuickPickStub.onSecondCall().resolves({ label: TicketStatus.InProgress });

      // Act
      await executeMoveTicket(ticketService);

      // Assert
      assert.ok(Array.isArray(showQuickPickStub.firstCall.args[0]));
      const selectionOptions = showQuickPickStub.firstCall.args[1];
      assert.ok(/select ticket/i.test(selectionOptions?.placeHolder));
      assert.ok(/Move Ticket/i.test(selectionOptions?.title));
      assert.ok(moveStub.calledOnce);
    });
  });

  suite('User Cancellation', () => {
    test('should return early when user cancels ticket selection', async () => {
      // Arrange
      Object.defineProperty(vscode.window, 'activeTextEditor', { get: () => undefined, configurable: true });
      const tickets = [
        { id: 'IMPL-001', title: 'Task 1', status: TicketStatus.Backlog }
      ];
      getAllStub.returns(tickets);
      showQuickPickStub.onFirstCall().resolves(undefined);

      // Act
      await executeMoveTicket(ticketService);

      // Assert
      assert.ok(moveStub.notCalled);
      assert.ok(showInformationMessageStub.notCalled);
    });

    test('should return early when user cancels status selection', async () => {
      // Arrange
      const ticketId = 'IMPL-001';
      const ticket = { id: ticketId, title: 'Test', status: TicketStatus.Ready };
      getByIdStub.withArgs(ticketId).returns(ticket);
      getValidTransitionsStub.withArgs(TicketStatus.Ready).returns([TicketStatus.InProgress]);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeMoveTicket(ticketService, ticketId);

      // Assert
      assert.ok(moveStub.notCalled);
    });
  });

  suite('Error Handling', () => {
    test('should show info message when no tickets available', async () => {
      // Arrange
      Object.defineProperty(vscode.window, 'activeTextEditor', { get: () => undefined, configurable: true });
      getAllStub.returns([]);

      // Act
      await executeMoveTicket(ticketService);

      // Assert
      assert.ok(showInformationMessageStub.calledWithMatch(/no tickets available/i));
      assert.ok(moveStub.notCalled);
    });

    test('should show error message when ticket not found', async () => {
      // Arrange
      const ticketId = 'NONEXISTENT-999';
      getByIdStub.withArgs(ticketId).returns(undefined);

      // Act
      await executeMoveTicket(ticketService, ticketId);

      // Assert
      assert.ok(showErrorMessageStub.calledWithMatch(/ticket .* not found/i));
      assert.ok(moveStub.notCalled);
    });

    test('should show info message when no valid transitions', async () => {
      // Arrange
      const ticketId = 'IMPL-001';
      const ticket = { id: ticketId, title: 'Test', status: TicketStatus.Done };
      getByIdStub.withArgs(ticketId).returns(ticket);
      getValidTransitionsStub.withArgs(TicketStatus.Done).returns([]);

      // Act
      await executeMoveTicket(ticketService, ticketId);

      // Assert
      assert.ok(showInformationMessageStub.calledWithMatch(/no valid transitions/i));
      assert.ok(moveStub.notCalled);
    });

    test('should show error message when move fails', async () => {
      // Arrange
      const ticketId = 'IMPL-001';
      const ticket = { id: ticketId, title: 'Test', status: TicketStatus.Ready };
      getByIdStub.withArgs(ticketId).returns(ticket);
      getValidTransitionsStub.withArgs(TicketStatus.Ready).returns([TicketStatus.InProgress]);
      showQuickPickStub.resolves({ label: TicketStatus.InProgress });
      moveStub.rejects(new Error('Transition not allowed'));

      // Act
      await executeMoveTicket(ticketService, ticketId);

      // Assert
      assert.ok(showErrorMessageStub.calledWithMatch(/failed to move ticket/i));
    });

    test('should handle non-Error exceptions', async () => {
      // Arrange
      const ticketId = 'IMPL-001';
      const ticket = { id: ticketId, title: 'Test', status: TicketStatus.Ready };
      getByIdStub.withArgs(ticketId).returns(ticket);
      getValidTransitionsStub.withArgs(TicketStatus.Ready).returns([TicketStatus.InProgress]);
      showQuickPickStub.resolves({ label: TicketStatus.InProgress });
      moveStub.rejects('String error');

      // Act
      await executeMoveTicket(ticketService, ticketId);

      // Assert
      assert.ok(showErrorMessageStub.calledWithMatch(/failed to move ticket/i));
    });
  });

  suite('QuickPick Item Structure', () => {
    test('should create ticket selection items with correct structure', async () => {
      // Arrange
      Object.defineProperty(vscode.window, 'activeTextEditor', { get: () => undefined, configurable: true });
      const tickets = [
        { id: 'IMPL-001', title: 'Test Task', status: TicketStatus.Backlog }
      ];
      getAllStub.returns(tickets);
      showQuickPickStub.onFirstCall().resolves(undefined);

      // Act
      await executeMoveTicket(ticketService);

      // Assert
      const firstCallArgs = showQuickPickStub.firstCall.args[0];
      assert.ok(Array.isArray(firstCallArgs));
      assert.strictEqual(firstCallArgs[0].label, 'IMPL-001');
      assert.strictEqual(firstCallArgs[0].description, 'Test Task');
      assert.ok(firstCallArgs[0].detail?.includes('backlog'));
    });

    test('should create status selection items with correct structure', async () => {
      // Arrange
      const ticketId = 'IMPL-001';
      const ticket = { id: ticketId, title: 'Test', status: TicketStatus.Ready };
      getByIdStub.withArgs(ticketId).returns(ticket);
      getValidTransitionsStub.withArgs(TicketStatus.Ready).returns([TicketStatus.InProgress, TicketStatus.Blocked]);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeMoveTicket(ticketService, ticketId);

      // Assert
      const firstCallArgs = showQuickPickStub.firstCall.args[0];
      assert.ok(Array.isArray(firstCallArgs));
      assert.strictEqual(firstCallArgs[0].label, 'in-progress');
      assert.ok(firstCallArgs[0].description?.includes('Move to'));
    });
  });
});
