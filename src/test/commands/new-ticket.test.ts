/**
 * Unit tests for new-ticket command handler
 *
 * Tests:
 * - executeNewTicket: QuickPick type selection → InputBox title → create file → open
 * - Happy path: successful ticket creation
 * - Error path: creation failure
 * - User cancellation: QuickPick cancel, InputBox cancel
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { executeNewTicket } from '../../commands/new-ticket';
import { TicketService } from '../../services/ticket-service';

suite('executeNewTicket Command Tests', () => {
  let ticketService: TicketService;
  let showQuickPickStub: sinon.SinonStub;
  let showInputBoxStub: sinon.SinonStub;
  let showInformationMessageStub: sinon.SinonStub;
  let showErrorMessageStub: sinon.SinonStub;
  let createStub: sinon.SinonStub;
  let executeCommandStub: sinon.SinonStub;
  let getWorkflowRootStub: sinon.SinonStub;

  setup(() => {
    // Create stubs
    createStub = sinon.stub();
    getWorkflowRootStub = sinon.stub().returns('/test/workflow');

    ticketService = {
      create: createStub,
      getWorkflowRoot: getWorkflowRootStub
    } as unknown as TicketService;

    // Stub vscode methods
    showQuickPickStub = sinon.stub(vscode.window, 'showQuickPick');
    showInputBoxStub = sinon.stub(vscode.window, 'showInputBox');
    showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
    showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
    executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
  });

  teardown(() => {
    sinon.restore();
  });

  suite('Happy Path', () => {
    test('should create ticket with valid type and title', async () => {
      // Arrange
      const createdTicket = { id: 'IMPL-001', title: 'Test Ticket', type: 'impl', status: 'backlog' };
      showQuickPickStub.resolves({ label: 'IMPL', description: 'Implementation task' });
      showInputBoxStub.resolves('Test Ticket');
      createStub.resolves(createdTicket);

      // Act
      await executeNewTicket(ticketService);

      // Assert
      assert.ok(createStub.calledOnceWith('IMPL', 'Test Ticket'));
      assert.ok(showInformationMessageStub.calledWithMatch(/created ticket IMPL-001/i));
      assert.ok(executeCommandStub.calledWith('vscode.open', sinon.match.object));
    });

    test('should create ticket with FIX type', async () => {
      // Arrange
      const createdTicket = { id: 'FIX-001', title: 'Fix Bug', type: 'fix', status: 'backlog' };
      showQuickPickStub.resolves({ label: 'FIX', description: 'Bug fix' });
      showInputBoxStub.resolves('Fix Bug');
      createStub.resolves(createdTicket);

      // Act
      await executeNewTicket(ticketService);

      // Assert
      assert.ok(createStub.calledOnceWith('FIX', 'Fix Bug'));
    });

    test('should create ticket with DOCS type', async () => {
      // Arrange
      const createdTicket = { id: 'DOCS-001', title: 'Write Documentation', type: 'docs', status: 'backlog' };
      showQuickPickStub.resolves({ label: 'DOCS', description: 'Documentation' });
      showInputBoxStub.resolves('Write Documentation');
      createStub.resolves(createdTicket);

      // Act
      await executeNewTicket(ticketService);

      // Assert
      assert.ok(createStub.calledOnceWith('DOCS', 'Write Documentation'));
    });

    test('should create ticket with REVIEW type', async () => {
      // Arrange
      const createdTicket = { id: 'REVIEW-001', title: 'Code Review', type: 'review', status: 'backlog' };
      showQuickPickStub.resolves({ label: 'REVIEW', description: 'Code review' });
      showInputBoxStub.resolves('Code Review');
      createStub.resolves(createdTicket);

      // Act
      await executeNewTicket(ticketService);

      // Assert
      assert.ok(createStub.calledOnceWith('REVIEW', 'Code Review'));
    });

    test('should create ticket with ARCH type', async () => {
      // Arrange
      const createdTicket = { id: 'ARCH-001', title: 'Architecture Design', type: 'arch', status: 'backlog' };
      showQuickPickStub.resolves({ label: 'ARCH', description: 'Architecture task' });
      showInputBoxStub.resolves('Architecture Design');
      createStub.resolves(createdTicket);

      // Act
      await executeNewTicket(ticketService);

      // Assert
      assert.ok(createStub.calledOnceWith('ARCH', 'Architecture Design'));
    });

    test('should create ticket with ADMIN type', async () => {
      // Arrange
      const createdTicket = { id: 'ADMIN-001', title: 'Setup CI/CD', type: 'admin', status: 'backlog' };
      showQuickPickStub.resolves({ label: 'ADMIN', description: 'Administrative task' });
      showInputBoxStub.resolves('Setup CI/CD');
      createStub.resolves(createdTicket);

      // Act
      await executeNewTicket(ticketService);

      // Assert
      assert.ok(createStub.calledOnceWith('ADMIN', 'Setup CI/CD'));
    });

    test('should open created ticket in editor', async () => {
      // Arrange
      const createdTicket = { id: 'IMPL-001', title: 'Test Ticket', type: 'impl', status: 'backlog' };
      showQuickPickStub.resolves({ label: 'IMPL' });
      showInputBoxStub.resolves('Test Ticket');
      createStub.resolves(createdTicket);

      // Act
      await executeNewTicket(ticketService);

      // Assert
      assert.ok(executeCommandStub.calledWith('vscode.open', sinon.match.object));
      const openedUri = executeCommandStub.firstCall.args[1];
      assert.ok(openedUri.fsPath?.includes('IMPL-001.md'));
      assert.ok(openedUri.fsPath?.includes('backlog'));
    });
  });

  suite('User Cancellation', () => {
    test('should return early when user cancels type selection', async () => {
      // Arrange
      showQuickPickStub.resolves(undefined);

      // Act
      await executeNewTicket(ticketService);

      // Assert
      assert.ok(createStub.notCalled);
      assert.ok(showInputBoxStub.notCalled);
      assert.ok(showInformationMessageStub.notCalled);
    });

    test('should return early when user cancels title input', async () => {
      // Arrange
      showQuickPickStub.resolves({ label: 'IMPL' });
      showInputBoxStub.resolves(undefined);

      // Act
      await executeNewTicket(ticketService);

      // Assert
      assert.ok(createStub.notCalled);
      assert.ok(showInformationMessageStub.notCalled);
    });

    test('should return early when user enters empty title', async () => {
      // Arrange
      showQuickPickStub.resolves({ label: 'IMPL' });
      showInputBoxStub.resolves('');

      // Act
      await executeNewTicket(ticketService);

      // Assert
      assert.ok(createStub.notCalled);
      assert.ok(showInformationMessageStub.notCalled);
    });
  });

  suite('Error Handling', () => {
    test('should show error message when creation fails', async () => {
      // Arrange
      showQuickPickStub.resolves({ label: 'IMPL' });
      showInputBoxStub.resolves('Test Ticket');
      createStub.rejects(new Error('Failed to create ticket'));

      // Act
      await executeNewTicket(ticketService);

      // Assert
      assert.ok(showErrorMessageStub.calledWithMatch(/failed to create ticket/i));
    });

    test('should handle non-Error exceptions', async () => {
      // Arrange
      showQuickPickStub.resolves({ label: 'IMPL' });
      showInputBoxStub.resolves('Test Ticket');
      createStub.rejects('String error');

      // Act
      await executeNewTicket(ticketService);

      // Assert
      assert.ok(showErrorMessageStub.calledWithMatch(/failed to create ticket/i));
    });

    test('should not open ticket if workflowRoot is not available', async () => {
      // Arrange
      getWorkflowRootStub.returns(undefined);
      const createdTicket = { id: 'IMPL-001', title: 'Test Ticket', type: 'impl', status: 'backlog' };
      showQuickPickStub.resolves({ label: 'IMPL' });
      showInputBoxStub.resolves('Test Ticket');
      createStub.resolves(createdTicket);

      // Act
      await executeNewTicket(ticketService);

      // Assert
      assert.ok(createStub.calledOnce);
      assert.ok(showInformationMessageStub.called);
      assert.ok(executeCommandStub.notCalled);
    });
  });

  suite('QuickPick Configuration', () => {
    test('should show QuickPick with correct options', async () => {
      // Arrange
      showQuickPickStub.resolves(undefined);

      // Act
      await executeNewTicket(ticketService);

      // Assert
      assert.ok(showQuickPickStub.calledOnce);
      const options = showQuickPickStub.firstCall.args[1];
      assert.strictEqual(options?.placeHolder, 'Select ticket type');
      assert.strictEqual(options?.title, 'Create New Ticket');
    });

    test('should provide all ticket types', async () => {
      // Arrange
      showQuickPickStub.resolves(undefined);

      // Act
      await executeNewTicket(ticketService);

      // Assert
      const items = showQuickPickStub.firstCall.args[0];
      assert.strictEqual(items.length, 6);
      assert.ok(items.some((item: { label: string }) => item.label === 'IMPL'));
      assert.ok(items.some((item: { label: string }) => item.label === 'FIX'));
      assert.ok(items.some((item: { label: string }) => item.label === 'DOCS'));
      assert.ok(items.some((item: { label: string }) => item.label === 'REVIEW'));
      assert.ok(items.some((item: { label: string }) => item.label === 'ARCH'));
      assert.ok(items.some((item: { label: string }) => item.label === 'ADMIN'));
    });
  });

  suite('InputBox Configuration', () => {
    test('should show InputBox with correct options', async () => {
      // Arrange
      showQuickPickStub.resolves({ label: 'IMPL' });
      showInputBoxStub.resolves(undefined);

      // Act
      await executeNewTicket(ticketService);

      // Assert
      assert.ok(showInputBoxStub.calledOnce);
      const options = showInputBoxStub.firstCall.args[0];
      assert.strictEqual(options?.prompt, 'Enter ticket title');
      assert.strictEqual(options?.placeHolder, 'e.g., Add feature X');
      assert.strictEqual(options?.title, 'Create New Ticket');
    });

    test('should validate empty title', async () => {
      // Arrange
      showQuickPickStub.resolves({ label: 'IMPL' });
      showInputBoxStub.resolves(undefined);

      // Act
      await executeNewTicket(ticketService);

      // Assert
      const options = showInputBoxStub.firstCall.args[0];
      assert.ok(options?.validateInput);
      const validationResult = options.validateInput('');
      assert.ok(validationResult?.includes('Title is required'));
    });

    test('should validate whitespace-only title', async () => {
      // Arrange
      showQuickPickStub.resolves({ label: 'IMPL' });
      showInputBoxStub.resolves(undefined);

      // Act
      await executeNewTicket(ticketService);

      // Assert
      const options = showInputBoxStub.firstCall.args[0];
      const validationResult = options.validateInput('   ');
      assert.ok(validationResult?.includes('Title is required'));
    });

    test('should accept valid title', async () => {
      // Arrange
      showQuickPickStub.resolves({ label: 'IMPL' });
      showInputBoxStub.resolves(undefined);

      // Act
      await executeNewTicket(ticketService);

      // Assert
      const options = showInputBoxStub.firstCall.args[0];
      const validationResult = options.validateInput('Valid Title');
      assert.strictEqual(validationResult, undefined);
    });
  });
});
