/**
 * Unit tests for createPlanFromFile command handler
 *
 * Tests:
 * - Happy path: URI provided (CodeLens) → terminal opens with agent command
 * - Happy path: URI undefined (Command Palette) → QuickPick → terminal opens
 * - Error path: pipeline.yaml missing → error message
 * - Error path: default_agent not configured → error message
 * - Error path: plan file not found → error message
 * - Error path: workspaceRoot null → error message
 * - User cancellation: QuickPick cancel
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { executeCreatePlanFromFile } from '../../commands/create-plan-from-file';
import { WorkflowStore } from '../../data/workflow-store';

suite('executeCreatePlanFromFile Command Tests', () => {
  let store: WorkflowStore;
  let showErrorMessageStub: sinon.SinonStub;
  let showInformationMessageStub: sinon.SinonStub;
  let showQuickPickStub: sinon.SinonStub;
  let createTerminalStub: sinon.SinonStub;
  let mockTerminal: { show: sinon.SinonStub; sendText: sinon.SinonStub };

  let tempWorkflowRoot: string;
  let tempWorkflowDir: string; // .workflow directory
  const testPlanFileName = 'PLAN-001.md';
  const validPipelineYaml = `pipeline:
  name: "default"
  default_agent: test-agent
  agents:
    test-agent:
      command: "npx"
      args: ["qwen-code", "--agent"]
      workdir: "."
  stages:
    execute:
      description: "Execute"
      agent: test-agent
      goto:
        default: end
  entry: execute
  context: {}
  execution:
    max_steps: 100
`;

  setup(() => {
    // Create temporary workflow directory for testing
    const tempDir = path.join(__dirname, '../../../../../tmp/test-create-plan');
    const workflowDir = path.join(tempDir, '.workflow');

    // Create directory structure
    fs.mkdirSync(path.join(workflowDir, 'plans', 'current'), { recursive: true });
    fs.mkdirSync(path.join(workflowDir, 'config'), { recursive: true });

    // Create plan file
    fs.writeFileSync(
      path.join(workflowDir, 'plans', 'current', testPlanFileName),
      '# Test Plan\n\nSome content'
    );

    // Create pipeline.yaml
    fs.writeFileSync(
      path.join(workflowDir, 'config', 'pipeline.yaml'),
      validPipelineYaml
    );

    tempWorkflowRoot = tempDir;
    tempWorkflowDir = workflowDir;

    // Create mock terminal
    mockTerminal = {
      show: sinon.stub(),
      sendText: sinon.stub()
    };

    // Stub WorkflowStore
    store = {
      getPlans: sinon.stub().returns([
        { id: 'PLAN-001', title: 'Test Plan', folder: 'current' as const },
        { id: 'PLAN-002', title: 'Another Plan', folder: 'current' as const }
      ])
    } as unknown as WorkflowStore;

    // Stub vscode methods
    showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage').resolves();
    showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage').resolves();
    showQuickPickStub = sinon.stub(vscode.window, 'showQuickPick').resolves();

    // Stub createTerminal via Object.defineProperty
    createTerminalStub = sinon.stub().returns(mockTerminal as unknown as vscode.Terminal);
    Object.defineProperty(vscode.window, 'createTerminal', {
      value: createTerminalStub,
      configurable: true
    });
  });

  teardown(() => {
    sinon.restore();
    // Cleanup
    try {
      fs.rmSync(path.join(tempWorkflowRoot, '.workflow'), { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  suite('Happy Path — URI Provided (CodeLens)', () => {
    test('should open terminal with agent command when URI is provided', async () => {
      // Arrange
      const planUri = vscode.Uri.file(path.join(tempWorkflowDir, 'plans', 'current', testPlanFileName));

      // Act
      await executeCreatePlanFromFile(store, planUri, tempWorkflowDir);

      // Assert
      assert.ok(createTerminalStub.calledOnce, 'Terminal should be created');
      const terminalOptions = createTerminalStub.firstCall.args[0];
      assert.strictEqual(terminalOptions.name, 'Create Plan PLAN-001');
      assert.strictEqual(terminalOptions.cwd, tempWorkflowDir);

      assert.ok(mockTerminal.show.calledOnce, 'Terminal should be shown');
      assert.ok(mockTerminal.sendText.calledOnce, 'Command should be sent to terminal');

      const sentCommand = mockTerminal.sendText.firstCall.args[0];
      assert.ok(sentCommand.includes('npx'), 'Command should include agent command');
      assert.ok(sentCommand.includes('qwen-code'), 'Command should include agent name');
      assert.ok(sentCommand.includes('create-plan'), 'Command should include prompt');
      assert.ok(sentCommand.includes('PLAN-001'), 'Command should include plan ID');
    });

    test('should not show QuickPick when URI is provided', async () => {
      // Arrange
      const planUri = vscode.Uri.file(path.join(tempWorkflowDir, 'plans', 'current', testPlanFileName));

      // Act
      await executeCreatePlanFromFile(store, planUri, tempWorkflowDir);

      // Assert
      assert.ok(showQuickPickStub.notCalled, 'QuickPick should not be shown when URI is provided');
    });

    test('should extract planId from URI filename', async () => {
      // Arrange
      const planUri = vscode.Uri.file(path.join(tempWorkflowDir, 'plans', 'current', testPlanFileName));

      // Act
      await executeCreatePlanFromFile(store, planUri, tempWorkflowDir);

      // Assert
      const sentCommand = mockTerminal.sendText.firstCall.args[0];
      assert.ok(sentCommand.includes('PLAN-001'), 'Plan ID should be extracted from filename');
    });
  });

  suite('Happy Path — URI Undefined (Command Palette)', () => {
    test('should show QuickPick when URI is undefined', async () => {
      // Arrange
      showQuickPickStub.resolves({
        label: 'PLAN-001',
        description: 'Test Plan',
        planId: 'PLAN-001',
        uri: vscode.Uri.file(path.join(tempWorkflowDir, 'plans', 'current', testPlanFileName))
      });

      // Act
      await executeCreatePlanFromFile(store, undefined, tempWorkflowDir);

      // Assert
      assert.ok(showQuickPickStub.calledOnce, 'QuickPick should be shown');
      const quickPickOptions = showQuickPickStub.firstCall.args[1];
      assert.ok(quickPickOptions.placeHolder?.includes('Select plan'), 'QuickPick should have correct placeholder');
    });

    test('should open terminal after QuickPick selection', async () => {
      // Arrange
      const plan002Uri = vscode.Uri.file(path.join(tempWorkflowDir, 'plans', 'current', 'PLAN-002.md'));
      fs.writeFileSync(
        path.join(tempWorkflowDir, 'plans', 'current', 'PLAN-002.md'),
        '# Another Plan'
      );

      showQuickPickStub.resolves({
        label: 'PLAN-002',
        description: 'Another Plan',
        planId: 'PLAN-002',
        uri: plan002Uri
      });

      // Act
      await executeCreatePlanFromFile(store, undefined, tempWorkflowDir);

      // Assert
      assert.ok(createTerminalStub.calledOnce, 'Terminal should be created after QuickPick');
      const sentCommand = mockTerminal.sendText.firstCall.args[0];
      assert.ok(sentCommand.includes('PLAN-002'), 'Command should include selected plan ID');
    });

    test('should return early when user cancels QuickPick', async () => {
      // Arrange
      showQuickPickStub.resolves(undefined);

      // Act
      await executeCreatePlanFromFile(store, undefined, tempWorkflowDir);

      // Assert
      assert.ok(createTerminalStub.notCalled, 'Terminal should not be created on cancel');
      assert.ok(mockTerminal.sendText.notCalled, 'No command should be sent on cancel');
    });

    test('should show info message when no plans available', async () => {
      // Arrange
      store.getPlans = sinon.stub().returns([]);

      // Act
      await executeCreatePlanFromFile(store, undefined, tempWorkflowDir);

      // Assert
      assert.ok(showQuickPickStub.notCalled, 'QuickPick should not be shown when no plans');
      assert.ok(showInformationMessageStub.calledOnce, 'Info message should be shown');
    });
  });

  suite('Error Handling', () => {
    test('should show error when workspaceRoot is null', async () => {
      // Act
      await executeCreatePlanFromFile(store, undefined, null);

      // Assert
      assert.ok(showErrorMessageStub.calledOnce, 'Error message should be shown');
      const errorMsg = showErrorMessageStub.firstCall.args[0];
      assert.ok(/workflow root not available/i.test(errorMsg), 'Error message should mention workflow root');
    });

    test('should show error when plan file does not exist', async () => {
      // Arrange
      const nonExistentUri = vscode.Uri.file(path.join(tempWorkflowDir, 'plans', 'current', 'NONEXISTENT.md'));

      // Act
      await executeCreatePlanFromFile(store, nonExistentUri, tempWorkflowDir);

      // Assert
      assert.ok(showErrorMessageStub.calledOnce, 'Error message should be shown');
      const errorMsg = showErrorMessageStub.firstCall.args[0];
      assert.ok(/plan file not found/i.test(errorMsg), 'Error should mention plan file not found');
    });

    test('should show error when pipeline.yaml is missing', async () => {
      // Arrange
      const pipelinePath = path.join(tempWorkflowDir, 'config', 'pipeline.yaml');
      fs.unlinkSync(pipelinePath);
      const planUri = vscode.Uri.file(path.join(tempWorkflowDir, 'plans', 'current', testPlanFileName));

      // Act
      await executeCreatePlanFromFile(store, planUri, tempWorkflowDir);

      // Assert
      assert.ok(showErrorMessageStub.calledOnce, 'Error message should be shown');
      const errorMsg = showErrorMessageStub.firstCall.args[0];
      assert.ok(/pipeline config not found/i.test(errorMsg), 'Error should mention pipeline config');
    });

    test('should show error when default_agent is not configured', async () => {
      // Arrange
      const pipelineWithoutDefaultAgent = `pipeline:
  name: "default"
  agents:
    other-agent:
      command: "echo"
      args: ["test"]
  stages:
    execute:
      description: "Execute"
  entry: execute
`;
      fs.writeFileSync(
        path.join(tempWorkflowDir, 'config', 'pipeline.yaml'),
        pipelineWithoutDefaultAgent
      );
      const planUri = vscode.Uri.file(path.join(tempWorkflowDir, 'plans', 'current', testPlanFileName));

      // Act
      await executeCreatePlanFromFile(store, planUri, tempWorkflowDir);

      // Assert
      assert.ok(showErrorMessageStub.calledOnce, 'Error message should be shown');
      const errorMsg = showErrorMessageStub.firstCall.args[0];
      assert.ok(/default agent not configured/i.test(errorMsg), 'Error should mention default agent');
    });

    test('should show error when default_agent references non-existent agent', async () => {
      // Arrange
      const pipelineWithBadDefaultAgent = `pipeline:
  name: "default"
  default_agent: nonexistent-agent
  agents:
    test-agent:
      command: "echo"
      args: ["test"]
  stages:
    execute:
      description: "Execute"
  entry: execute
`;
      fs.writeFileSync(
        path.join(tempWorkflowDir, 'config', 'pipeline.yaml'),
        pipelineWithBadDefaultAgent
      );
      const planUri = vscode.Uri.file(path.join(tempWorkflowDir, 'plans', 'current', testPlanFileName));

      // Act
      await executeCreatePlanFromFile(store, planUri, tempWorkflowDir);

      // Assert
      assert.ok(showErrorMessageStub.calledOnce, 'Error message should be shown');
      const errorMsg = showErrorMessageStub.firstCall.args[0];
      assert.ok(/default agent not configured/i.test(errorMsg), 'Error should mention default agent');
    });

    test('should handle Error exceptions with message', async () => {
      // Arrange — use a workspaceRoot that doesn't have .workflow structure
      const brokenRoot = path.join(tempWorkflowRoot, 'nonexistent');

      const planUri = vscode.Uri.file(path.join(brokenRoot, '.workflow', 'plans', 'current', testPlanFileName));

      // Act
      await executeCreatePlanFromFile(store, planUri, brokenRoot);

      // Assert — should show error for missing plan file (which is fine)
      assert.ok(showErrorMessageStub.calledOnce, 'Error message should be shown');
    });
  });

  suite('Terminal Command Construction', () => {
    test('should construct correct agent command with args', async () => {
      // Arrange
      const planUri = vscode.Uri.file(path.join(tempWorkflowDir, 'plans', 'current', testPlanFileName));

      // Act
      await executeCreatePlanFromFile(store, planUri, tempWorkflowDir);

      // Assert
      const sentCommand = mockTerminal.sendText.firstCall.args[0];
      assert.ok(sentCommand.includes('npx'), 'Should include agent command');
      assert.ok(sentCommand.includes('"qwen-code"'), 'Should include quoted arg');
      assert.ok(sentCommand.includes('"--agent"'), 'Should include quoted arg');
    });

    test('should include planId in prompt', async () => {
      // Arrange
      const planUri = vscode.Uri.file(path.join(tempWorkflowDir, 'plans', 'current', testPlanFileName));

      // Act
      await executeCreatePlanFromFile(store, planUri, tempWorkflowDir);

      // Assert
      const sentCommand = mockTerminal.sendText.firstCall.args[0];
      assert.ok(sentCommand.includes('create-plan Context: plan_id=PLAN-001'), 'Prompt should include plan_id');
    });

    test('should set terminal environment with CLAUDECODE null', async () => {
      // Arrange
      const planUri = vscode.Uri.file(path.join(tempWorkflowDir, 'plans', 'current', testPlanFileName));

      // Act
      await executeCreatePlanFromFile(store, planUri, tempWorkflowDir);

      // Assert
      const terminalOptions = createTerminalStub.firstCall.args[0];
      assert.ok(terminalOptions.env, 'Terminal should have env config');
      assert.strictEqual(terminalOptions.env.CLAUDECODE, null, 'CLAUDECODE should be null');
    });
  });

  suite('QuickPick Items Structure', () => {
    test('should create QuickPick items with correct structure', async () => {
      // Arrange
      showQuickPickStub.resolves(undefined);

      // Act
      await executeCreatePlanFromFile(store, undefined, tempWorkflowDir);

      // Assert
      const items = showQuickPickStub.firstCall.args[0];
      assert.ok(Array.isArray(items), 'QuickPick items should be array');
      assert.strictEqual(items.length, 2, 'Should have 2 plan items');

      const firstItem = items[0];
      assert.strictEqual(firstItem.label, 'PLAN-001');
      assert.strictEqual(firstItem.description, 'Test Plan');
      assert.ok(firstItem.uri instanceof vscode.Uri, 'Item should have URI');
    });

    test('should sort plans by ID', async () => {
      // Arrange
      showQuickPickStub.resolves(undefined);

      // Act
      await executeCreatePlanFromFile(store, undefined, tempWorkflowDir);

      // Assert
      const items = showQuickPickStub.firstCall.args[0];
      assert.strictEqual(items[0].label, 'PLAN-001');
      assert.strictEqual(items[1].label, 'PLAN-002');
    });
  });
});
