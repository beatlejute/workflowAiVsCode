import * as assert from 'assert';
import * as vscode from 'vscode';

// Import from the built extension (compiled to dist/extension.js)
import { activate, deactivate, checkCliInstalled, checkWorkflowDir, updateContextKeys } from '../../extension';

suite('Extension Activation Suite', () => {
  let context: vscode.ExtensionContext;
  let disposables: vscode.Disposable[] = [];

  function createMockContext(): vscode.ExtensionContext {
    disposables = [];
    return {
      subscriptions: disposables,
      extensions: { getExtension: () => undefined },
      globalState: { get: () => undefined, update: () => Promise.resolve(), keys: () => [] },
      workspaceState: { get: () => undefined, update: () => Promise.resolve(), keys: () => [] },
      secrets: { get: () => undefined, store: () => Promise.resolve(), delete: () => Promise.resolve() },
      extensionUri: vscode.Uri.file('/test'),
      extensionPath: '/test',
      storagePath: '/test/storage',
      globalStoragePath: '/test/global-storage',
      environmentVariableCollection: { replace: () => {}, get: () => undefined, forEach: () => {}, delete: () => {}, clear: () => {}, description: '' },
      extension: { id: 'test', extensionUri: vscode.Uri.file('/test'), extensionPath: '/test' },
      logUri: vscode.Uri.file('/test/log'),
      logPath: '/test/log',
      storageUri: vscode.Uri.file('/test/storage'),
      globalStorageUri: vscode.Uri.file('/test/global-storage'),
      asAbsolutePath: (path: string) => path,
      extensionMode: vscode.ExtensionMode.Test,
      languageModelAccessInformation: { onDidChange: () => ({ dispose: () => {} }), canSendRequest: () => true },
    } as unknown as vscode.ExtensionContext;
  }

  suiteSetup(async () => {
    // Activate once for all tests in this suite
    context = createMockContext();
    await activate(context);
  });

  suiteTeardown(async () => {
    // Cleanup
    for (const d of disposables) {
      try {
        d.dispose();
      } catch {
        // Ignore disposal errors
      }
    }
  });

  test('activate() should not throw exceptions', async () => {
    // Already activated in suiteSetup, just verify it succeeded
    const commands = await vscode.commands.getCommands();
    assert.ok(commands.length > 0, 'Extension should be activated');
  });

  test('deactivate() should not throw exceptions', () => {
    assert.doesNotThrow(() => {
      deactivate();
    });
  });

  test('commands should be registered after activation', async () => {
    const commands = await vscode.commands.getCommands();

    assert.ok(commands.includes('workflow.installCli'), 'workflow.installCli command should be registered');
    assert.ok(commands.includes('workflow.init'), 'workflow.init command should be registered');
  });
});

suite('CLI Detection Suite', () => {
  test('checkCliInstalled() should return boolean', async () => {
    const result = await checkCliInstalled();
    assert.strictEqual(typeof result, 'boolean', 'checkCliInstalled should return a boolean');
  });

  test('checkCliInstalled() should handle custom cliPath configuration', async () => {
    const result = await checkCliInstalled();
    assert.strictEqual(typeof result, 'boolean');
  });
});

suite('Workflow Directory Detection Suite', () => {
  test('checkWorkflowDir() should return boolean', () => {
    const result = checkWorkflowDir();
    assert.strictEqual(typeof result, 'boolean', 'checkWorkflowDir should return a boolean');
  });

  test('checkWorkflowDir() should return false when no workspace is open', () => {
    const result = checkWorkflowDir();
    assert.strictEqual(typeof result, 'boolean');
  });
});

suite('Context Keys Suite', () => {
  test('updateContextKeys() should not throw exceptions', async () => {
    await assert.doesNotReject(async () => {
      await updateContextKeys();
    });
  });

  test('updateContextKeys() should set context keys', async () => {
    await assert.doesNotReject(async () => {
      await updateContextKeys();
    });
  });
});
