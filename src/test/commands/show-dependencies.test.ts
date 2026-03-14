/**
 * Unit tests for show-dependencies command handler
 *
 * Tests:
 * - executeShowDependencies: ticket selection, dependency display
 * - Happy path: show dependencies, blocks, and chain
 * - Error path: ticket not found
 * - User cancellation: QuickPick cancel
 * - buildDependencyChain function
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { executeShowDependencies } from '../../commands/show-dependencies';
import { WorkflowStore } from '../../data/workflow-store';
import { DependencyService } from '../../services/dependency-service';
import { TicketStatus } from '../../data/types';

suite('executeShowDependencies Command Tests', () => {
  let store: WorkflowStore;
  let dependencyService: DependencyService;
  let showQuickPickStub: sinon.SinonStub;
  let showInformationMessageStub: sinon.SinonStub;
  let showErrorMessageStub: sinon.SinonStub;
  let executeCommandStub: sinon.SinonStub;
  let getTicketsStub: sinon.SinonStub;
  let getTicketByIdStub: sinon.SinonStub;
  let getDependenciesStub: sinon.SinonStub;
  let getDependentsStub: sinon.SinonStub;

  setup(() => {
    // Create mock store
    getTicketsStub = sinon.stub();
    getTicketByIdStub = sinon.stub();

    store = {
      getTickets: getTicketsStub,
      getTicketById: getTicketByIdStub
    } as unknown as WorkflowStore;

    // Create mock dependency service
    getDependenciesStub = sinon.stub().returns([]);
    getDependentsStub = sinon.stub().returns([]);

    dependencyService = {
      getDependencies: getDependenciesStub,
      getDependents: getDependentsStub
    } as unknown as DependencyService;

    // Stub vscode methods
    showQuickPickStub = sinon.stub(vscode.window, 'showQuickPick');
    showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
    showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
    executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
  });

  teardown(() => {
    sinon.restore();
  });

  suite('Happy Path', () => {
    test('should show dependencies when ticketId is provided', async () => {
      // Arrange
      const ticketId = 'IMPL-002';
      const ticket = { id: ticketId, title: 'Child Task', status: TicketStatus.InProgress, type: 'impl', priority: 2 };
      const dependencies = [
        { id: 'IMPL-001', title: 'Parent Task', status: TicketStatus.Done }
      ];
      const dependents: unknown[] = [];

      getTicketByIdStub.withArgs(ticketId).returns(ticket);
      getDependenciesStub.withArgs(ticketId).returns(dependencies);
      getDependentsStub.withArgs(ticketId).returns(dependents);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowDependencies(store, dependencyService, ticketId);

      // Assert
      assert.ok(showQuickPickStub.calledOnce);
      const items = showQuickPickStub.firstCall.args[0];
      assert.ok(items.length > 0);
      const mainItem = items[0];
      assert.ok(mainItem.label?.includes(ticketId));
      assert.ok(mainItem.label?.includes(ticket.title));
    });

    test('should show dependencies from active editor when ticketId is not provided', async () => {
      // Arrange
      const ticketId = 'FIX-001';
      const ticket = { id: ticketId, title: 'Fix Bug', status: TicketStatus.Ready, type: 'fix', priority: 3 };
      const dependencies: unknown[] = [];
      const dependents = [
        { id: 'IMPL-005', title: 'Dependent Task', status: TicketStatus.Backlog }
      ];

      const mockEditor = {
        document: {
          fileName: '/test/workflow/.workflow/tickets/ready/FIX-001.md'
        }
      };
      Object.defineProperty(vscode.window, 'activeTextEditor', { get: () => mockEditor, configurable: true });

      getTicketByIdStub.withArgs(ticketId).returns(ticket);
      getDependenciesStub.withArgs(ticketId).returns(dependencies);
      getDependentsStub.withArgs(ticketId).returns(dependents);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowDependencies(store, dependencyService);

      // Assert
      assert.ok(showQuickPickStub.calledOnce);
      const items = showQuickPickStub.firstCall.args[0];
      assert.ok(items.some((item: { detail?: string }) => item.detail?.includes('No dependencies')));
      assert.ok(items.some((item: { detail?: string }) => item.detail?.includes('FIX-001')));
    });

    test('should show ticket selection QuickPick when ticketId is not provided and no active editor', async () => {
      // Arrange
      Object.defineProperty(vscode.window, 'activeTextEditor', { get: () => undefined, configurable: true });
      const tickets = [
        { id: 'IMPL-001', title: 'Task 1', status: TicketStatus.Backlog },
        { id: 'IMPL-002', title: 'Task 2', status: TicketStatus.Ready }
      ];
      getTicketsStub.returns(tickets);
      showQuickPickStub.onFirstCall().resolves({ label: 'IMPL-001' });
      getTicketByIdStub.withArgs('IMPL-001').returns(tickets[0]);
      getDependenciesStub.returns([]);
      getDependentsStub.returns([]);
      showQuickPickStub.onSecondCall().resolves(undefined);

      // Act
      await executeShowDependencies(store, dependencyService);

      // Assert
      assert.ok(Array.isArray(showQuickPickStub.firstCall.args[0]));
      const selectionOptions = showQuickPickStub.firstCall.args[1];
      assert.ok(/select ticket/i.test(selectionOptions?.placeHolder));
      assert.ok(/Show Dependencies/i.test(selectionOptions?.title));
    });

    test('should display dependency chain correctly', async () => {
      // Arrange
      const ticketId = 'IMPL-003';
      const ticket = { id: ticketId, title: 'Deep Task', status: TicketStatus.Backlog, type: 'impl', priority: 1 };
      const dependencies = [
        { id: 'IMPL-002', title: 'Middle Task', status: TicketStatus.Done },
        { id: 'IMPL-001', title: 'Root Task', status: TicketStatus.Done }
      ];
      const dependents: unknown[] = [];

      getTicketByIdStub.withArgs(ticketId).returns(ticket);
      getDependenciesStub.withArgs(ticketId).returns(dependencies);
      getDependentsStub.withArgs(ticketId).returns(dependents);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowDependencies(store, dependencyService, ticketId);

      // Assert
      const items = showQuickPickStub.firstCall.args[0];
      const chainItem = items.find((item: { description?: string }) => item.description?.includes('Chain'));
      assert.ok(chainItem);
      assert.ok(chainItem.detail?.includes('IMPL-001') || chainItem.detail?.includes('IMPL-002'));
    });
  });

  suite('User Cancellation', () => {
    test('should return early when user cancels ticket selection', async () => {
      // Arrange
      Object.defineProperty(vscode.window, 'activeTextEditor', { get: () => undefined, configurable: true });
      const tickets = [
        { id: 'IMPL-001', title: 'Task 1', status: TicketStatus.Backlog }
      ];
      getTicketsStub.returns(tickets);
      showQuickPickStub.onFirstCall().resolves(undefined);

      // Act
      await executeShowDependencies(store, dependencyService);

      // Assert
      assert.ok(showErrorMessageStub.notCalled);
      assert.ok(executeCommandStub.notCalled);
    });

    test('should return early when user cancels dependency view', async () => {
      // Arrange
      const ticketId = 'IMPL-001';
      const ticket = { id: ticketId, title: 'Test', status: TicketStatus.Backlog, type: 'impl', priority: 3 };
      getTicketByIdStub.withArgs(ticketId).returns(ticket);
      getDependenciesStub.returns([]);
      getDependentsStub.returns([]);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowDependencies(store, dependencyService, ticketId);

      // Assert
      assert.ok(executeCommandStub.notCalled);
    });
  });

  suite('Error Handling', () => {
    test('should show info message when no tickets available', async () => {
      // Arrange
      Object.defineProperty(vscode.window, 'activeTextEditor', { get: () => undefined, configurable: true });
      getTicketsStub.returns([]);

      // Act
      await executeShowDependencies(store, dependencyService);

      // Assert
      assert.ok(showInformationMessageStub.calledWithMatch(/no tickets available/i));
    });

    test('should show error message when ticket not found', async () => {
      // Arrange
      const ticketId = 'NONEXISTENT-999';
      getTicketByIdStub.withArgs(ticketId).returns(undefined);

      // Act
      await executeShowDependencies(store, dependencyService, ticketId);

      // Assert
      assert.ok(showErrorMessageStub.calledWithMatch(/ticket .* not found/i));
    });
  });

  suite('QuickPick Item Structure', () => {
    test('should create items with correct structure for main ticket', async () => {
      // Arrange
      const ticketId = 'IMPL-001';
      const ticket = { id: ticketId, title: 'Test Ticket', status: TicketStatus.Ready, type: 'impl', priority: 2 };
      getTicketByIdStub.withArgs(ticketId).returns(ticket);
      getDependenciesStub.returns([]);
      getDependentsStub.returns([]);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowDependencies(store, dependencyService, ticketId);

      // Assert
      const items = showQuickPickStub.firstCall.args[0];
      const mainItem = items[0];
      assert.ok(mainItem.label?.includes('$(git-pull-request)'));
      assert.ok(mainItem.label?.includes(ticketId));
      assert.ok(mainItem.detail?.includes('Status'));
      assert.ok(mainItem.detail?.includes('Priority'));
      assert.ok(mainItem.detail?.includes('Type'));
    });

    test('should create section for dependencies', async () => {
      // Arrange
      const ticketId = 'IMPL-001';
      const ticket = { id: ticketId, title: 'Test', status: TicketStatus.Backlog, type: 'impl', priority: 3 };
      getTicketByIdStub.withArgs(ticketId).returns(ticket);
      getDependenciesStub.returns([]);
      getDependentsStub.returns([]);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowDependencies(store, dependencyService, ticketId);

      // Assert
      const items = showQuickPickStub.firstCall.args[0];
      const depsSection = items.find((item: { description?: string }) => item.description?.includes('Dependencies'));
      assert.ok(depsSection);
    });

    test('should create section for blocks', async () => {
      // Arrange
      const ticketId = 'IMPL-001';
      const ticket = { id: ticketId, title: 'Test', status: TicketStatus.Backlog, type: 'impl', priority: 3 };
      getTicketByIdStub.withArgs(ticketId).returns(ticket);
      getDependenciesStub.returns([]);
      getDependentsStub.returns([]);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowDependencies(store, dependencyService, ticketId);

      // Assert
      const items = showQuickPickStub.firstCall.args[0];
      const blocksSection = items.find((item: { description?: string }) => item.description?.includes('Blocks'));
      assert.ok(blocksSection);
    });

    test('should create section for chain', async () => {
      // Arrange
      const ticketId = 'IMPL-001';
      const ticket = { id: ticketId, title: 'Test', status: TicketStatus.Backlog, type: 'impl', priority: 3 };
      getTicketByIdStub.withArgs(ticketId).returns(ticket);
      getDependenciesStub.returns([]);
      getDependentsStub.returns([]);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowDependencies(store, dependencyService, ticketId);

      // Assert
      const items = showQuickPickStub.firstCall.args[0];
      const chainSection = items.find((item: { description?: string }) => item.description?.includes('Chain'));
      assert.ok(chainSection);
    });

    test('should show "No dependencies" when empty', async () => {
      // Arrange
      const ticketId = 'IMPL-001';
      const ticket = { id: ticketId, title: 'Test', status: TicketStatus.Backlog, type: 'impl', priority: 3 };
      getTicketByIdStub.withArgs(ticketId).returns(ticket);
      getDependenciesStub.returns([]);
      getDependentsStub.returns([]);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowDependencies(store, dependencyService, ticketId);

      // Assert
      const items = showQuickPickStub.firstCall.args[0];
      const depsItem = items.find((item: { detail?: string }) => item.detail?.includes('No dependencies'));
      assert.ok(depsItem);
    });

    test('should show "No tickets blocked" when empty', async () => {
      // Arrange
      const ticketId = 'IMPL-001';
      const ticket = { id: ticketId, title: 'Test', status: TicketStatus.Backlog, type: 'impl', priority: 3 };
      getTicketByIdStub.withArgs(ticketId).returns(ticket);
      getDependenciesStub.returns([]);
      getDependentsStub.returns([]);
      showQuickPickStub.resolves(undefined);

      // Act
      await executeShowDependencies(store, dependencyService, ticketId);

      // Assert
      const items = showQuickPickStub.firstCall.args[0];
      const blocksItem = items.find((item: { detail?: string }) => item.detail?.includes('No tickets blocked'));
      assert.ok(blocksItem);
    });
  });

  suite('Open Ticket Action', () => {
    test('should offer to open ticket when selected', async () => {
      // Arrange
      const ticketId = 'IMPL-001';
      const ticket = { id: ticketId, title: 'Test', status: TicketStatus.Backlog, type: 'impl', priority: 3 };
      getTicketByIdStub.withArgs(ticketId).returns(ticket);
      getDependenciesStub.returns([]);
      getDependentsStub.returns([]);
      showQuickPickStub.resolves({ label: `$(git-pull-request) ${ticketId}: ${ticket.title}` });
      showInformationMessageStub.resolves('Open');

      // Act
      await executeShowDependencies(store, dependencyService, ticketId);

      // Assert
      assert.ok(showInformationMessageStub.calledWithMatch(/open.*IMPL-001/i));
      assert.ok(executeCommandStub.calledWith('workflow.openTicket', ticketId));
    });

    test('should not open ticket when user declines', async () => {
      // Arrange
      const ticketId = 'IMPL-001';
      const ticket = { id: ticketId, title: 'Test', status: TicketStatus.Backlog, type: 'impl', priority: 3 };
      getTicketByIdStub.withArgs(ticketId).returns(ticket);
      getDependenciesStub.returns([]);
      getDependentsStub.returns([]);
      showQuickPickStub.resolves({ label: `$(git-pull-request) ${ticketId}: ${ticket.title}` });
      showInformationMessageStub.resolves(undefined);

      // Act
      await executeShowDependencies(store, dependencyService, ticketId);

      // Assert
      assert.ok(executeCommandStub.notCalled);
    });
  });
});
