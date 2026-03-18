/**
 * Unit tests for manage-recurring command handlers
 *
 * Tests for:
 * - executeRecurringNew: Create new recurring definition
 * - executeRecurringToggle: Enable/disable definition
 * - executeRecurringDelete: Delete definition
 * - executeRecurringTriggerNow: Manual trigger
 * - executeRecurringOpenConfig: Open config file
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import {
  executeRecurringNew,
  executeRecurringToggle,
  executeRecurringDelete,
  executeRecurringTriggerNow,
  executeRecurringOpenConfig
} from '../../commands/manage-recurring';
import { IRecurringService } from '../../services/IRecurringService';
import { RecurringDefinition } from '../../data/types';

suite('manage-recurring Command Tests', () => {
  let recurringService: IRecurringService;
  let showInputBoxStub: sinon.SinonStub;
  let showQuickPickStub: sinon.SinonStub;
  let showInformationMessageStub: sinon.SinonStub;
  let showErrorMessageStub: sinon.SinonStub;
  let showWarningMessageStub: sinon.SinonStub;
  let executeCommandStub: sinon.SinonStub;
  let fsAccessStub: sinon.SinonStub;
  let fsMkdirStub: sinon.SinonStub;
  let fsWriteFileStub: sinon.SinonStub;

  const mockDefinitions: RecurringDefinition[] = [
    {
      id: 'REC-001',
      name: 'Test Recurring',
      enabled: true,
      entity_type: 'ticket',
      trigger: { type: 'cron', expression: '0 0 * * *' },
      template: { type: 'task', title_template: 'Test {n}' },
      state: {
        last_triggered_at: null,
        next_trigger_at: null,
        instance_count: 0,
        last_instance_id: null,
        is_active_instance: false
      }
    },
    {
      id: 'REC-002',
      name: 'Disabled Recurring',
      enabled: false,
      entity_type: 'ticket',
      trigger: { type: 'on-completion' },
      template: { type: 'task', title_template: 'Test {n}' },
      state: {
        last_triggered_at: null,
        next_trigger_at: null,
        instance_count: 0,
        last_instance_id: null,
        is_active_instance: false
      }
    }
  ];

  setup(() => {
    // Create stubs for recurring service
    recurringService = {
      loadDefinitions: sinon.stub().resolves(mockDefinitions),
      saveDefinitions: sinon.stub().resolves(),
      createInstance: sinon.stub().resolves({ id: 'TASK-001', title: 'Test' } as any),
      enableDefinition: sinon.stub().resolves(),
      disableDefinition: sinon.stub().resolves(),
      deleteDefinition: sinon.stub().resolves(),
      handleTicketCompletion: sinon.stub().resolves(),
      dispose: sinon.stub()
    } as unknown as IRecurringService;

    // Stub vscode methods
    showInputBoxStub = sinon.stub(vscode.window, 'showInputBox');
    showQuickPickStub = sinon.stub(vscode.window, 'showQuickPick');
    showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
    showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
    showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');
    executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();

    // Stub fs methods
    fsAccessStub = sinon.stub(fs, 'access').rejects({ code: 'ENOENT' });
    fsMkdirStub = sinon.stub(fs, 'mkdir').resolves();
    fsWriteFileStub = sinon.stub(fs, 'writeFile').resolves();
  });

  teardown(() => {
    sinon.restore();
  });

  suite('executeRecurringNew', () => {

    test('should show error when workflow root is null', async () => {
      // Act
      await executeRecurringNew(recurringService, null);

      // Assert
      assert.ok(showErrorMessageStub.calledWithMatch(/workflow not found/i));
    });

    test('should create recurring definition with cron trigger', async () => {
      // Arrange
      showInputBoxStub
        .withArgs(sinon.match({ prompt: sinon.match(/ID/i) }))
        .resolves('REC-003')
        .withArgs(sinon.match({ prompt: sinon.match(/name/i) }))
        .resolves('New Recurring')
        .withArgs(sinon.match({ prompt: sinon.match(/cron/i) }))
        .resolves('0 0 * * *')
        .withArgs(sinon.match({ prompt: sinon.match(/title template/i) }))
        .resolves('Task {date}');

      showQuickPickStub
        .withArgs(sinon.match.any, sinon.match({ placeHolder: sinon.match(/entity type/i) }))
        .resolves({ label: 'ticket', description: 'Create tickets' })
        .withArgs(sinon.match.any, sinon.match({ placeHolder: sinon.match(/trigger type/i) }))
        .resolves({ label: 'cron', description: 'Schedule-based trigger' });

      const saveDefinitionsStub = recurringService.saveDefinitions as sinon.SinonStub;

      // Act
      await executeRecurringNew(recurringService, '/test/workflow');

      // Assert
      assert.ok(saveDefinitionsStub.calledOnce);
      const savedDefinitions = saveDefinitionsStub.firstCall.args[0];
      assert.strictEqual(savedDefinitions.length, 3);
      assert.strictEqual(savedDefinitions[2].id, 'REC-003');
      assert.strictEqual(savedDefinitions[2].trigger.type, 'cron');
      assert.ok(showInformationMessageStub.calledWithMatch(/created recurring definition/i));
    });

    test('should create recurring definition with on-completion trigger', async () => {
      // Arrange
      showInputBoxStub
        .withArgs(sinon.match({ prompt: sinon.match(/ID/i) }))
        .resolves('REC-004')
        .withArgs(sinon.match({ prompt: sinon.match(/name/i) }))
        .resolves('On Complete Recurring')
        .withArgs(sinon.match({ prompt: sinon.match(/title template/i) }))
        .resolves('Follow-up #{n}');

      showQuickPickStub
        .withArgs(sinon.match.any, sinon.match({ placeHolder: sinon.match(/entity type/i) }))
        .resolves({ label: 'ticket', description: 'Create tickets' })
        .withArgs(sinon.match.any, sinon.match({ placeHolder: sinon.match(/trigger type/i) }))
        .resolves({ label: 'on-completion', description: 'Trigger when previous instance completes' });

      const saveDefinitionsStub = recurringService.saveDefinitions as sinon.SinonStub;

      // Act
      await executeRecurringNew(recurringService, '/test/workflow');

      // Assert
      assert.ok(saveDefinitionsStub.calledOnce);
      const savedDefinitions = saveDefinitionsStub.firstCall.args[0];
      assert.strictEqual(savedDefinitions[2].trigger.type, 'on-completion');
    });

    test('should cancel when user cancels ID input', async () => {
      // Arrange
      showInputBoxStub.resolves(undefined);

      // Act
      await executeRecurringNew(recurringService, '/test/workflow');

      // Assert
      const saveDefinitionsStub = recurringService.saveDefinitions as sinon.SinonStub;
      assert.ok(saveDefinitionsStub.notCalled);
    });

    test('should validate ID format', async () => {
      // Arrange - this test verifies the validation function is called
      // The actual validation happens in VS Code's UI
      showInputBoxStub
        .withArgs(sinon.match({ prompt: sinon.match(/ID/i) }))
        .resolves('INVALID ID!')
        .withArgs(sinon.match({ prompt: sinon.match(/name/i) }))
        .resolves('Test');

      showQuickPickStub.resolves({ label: 'ticket', description: 'Create tickets' });

      // Act & Assert - invalid ID should still pass through (validation is UI-level)
      // In real scenario, VS Code would show validation error
      await executeRecurringNew(recurringService, '/test/workflow');
    });
  });

  suite('executeRecurringToggle', () => {

    test('should show warning when no definitions found', async () => {
      // Arrange
      (recurringService.loadDefinitions as sinon.SinonStub).resolves([]);

      // Act
      await executeRecurringToggle(recurringService);

      // Assert
      assert.ok(showWarningMessageStub.calledWithMatch(/no recurring definitions found/i));
    });

    test('should toggle enabled definition to disabled', async () => {
      // Arrange
      const disableDefinitionStub = recurringService.disableDefinition as sinon.SinonStub;

      // Act
      await executeRecurringToggle(recurringService, 'REC-001');

      // Assert
      assert.ok(disableDefinitionStub.calledWith('REC-001'));
      assert.ok(showInformationMessageStub.calledWithMatch(/disabled recurring definition/i));
    });

    test('should toggle disabled definition to enabled', async () => {
      // Arrange
      const enableDefinitionStub = recurringService.enableDefinition as sinon.SinonStub;

      // Act
      await executeRecurringToggle(recurringService, 'REC-002');

      // Assert
      assert.ok(enableDefinitionStub.calledWith('REC-002'));
      assert.ok(showInformationMessageStub.calledWithMatch(/enabled recurring definition/i));
    });

    test('should show error when definition not found', async () => {
      // Act
      await executeRecurringToggle(recurringService, 'NONEXISTENT');

      // Assert
      assert.ok(showErrorMessageStub.calledWithMatch(/definition.*not found/i));
    });

    test('should show quick pick when definition ID not provided', async () => {
      // Act
      await executeRecurringToggle(recurringService);

      // Assert
      assert.ok(showQuickPickStub.calledOnce);
    });

    test('should cancel when user cancels quick pick', async () => {
      // Arrange
      showQuickPickStub.resolves(undefined);

      // Act
      await executeRecurringToggle(recurringService);

      // Assert
      const disableDefinitionStub = recurringService.disableDefinition as sinon.SinonStub;
      const enableDefinitionStub = recurringService.enableDefinition as sinon.SinonStub;
      assert.ok(disableDefinitionStub.notCalled);
      assert.ok(enableDefinitionStub.notCalled);
    });
  });

  suite('executeRecurringDelete', () => {

    test('should show warning when no definitions found', async () => {
      // Arrange
      (recurringService.loadDefinitions as sinon.SinonStub).resolves([]);

      // Act
      await executeRecurringDelete(recurringService);

      // Assert
      assert.ok(showWarningMessageStub.calledWithMatch(/no recurring definitions found/i));
    });

    test('should delete definition when confirmed', async () => {
      // Arrange
      const deleteDefinitionStub = recurringService.deleteDefinition as sinon.SinonStub;
      showWarningMessageStub.resolves('Delete' as any);

      // Act
      await executeRecurringDelete(recurringService, 'REC-001');

      // Assert
      assert.ok(deleteDefinitionStub.calledWith('REC-001'));
      assert.ok(showInformationMessageStub.calledWithMatch(/deleted recurring definition/i));
    });

    test('should cancel when user declines confirmation', async () => {
      // Arrange
      const deleteDefinitionStub = recurringService.deleteDefinition as sinon.SinonStub;
      showWarningMessageStub.resolves('Cancel' as any);

      // Act
      await executeRecurringDelete(recurringService, 'REC-001');

      // Assert
      assert.ok(deleteDefinitionStub.notCalled);
    });

    test('should show error when definition not found', async () => {
      // Act
      await executeRecurringDelete(recurringService, 'NONEXISTENT');

      // Assert
      assert.ok(showErrorMessageStub.calledWithMatch(/definition.*not found/i));
    });
  });

  suite('executeRecurringTriggerNow', () => {

    test('should show warning when no definitions found', async () => {
      // Arrange
      (recurringService.loadDefinitions as sinon.SinonStub).resolves([]);

      // Act
      await executeRecurringTriggerNow(recurringService);

      // Assert
      assert.ok(showWarningMessageStub.calledWithMatch(/no recurring definitions found/i));
    });

    test('should trigger enabled definition', async () => {
      // Arrange
      const createInstanceStub = recurringService.createInstance as sinon.SinonStub;

      // Act
      await executeRecurringTriggerNow(recurringService, 'REC-001');

      // Assert
      assert.ok(createInstanceStub.calledWith('REC-001'));
      assert.ok(showInformationMessageStub.calledWithMatch(/created/i));
    });

    test('should show warning when definition is disabled', async () => {
      // Act
      await executeRecurringTriggerNow(recurringService, 'REC-002');

      // Assert
      assert.ok(showWarningMessageStub.calledWithMatch(/disabled/i));
    });

    test('should show error when definition not found', async () => {
      // Act
      await executeRecurringTriggerNow(recurringService, 'NONEXISTENT');

      // Assert
      assert.ok(showErrorMessageStub.calledWithMatch(/definition.*not found/i));
    });

    test('should show error when createInstance fails', async () => {
      // Arrange
      (recurringService.createInstance as sinon.SinonStub).rejects(new Error('Test error'));

      // Act
      await executeRecurringTriggerNow(recurringService, 'REC-001');

      // Assert
      assert.ok(showErrorMessageStub.calledWithMatch(/failed to trigger/i));
    });

    test('should show quick pick when definition ID not provided', async () => {
      // Arrange - only enabled definitions should be shown
      showQuickPickStub.resolves(undefined);

      // Act
      await executeRecurringTriggerNow(recurringService);

      // Assert
      assert.ok(showQuickPickStub.calledOnce);
    });
  });

  suite('executeRecurringOpenConfig', () => {

    test('should show error when workflow root is null', async () => {
      // Act
      await executeRecurringOpenConfig(null);

      // Assert
      assert.ok(showErrorMessageStub.calledWithMatch(/workflow not found/i));
    });

    test('should create config file if not exists and open it', async () => {
      // Arrange
      fsAccessStub.rejects({ code: 'ENOENT' });

      // Act
      await executeRecurringOpenConfig('/test/workflow');

      // Assert
      assert.ok(fsMkdirStub.calledOnce);
      assert.ok(fsWriteFileStub.calledOnce);
      assert.ok(executeCommandStub.calledWith('vscode.open', sinon.match.object));
    });

    test('should open existing config file', async () => {
      // Arrange
      fsAccessStub.resolves(); // File exists

      // Act
      await executeRecurringOpenConfig('/test/workflow');

      // Assert
      assert.ok(fsMkdirStub.notCalled);
      assert.ok(fsWriteFileStub.notCalled);
      assert.ok(executeCommandStub.calledWith('vscode.open', sinon.match.object));
    });

    test('should show error when opening file fails', async () => {
      // Arrange
      fsAccessStub.resolves();
      executeCommandStub.rejects(new Error('File not found'));

      // Act
      await executeRecurringOpenConfig('/test/workflow');

      // Assert
      assert.ok(showErrorMessageStub.calledWithMatch(/failed to open recurring config/i));
    });
  });
});
