/**
 * Unit tests for command-registry.ts
 *
 * Tests:
 * - CommandRegistry class implements vscode.Disposable
 * - register() - команда регистрируется и выполняется
 * - dispose() - команды освобождаются и больше не выполняются
 * - Множественная регистрация
 * - getCount() - возвращает количество зарегистрированных команд
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { CommandRegistry } from '../../command-registry';

suite('CommandRegistry Unit Tests', () => {
  let registry: CommandRegistry;
  let registerCommandStub: sinon.SinonStub;
  let disposableStub: sinon.SinonStub;

  setup(() => {
    registry = new CommandRegistry();
    disposableStub = sinon.stub();
    registerCommandStub = sinon.stub(vscode.commands, 'registerCommand').returns({
      dispose: disposableStub
    });
  });

  teardown(() => {
    registerCommandStub.restore();
    registry.dispose();
  });

  suite('Constructor', () => {
    test('should create CommandRegistry with empty disposables array', () => {
      const newRegistry = new CommandRegistry();
      assert.strictEqual(newRegistry.getCount(), 0);
      newRegistry.dispose();
    });
  });

  suite('register()', () => {
    test('should register a command with vscode.commands.registerCommand', () => {
      const handler = () => { /* no-op */ };
      const commandId = 'test.command';

      registry.register(commandId, handler);

      assert.strictEqual(registerCommandStub.calledOnce, true);
      assert.strictEqual(registerCommandStub.firstCall.args[0], commandId);
      assert.strictEqual(registerCommandStub.firstCall.args[1], handler);
      assert.strictEqual(registry.getCount(), 1);
    });

    test('should add disposable to disposables array', () => {
      const handler = () => { /* no-op */ };

      registry.register('test.command1', handler);
      registry.register('test.command2', handler);

      assert.strictEqual(registry.getCount(), 2);
    });

    test('should store the disposable returned by vscode.commands.registerCommand', () => {
      const handler = () => { /* no-op */ };
      const mockDisposable = { dispose: sinon.stub() };
      registerCommandStub.returns(mockDisposable);

      registry.register('test.command', handler);

      assert.strictEqual(registry.getCount(), 1);
    });
  });

  suite('dispose()', () => {
    test('should dispose all registered commands', () => {
      const handler = () => { /* no-op */ };

      registry.register('test.command1', handler);
      registry.register('test.command2', handler);
      registry.register('test.command3', handler);

      registry.dispose();

      assert.strictEqual(disposableStub.calledThrice, true);
      assert.strictEqual(registry.getCount(), 0);
    });

    test('should clear the disposables array after disposal', () => {
      const handler = () => { /* no-op */ };

      registry.register('test.command', handler);
      registry.dispose();

      assert.strictEqual(registry.getCount(), 0);
    });

    test('should be safe to call multiple times', () => {
      const handler = () => { /* no-op */ };

      registry.register('test.command', handler);
      registry.dispose();
      registry.dispose(); // Should not throw

      assert.strictEqual(registry.getCount(), 0);
    });
  });

  suite('Integration with vscode.commands', () => {
    test('should register command that can be executed', async () => {
      const handler = sinon.stub();
      const commandId = 'test.executableCommand';

      // Use real vscode.commands.registerCommand for execution test
      registerCommandStub.restore();
      const realDisposable = vscode.commands.registerCommand(commandId, handler);
      registry.addDisposable(realDisposable);

      await vscode.commands.executeCommand(commandId, 'arg1', 'arg2');

      assert.strictEqual(handler.calledOnce, true);
      assert.deepStrictEqual(handler.firstCall.args, ['arg1', 'arg2']);

      registry.dispose();
    });

    test('should track disposable and dispose it when registry.dispose() is called', () => {
      const disposeStub = sinon.stub();
      const mockDisposable = { dispose: disposeStub };

      registry.addDisposable(mockDisposable);

      assert.strictEqual(disposeStub.notCalled, true);

      registry.dispose();

      assert.strictEqual(disposeStub.calledOnce, true);
      assert.strictEqual(registry.getCount(), 0);
    });
  });

  suite('getCount()', () => {
    test('should return 0 for empty registry', () => {
      assert.strictEqual(registry.getCount(), 0);
    });

    test('should return correct count after multiple registrations', () => {
      const handler = () => { /* no-op */ };

      assert.strictEqual(registry.getCount(), 0);

      registry.register('test.command1', handler);
      assert.strictEqual(registry.getCount(), 1);

      registry.register('test.command2', handler);
      assert.strictEqual(registry.getCount(), 2);

      registry.register('test.command3', handler);
      assert.strictEqual(registry.getCount(), 3);
    });

    test('should return 0 after dispose', () => {
      const handler = () => { /* no-op */ };

      registry.register('test.command', handler);
      assert.strictEqual(registry.getCount(), 1);

      registry.dispose();
      assert.strictEqual(registry.getCount(), 0);
    });
  });
});
