/**
 * Unit tests for new-plan command handler
 *
 * Tests:
 * - executeNewPlan: InputBox title → create file → open in editor
 * - Happy path: successful plan creation
 * - Error path: creation failure
 * - User cancellation: InputBox cancel
 */

import * as assert from 'assert';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { executeNewPlan } from '../../commands/new-plan';
import { PlanService } from '../../services/plan-service';

suite('executeNewPlan Command Tests', () => {
  let planService: PlanService;
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

    planService = {
      create: createStub,
      getWorkflowRoot: getWorkflowRootStub
    } as unknown as PlanService;

    // Stub vscode methods
    showInputBoxStub = sinon.stub(vscode.window, 'showInputBox');
    showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
    showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
    executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
  });

  teardown(() => {
    sinon.restore();
  });

  suite('Happy Path', () => {
    test('should create plan with valid title', async () => {
      // Arrange
      const createdPlan = { id: 'PLAN-001', title: 'Refactor Module', status: 'active' };
      showInputBoxStub.resolves('Refactor Module');
      createStub.resolves(createdPlan);

      // Act
      await executeNewPlan(planService);

      // Assert
      assert.ok(createStub.calledOnceWith('Refactor Module'));
      assert.ok(showInformationMessageStub.calledWithMatch(/created plan PLAN-001/i));
      assert.ok(executeCommandStub.calledWith('vscode.open', sinon.match.object));
    });

    test('should create plan with complex title', async () => {
      // Arrange
      const createdPlan = { id: 'PLAN-002', title: 'Migrate to TypeScript', status: 'active' };
      showInputBoxStub.resolves('Migrate to TypeScript');
      createStub.resolves(createdPlan);

      // Act
      await executeNewPlan(planService);

      // Assert
      assert.ok(createStub.calledOnceWith('Migrate to TypeScript'));
    });

    test('should open created plan in editor', async () => {
      // Arrange
      const createdPlan = { id: 'PLAN-001', title: 'Test Plan', status: 'active' };
      showInputBoxStub.resolves('Test Plan');
      createStub.resolves(createdPlan);

      // Act
      await executeNewPlan(planService);

      // Assert
      assert.ok(executeCommandStub.calledWith('vscode.open', sinon.match.object));
      const openedUri = executeCommandStub.firstCall.args[1];
      assert.ok(openedUri.fsPath?.includes('PLAN-001.md'));
      assert.ok(openedUri.fsPath?.includes(path.join('plans', 'current')));
    });

    test('should show success message with plan ID and title', async () => {
      // Arrange
      const createdPlan = { id: 'PLAN-003', title: 'My Plan', status: 'active' };
      showInputBoxStub.resolves('My Plan');
      createStub.resolves(createdPlan);

      // Act
      await executeNewPlan(planService);

      // Assert
      assert.ok(showInformationMessageStub.calledOnce);
      const message = showInformationMessageStub.firstCall.args[0];
      assert.ok(message.includes('PLAN-003'));
      assert.ok(message.includes('My Plan'));
    });
  });

  suite('User Cancellation', () => {
    test('should return early when user cancels title input', async () => {
      // Arrange
      showInputBoxStub.resolves(undefined);

      // Act
      await executeNewPlan(planService);

      // Assert
      assert.ok(createStub.notCalled);
      assert.ok(showInformationMessageStub.notCalled);
      assert.ok(executeCommandStub.notCalled);
    });

    test('should return early when user enters empty title', async () => {
      // Arrange
      showInputBoxStub.resolves('');

      // Act
      await executeNewPlan(planService);

      // Assert
      assert.ok(createStub.notCalled);
      assert.ok(showInformationMessageStub.notCalled);
    });

    test('should pass whitespace-only title to create (validateInput is UI-only)', async () => {
      // Note: source uses `if (!title)` which does not catch whitespace-only strings.
      // validateInput in showInputBox options is UI feedback only and does not prevent submission.
      // Arrange
      createStub.resolves({ id: 'PLAN-001', title: '   ', status: 'active' });
      showInputBoxStub.resolves('   ');

      // Act
      await executeNewPlan(planService);

      // Assert
      assert.ok(createStub.calledOnce);
    });
  });

  suite('Error Handling', () => {
    test('should show error message when creation fails', async () => {
      // Arrange
      showInputBoxStub.resolves('Test Plan');
      createStub.rejects(new Error('Failed to create plan'));

      // Act
      await executeNewPlan(planService);

      // Assert
      assert.ok(showErrorMessageStub.calledWithMatch(/failed to create plan/i));
    });

    test('should handle non-Error exceptions', async () => {
      // Arrange
      showInputBoxStub.resolves('Test Plan');
      createStub.rejects('String error');

      // Act
      await executeNewPlan(planService);

      // Assert
      assert.ok(showErrorMessageStub.calledWithMatch(/failed to create plan/i));
    });
  });

  suite('InputBox Configuration', () => {
    test('should show InputBox with correct options', async () => {
      // Arrange
      showInputBoxStub.resolves(undefined);

      // Act
      await executeNewPlan(planService);

      // Assert
      assert.ok(showInputBoxStub.calledOnce);
      const options = showInputBoxStub.firstCall.args[0];
      assert.strictEqual(options?.prompt, 'Enter plan title');
      assert.strictEqual(options?.placeHolder, 'e.g., Refactor authentication module');
      assert.strictEqual(options?.title, 'Create New Plan');
    });

    test('should validate empty title', async () => {
      // Arrange
      showInputBoxStub.resolves(undefined);

      // Act
      await executeNewPlan(planService);

      // Assert
      const options = showInputBoxStub.firstCall.args[0];
      assert.ok(options?.validateInput);
      const validationResult = options.validateInput('');
      assert.ok(validationResult?.includes('Title is required'));
    });

    test('should validate whitespace-only title', async () => {
      // Arrange
      showInputBoxStub.resolves(undefined);

      // Act
      await executeNewPlan(planService);

      // Assert
      const options = showInputBoxStub.firstCall.args[0];
      const validationResult = options.validateInput('   ');
      assert.ok(validationResult?.includes('Title is required'));
    });

    test('should accept valid title', async () => {
      // Arrange
      showInputBoxStub.resolves(undefined);

      // Act
      await executeNewPlan(planService);

      // Assert
      const options = showInputBoxStub.firstCall.args[0];
      const validationResult = options.validateInput('Valid Plan Title');
      assert.strictEqual(validationResult, undefined);
    });
  });

  suite('Plan Service Integration', () => {
    test('should call create with exact title from input', async () => {
      // Arrange
      const title = 'My Custom Plan Title';
      showInputBoxStub.resolves(title);
      createStub.resolves({ id: 'PLAN-001', title, status: 'active' });

      // Act
      await executeNewPlan(planService);

      // Assert
      assert.ok(createStub.calledOnceWithExactly(title));
    });

    test('should not call executeCommand if workflowRoot is undefined', async () => {
      // Arrange
      getWorkflowRootStub.returns(undefined);
      const createdPlan = { id: 'PLAN-001', title: 'Test Plan', status: 'active' };
      showInputBoxStub.resolves('Test Plan');
      createStub.resolves(createdPlan);

      // Act
      await executeNewPlan(planService);

      // Assert
      assert.ok(createStub.calledOnce);
      assert.ok(showInformationMessageStub.called);
      assert.ok(executeCommandStub.notCalled);
    });
  });
});
