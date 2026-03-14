/**
 * Unit tests for error-handler.ts
 *
 * Tests:
 * - LogLevel enum and ErrorContext interface
 * - ErrorHandler class methods (constructor, getters, setters)
 * - handleError and getUserFriendlyMessage
 * - wrap and wrapAsync
 * - Logging methods (info, warn, debug, logPerformance, etc.)
 * - Global functions (getErrorHandler, initializeErrorHandler)
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import {
  ErrorHandler,
  LogLevel,
  getErrorHandler,
  initializeErrorHandler,
  withErrorHandling
} from '../../error-handler';

suite('ErrorHandler Unit Tests', () => {
  let errorHandler: ErrorHandler;
  let showErrorMessageStub: sinon.SinonStub;

  setup(() => {
    errorHandler = new ErrorHandler();
    showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
  });

  teardown(() => {
    showErrorMessageStub.restore();
    errorHandler.dispose();
  });

  suite('LogLevel Enum', () => {
    test('LogLevel should have correct values', () => {
      assert.strictEqual(LogLevel.DEBUG, 'DEBUG');
      assert.strictEqual(LogLevel.INFO, 'INFO');
      assert.strictEqual(LogLevel.WARN, 'WARN');
      assert.strictEqual(LogLevel.ERROR, 'ERROR');
    });
  });

  suite('Constructor', () => {
    test('should create ErrorHandler with default log level INFO', () => {
      const handler = new ErrorHandler();
      const outputChannel = handler.getOutputChannel();
      assert.ok(outputChannel);
      assert.strictEqual(outputChannel.name, 'Workflow AI');
      handler.dispose();
    });

    test('should initialize errorCount to 0', () => {
      assert.strictEqual(errorHandler.getErrorCount(), 0);
    });

    test('should initialize sessionStart to current timestamp', () => {
      const beforeCreation = Date.now();
      const handler = new ErrorHandler();
      const afterCreation = Date.now();
      const sessionStart = (handler as unknown as { sessionStart: number }).sessionStart;
      
      assert.ok(sessionStart >= beforeCreation);
      assert.ok(sessionStart <= afterCreation);
      handler.dispose();
    });
  });

  suite('getOutputChannel', () => {
    test('should return the output channel', () => {
      const channel = errorHandler.getOutputChannel();
      assert.ok(channel);
      assert.strictEqual(typeof channel.append, 'function');
      assert.strictEqual(typeof channel.appendLine, 'function');
    });
  });

  suite('setLogLevel', () => {
    test('should set log level to DEBUG', () => {
      errorHandler.setLogLevel(LogLevel.DEBUG);
      assert.strictEqual((errorHandler as unknown as { logLevel: LogLevel }).logLevel, LogLevel.DEBUG);
    });

    test('should set log level to ERROR', () => {
      errorHandler.setLogLevel(LogLevel.ERROR);
      assert.strictEqual((errorHandler as unknown as { logLevel: LogLevel }).logLevel, LogLevel.ERROR);
    });
  });

  suite('getErrorCount', () => {
    test('should return 0 initially', () => {
      assert.strictEqual(errorHandler.getErrorCount(), 0);
    });

    test('should increment after handleError', () => {
      errorHandler.handleError(new Error('Test error'), 'TestContext');
      assert.strictEqual(errorHandler.getErrorCount(), 1);
    });

    test('should increment multiple times', () => {
      errorHandler.handleError(new Error('Error 1'), 'Context1');
      errorHandler.handleError(new Error('Error 2'), 'Context2');
      assert.strictEqual(errorHandler.getErrorCount(), 2);
    });
  });

  suite('getSessionDuration', () => {
    test('should return positive number', () => {
      const duration = errorHandler.getSessionDuration();
      assert.ok(duration >= 0);
    });

    test('should increase over time', (done) => {
      const handler = new ErrorHandler();
      const duration1 = handler.getSessionDuration();
      
      setTimeout(() => {
        const duration2 = handler.getSessionDuration();
        assert.ok(duration2 >= duration1);
        handler.dispose();
        done();
      }, 10);
    });
  });

  suite('log', () => {
    test('should log message when level >= current log level', () => {
      const appendLineStub = sinon.stub(errorHandler.getOutputChannel(), 'appendLine');
      
      errorHandler.setLogLevel(LogLevel.INFO);
      errorHandler.log(LogLevel.INFO, 'Test message');
      
      assert.ok(appendLineStub.calledOnce);
      assert.ok(appendLineStub.firstCall.args[0].includes('[INFO] Test message'));
      
      appendLineStub.restore();
    });

    test('should not log message when level < current log level', () => {
      const appendLineStub = sinon.stub(errorHandler.getOutputChannel(), 'appendLine');
      
      errorHandler.setLogLevel(LogLevel.ERROR);
      errorHandler.log(LogLevel.DEBUG, 'Test message');
      
      assert.ok(appendLineStub.notCalled);
      
      appendLineStub.restore();
    });

    test('should include data in log message', () => {
      const appendLineStub = sinon.stub(errorHandler.getOutputChannel(), 'appendLine');
      
      errorHandler.log(LogLevel.INFO, 'Test message', { key: 'value' });
      
      assert.ok(appendLineStub.calledOnce);
      assert.ok(appendLineStub.firstCall.args[0].includes('key'));
      assert.ok(appendLineStub.firstCall.args[0].includes('value'));
      
      appendLineStub.restore();
    });

    test('should log DEBUG level when log level is DEBUG', () => {
      const appendLineStub = sinon.stub(errorHandler.getOutputChannel(), 'appendLine');
      
      errorHandler.setLogLevel(LogLevel.DEBUG);
      errorHandler.log(LogLevel.DEBUG, 'Debug message');
      
      assert.ok(appendLineStub.calledOnce);
      assert.ok(appendLineStub.firstCall.args[0].includes('[DEBUG] Debug message'));
      
      appendLineStub.restore();
    });
  });

  suite('shouldLog (private method)', () => {
    test('should return true for ERROR >= ERROR', () => {
      errorHandler.setLogLevel(LogLevel.ERROR);
      const result = (errorHandler as unknown as { shouldLog: (level: LogLevel) => boolean }).shouldLog(LogLevel.ERROR);
      assert.strictEqual(result, true);
    });

    test('should return false for DEBUG < ERROR', () => {
      errorHandler.setLogLevel(LogLevel.ERROR);
      const result = (errorHandler as unknown as { shouldLog: (level: LogLevel) => boolean }).shouldLog(LogLevel.DEBUG);
      assert.strictEqual(result, false);
    });

    test('should return true for ERROR >= DEBUG', () => {
      errorHandler.setLogLevel(LogLevel.DEBUG);
      const result = (errorHandler as unknown as { shouldLog: (level: LogLevel) => boolean }).shouldLog(LogLevel.ERROR);
      assert.strictEqual(result, true);
    });
  });

  suite('handleError', () => {
    test('should increment error count', () => {
      errorHandler.handleError(new Error('Test'), 'Context');
      assert.strictEqual(errorHandler.getErrorCount(), 1);
    });

    test('should log error message', () => {
      const appendLineStub = sinon.stub(errorHandler.getOutputChannel(), 'appendLine');
      
      errorHandler.handleError(new Error('Test error'), 'TestContext');
      
      assert.ok(appendLineStub.called);
      const logCall = appendLineStub.getCalls().find(call => 
        call.args[0].includes('Error in TestContext: Test error')
      );
      assert.ok(logCall);
      
      appendLineStub.restore();
    });

    test('should log stack trace when available', () => {
      const appendLineStub = sinon.stub(errorHandler.getOutputChannel(), 'appendLine');
      const error = new Error('Test error');
      
      errorHandler.handleError(error, 'Context');
      
      const stackCall = appendLineStub.getCalls().find(call => 
        call.args[0].includes('Stack trace:')
      );
      assert.ok(stackCall);
      
      appendLineStub.restore();
    });

    test('should show error message by default', () => {
      errorHandler.handleError(new Error('Test error'), 'Context');
      assert.ok(showErrorMessageStub.calledOnce);
    });

    test('should not show message when showMessage is false', () => {
      errorHandler.handleError(new Error('Test error'), 'Context', { showMessage: false });
      assert.ok(showErrorMessageStub.notCalled);
    });

    test('should handle non-Error objects', () => {
      const appendLineStub = sinon.stub(errorHandler.getOutputChannel(), 'appendLine');
      
      errorHandler.handleError('String error', 'Context');
      
      assert.ok(appendLineStub.called);
      assert.ok(appendLineStub.firstCall.args[0].includes('String error'));
      
      appendLineStub.restore();
    });

    test('should use custom userMessage', () => {
      errorHandler.handleError(new Error('Technical error'), 'Context', {
        showMessage: true,
        userMessage: 'Custom user message'
      });
      assert.strictEqual(showErrorMessageStub.firstCall.args[0], 'Custom user message');
    });

    test('should include additional data', () => {
      const appendLineStub = sinon.stub(errorHandler.getOutputChannel(), 'appendLine');
      
      errorHandler.handleError(new Error('Test'), 'Context', {
        data: { userId: 123, action: 'delete' }
      });
      
      assert.ok(appendLineStub.firstCall.args[0].includes('userId'));
      assert.ok(appendLineStub.firstCall.args[0].includes('123'));
      
      appendLineStub.restore();
    });
  });

  suite('getUserFriendlyMessage (private method)', () => {
    test('should return custom message when provided', () => {
      const result = (errorHandler as unknown as { getUserFriendlyMessage: (error: unknown, context: string, customMessage?: string) => string }).getUserFriendlyMessage(
        new Error('Technical'),
        'Context',
        'Custom message'
      );
      assert.strictEqual(result, 'Custom message');
    });

    test('should map CLI not found error', () => {
      const result = (errorHandler as unknown as { getUserFriendlyMessage: (error: unknown, context: string, customMessage?: string) => string }).getUserFriendlyMessage(
        new Error('CLI not found'),
        'Context'
      );
      assert.ok(result.includes('CLI not installed'));
    });

    test('should map File not found error', () => {
      const result = (errorHandler as unknown as { getUserFriendlyMessage: (error: unknown, context: string, customMessage?: string) => string }).getUserFriendlyMessage(
        new Error('File not found: expected a file'),
        'Context'
      );
      assert.ok(result.includes('file not found') || result.includes('not found'));
    });

    test('should map Invalid YAML error', () => {
      const result = (errorHandler as unknown as { getUserFriendlyMessage: (error: unknown, context: string, customMessage?: string) => string }).getUserFriendlyMessage(
        new Error('Invalid YAML parsing error'),
        'Context'
      );
      assert.ok(result.includes('Ticket format error'));
    });

    test('should map permission denied error', () => {
      const result = (errorHandler as unknown as { getUserFriendlyMessage: (error: unknown, context: string, customMessage?: string) => string }).getUserFriendlyMessage(
        new Error('EACCES: permission denied'),
        'Context'
      );
      assert.ok(result.includes('Permission denied'));
    });

    test('should map network error', () => {
      const result = (errorHandler as unknown as { getUserFriendlyMessage: (error: unknown, context: string, customMessage?: string) => string }).getUserFriendlyMessage(
        new Error('ECONNREFUSED: connection refused'),
        'Context'
      );
      assert.ok(result.includes('Network error'));
    });

    test('should map timeout error', () => {
      const result = (errorHandler as unknown as { getUserFriendlyMessage: (error: unknown, context: string, customMessage?: string) => string }).getUserFriendlyMessage(
        new Error('Request timeout ETIMEDOUT'),
        'Context'
      );
      assert.ok(result.includes('timed out'));
    });

    test('should map already exists error', () => {
      const result = (errorHandler as unknown as { getUserFriendlyMessage: (error: unknown, context: string, customMessage?: string) => string }).getUserFriendlyMessage(
        new Error('File already exists EEXIST'),
        'Context'
      );
      assert.ok(result.includes('already exists'));
    });

    test('should map not a directory error', () => {
      const result = (errorHandler as unknown as { getUserFriendlyMessage: (error: unknown, context: string, customMessage?: string) => string }).getUserFriendlyMessage(
        new Error('ENOTDIR: not a directory'),
        'Context'
      );
      assert.ok(result.includes('Invalid path'));
    });

    test('should map is a directory error', () => {
      const result = (errorHandler as unknown as { getUserFriendlyMessage: (error: unknown, context: string, customMessage?: string) => string }).getUserFriendlyMessage(
        new Error('EISDIR: is a directory'),
        'Context'
      );
      assert.ok(result.includes('Expected a file'));
    });

    test('should return generic message for unknown errors', () => {
      const result = (errorHandler as unknown as { getUserFriendlyMessage: (error: unknown, context: string, customMessage?: string) => string }).getUserFriendlyMessage(
        new Error('Unknown error'),
        'TestContext'
      );
      assert.ok(result.includes('Error in TestContext'));
    });
  });

  suite('wrap', () => {
    test('should return result of successful function', () => {
      const fn = (...args: unknown[]) => {
        const [x, y] = args as [number, number];
        return x + y;
      };
      const wrapped = errorHandler.wrap(fn, 'TestContext');
      
      const result = wrapped(2, 3);
      assert.strictEqual(result, 5);
    });

    test('should handle error and return undefined', () => {
      const fn = () => { throw new Error('Test error'); };
      const wrapped = errorHandler.wrap(fn, 'TestContext', { showMessage: false });
      
      const result = wrapped();
      assert.strictEqual(result, undefined);
    });

    test('should call onError callback', () => {
      let errorCaught: unknown;
      const fn = () => { throw new Error('Test error'); };
      const wrapped = errorHandler.wrap(fn, 'TestContext', {
        showMessage: false,
        onError: (error) => { errorCaught = error; }
      });
      
      wrapped();
      assert.ok(errorCaught instanceof Error);
      assert.strictEqual((errorCaught as Error).message, 'Test error');
    });

    test('should show error message by default', () => {
      const fn = () => { throw new Error('Test error'); };
      const wrapped = errorHandler.wrap(fn, 'TestContext');
      
      wrapped();
      assert.ok(showErrorMessageStub.calledOnce);
    });
  });

  suite('wrapAsync', () => {
    test('should return result of successful async function', async () => {
      const fn = async (...args: unknown[]) => {
        const [x] = args as [number];
        return x * 2;
      };
      const wrapped = errorHandler.wrapAsync(fn, 'TestContext');
      
      const result = await wrapped(5);
      assert.strictEqual(result, 10);
    });

    test('should handle error and return undefined', async () => {
      const fn = async () => { throw new Error('Async error'); };
      const wrapped = errorHandler.wrapAsync(fn, 'TestContext', { showMessage: false });
      
      const result = await wrapped();
      assert.strictEqual(result, undefined);
    });

    test('should call onError callback', async () => {
      let errorCaught: unknown;
      const fn = async () => { throw new Error('Async error'); };
      const wrapped = errorHandler.wrapAsync(fn, 'TestContext', {
        showMessage: false,
        onError: (error) => { errorCaught = error; }
      });
      
      await wrapped();
      assert.ok(errorCaught instanceof Error);
      assert.strictEqual((errorCaught as Error).message, 'Async error');
    });

    test('should show error message by default', async () => {
      const fn = async () => { throw new Error('Async error'); };
      const wrapped = errorHandler.wrapAsync(fn, 'TestContext');
      
      await wrapped();
      assert.ok(showErrorMessageStub.calledOnce);
    });
  });

  suite('info', () => {
    test('should log info message', () => {
      const appendLineStub = sinon.stub(errorHandler.getOutputChannel(), 'appendLine');
      
      errorHandler.info('Info message');
      
      assert.ok(appendLineStub.calledOnce);
      assert.ok(appendLineStub.firstCall.args[0].includes('[INFO] Info message'));
      
      appendLineStub.restore();
    });

    test('should include data', () => {
      const appendLineStub = sinon.stub(errorHandler.getOutputChannel(), 'appendLine');
      
      errorHandler.info('Info message', { key: 'value' });
      
      assert.ok(appendLineStub.firstCall.args[0].includes('key'));
      
      appendLineStub.restore();
    });
  });

  suite('warn', () => {
    test('should log warning message', () => {
      const appendLineStub = sinon.stub(errorHandler.getOutputChannel(), 'appendLine');
      
      errorHandler.warn('Warning message');
      
      assert.ok(appendLineStub.calledOnce);
      assert.ok(appendLineStub.firstCall.args[0].includes('[WARN] Warning message'));
      
      appendLineStub.restore();
    });
  });

  suite('debug', () => {
    test('should log debug message', () => {
      const appendLineStub = sinon.stub(errorHandler.getOutputChannel(), 'appendLine');
      
      errorHandler.setLogLevel(LogLevel.DEBUG);
      errorHandler.debug('Debug message');
      
      assert.ok(appendLineStub.calledOnce);
      assert.ok(appendLineStub.firstCall.args[0].includes('[DEBUG] Debug message'));
      
      appendLineStub.restore();
    });
  });

  suite('logCommandStart', () => {
    test('should log command start', () => {
      const appendLineStub = sinon.stub(errorHandler.getOutputChannel(), 'appendLine');
      
      errorHandler.logCommandStart('test-command', { arg: 'value' });
      
      assert.ok(appendLineStub.calledOnce);
      assert.ok(appendLineStub.firstCall.args[0].includes('Command started: test-command'));
      
      appendLineStub.restore();
    });
  });

  suite('logCommandEnd', () => {
    test('should log command end without duration', () => {
      const appendLineStub = sinon.stub(errorHandler.getOutputChannel(), 'appendLine');
      
      errorHandler.logCommandEnd('test-command');
      
      assert.ok(appendLineStub.calledOnce);
      assert.ok(appendLineStub.firstCall.args[0].includes('Command completed: test-command'));
      
      appendLineStub.restore();
    });

    test('should log command end with duration', () => {
      const appendLineStub = sinon.stub(errorHandler.getOutputChannel(), 'appendLine');
      
      errorHandler.logCommandEnd('test-command', 100);
      
      assert.ok(appendLineStub.calledOnce);
      assert.ok(appendLineStub.firstCall.args[0].includes('in 100ms'));
      
      appendLineStub.restore();
    });
  });

  suite('logCommandError', () => {
    test('should log command error', () => {
      const appendLineStub = sinon.stub(errorHandler.getOutputChannel(), 'appendLine');
      
      errorHandler.logCommandError('test-command', new Error('Command failed'), 50);
      
      assert.ok(appendLineStub.called);
      const logCall = appendLineStub.getCalls().find(call => 
        call.args[0].includes('Command: test-command after 50ms')
      );
      assert.ok(logCall);
      
      appendLineStub.restore();
    });

    test('should not show message', () => {
      errorHandler.logCommandError('test-command', new Error('Failed'));
      assert.ok(showErrorMessageStub.notCalled);
    });
  });

  suite('logCliResult', () => {
    test('should log warning for non-zero exit code', () => {
      const appendLineStub = sinon.stub(errorHandler.getOutputChannel(), 'appendLine');
      
      errorHandler.logCliResult('cmd', '', 'error output', 1);
      
      assert.ok(appendLineStub.called);
      assert.ok(appendLineStub.firstCall.args[0].includes('[WARN]'));
      
      appendLineStub.restore();
    });

    test('should log warning for stderr output', () => {
      const appendLineStub = sinon.stub(errorHandler.getOutputChannel(), 'appendLine');
      
      errorHandler.logCliResult('cmd', '', 'stderr output', 0);
      
      assert.ok(appendLineStub.called);
      assert.ok(appendLineStub.firstCall.args[0].includes('[WARN]'));
      
      appendLineStub.restore();
    });

    test('should log debug for success', () => {
      const appendLineStub = sinon.stub(errorHandler.getOutputChannel(), 'appendLine');
      
      errorHandler.setLogLevel(LogLevel.DEBUG);
      errorHandler.logCliResult('cmd', 'output', '', 0);
      
      assert.ok(appendLineStub.called);
      assert.ok(appendLineStub.firstCall.args[0].includes('[DEBUG]'));
      
      appendLineStub.restore();
    });

    test('should truncate long stderr', () => {
      const appendLineStub = sinon.stub(errorHandler.getOutputChannel(), 'appendLine');
      const longError = 'a'.repeat(600);
      
      errorHandler.logCliResult('cmd', '', longError, 1);
      
      assert.ok(appendLineStub.called);
      const logMessage = appendLineStub.firstCall.args[0];
      assert.ok(logMessage.length < 600);
      
      appendLineStub.restore();
    });
  });

  suite('logValidationResult', () => {
    test('should log debug for valid result', () => {
      const appendLineStub = sinon.stub(errorHandler.getOutputChannel(), 'appendLine');
      
      errorHandler.setLogLevel(LogLevel.DEBUG);
      errorHandler.logValidationResult('TestType', true);
      
      assert.ok(appendLineStub.called);
      assert.ok(appendLineStub.firstCall.args[0].includes('Validation passed'));
      
      appendLineStub.restore();
    });

    test('should log warning for invalid result', () => {
      const appendLineStub = sinon.stub(errorHandler.getOutputChannel(), 'appendLine');
      
      errorHandler.logValidationResult('TestType', false, ['error1', 'error2']);
      
      assert.ok(appendLineStub.called);
      assert.ok(appendLineStub.firstCall.args[0].includes('Validation failed'));
      
      appendLineStub.restore();
    });
  });

  suite('logPerformance', () => {
    test('should log warning for slow operation', () => {
      const appendLineStub = sinon.stub(errorHandler.getOutputChannel(), 'appendLine');
      
      errorHandler.logPerformance('SlowOp', 1500, 1000);
      
      assert.ok(appendLineStub.called);
      assert.ok(appendLineStub.firstCall.args[0].includes('[WARN]'));
      assert.ok(appendLineStub.firstCall.args[0].includes('1500ms'));
      
      appendLineStub.restore();
    });

    test('should log debug for fast operation', () => {
      const appendLineStub = sinon.stub(errorHandler.getOutputChannel(), 'appendLine');
      
      errorHandler.setLogLevel(LogLevel.DEBUG);
      errorHandler.logPerformance('FastOp', 50, 1000);
      
      assert.ok(appendLineStub.called);
      assert.ok(appendLineStub.firstCall.args[0].includes('[DEBUG]'));
      
      appendLineStub.restore();
    });
  });

  suite('setupGlobalHandlers', () => {
    test('should not throw', () => {
      assert.doesNotThrow(() => errorHandler.setupGlobalHandlers());
    });
  });

  suite('dispose', () => {
    test('should dispose output channel', () => {
      const disposeStub = sinon.stub(errorHandler.getOutputChannel(), 'dispose');
      
      errorHandler.dispose();
      
      assert.ok(disposeStub.calledOnce);
      disposeStub.restore();
    });
  });

  suite('getErrorHandler', () => {
    test('should create new instance on first call', () => {
      const handler = getErrorHandler();
      assert.ok(handler instanceof ErrorHandler);
    });

    test('should return same instance on subsequent calls', () => {
      const handler1 = getErrorHandler();
      const handler2 = getErrorHandler();
      assert.strictEqual(handler1, handler2);
    });
  });

  suite('initializeErrorHandler', () => {
    test('should initialize and return handler', () => {
      const handler = initializeErrorHandler();
      assert.ok(handler instanceof ErrorHandler);
    });

    test('should call setupGlobalHandlers', () => {
      const handler = initializeErrorHandler();
      // setupGlobalHandlers is a no-op, but should not throw
      assert.ok(handler instanceof ErrorHandler);
    });
  });

  suite('withErrorHandling', () => {
    let handleErrorStub: sinon.SinonStub;

    setup(() => {
      handleErrorStub = sinon.stub(getErrorHandler(), 'handleError');
    });

    teardown(() => {
      handleErrorStub.restore();
    });

    test('should return result when function succeeds', async () => {
      const fn = async () => 'success';
      const result = await withErrorHandling(fn);
      assert.strictEqual(result, 'success');
    });

    test('should return undefined when function throws Error', async () => {
      const fn = async () => { throw new Error('Test error'); };
      const result = await withErrorHandling(fn);
      assert.strictEqual(result, undefined);
    });

    test('should call handleError when function throws', async () => {
      const fn = async () => { throw new Error('Test error'); };
      await withErrorHandling(fn);
      assert.ok(handleErrorStub.calledOnce);
    });

    test('should call onError callback when provided', async () => {
      let errorCaught: Error | undefined;
      const fn = async () => { throw new Error('Test error'); };
      await withErrorHandling(fn, (error) => {
        errorCaught = error;
      });
      assert.ok(errorCaught instanceof Error);
      assert.strictEqual(errorCaught.message, 'Test error');
    });

    test('should not show message when onError is provided', async () => {
      const fn = async () => { throw new Error('Test error'); };
      await withErrorHandling(fn, (_error) => {
        // Custom handler, no message shown
      });
      assert.ok(handleErrorStub.calledOnce);
      assert.strictEqual(handleErrorStub.firstCall.args[2].showMessage, false);
    });

    test('should show message when onError is not provided', async () => {
      const fn = async () => { throw new Error('Test error'); };
      await withErrorHandling(fn);
      assert.ok(handleErrorStub.calledOnce);
      assert.strictEqual(handleErrorStub.firstCall.args[2].showMessage, true);
    });

    test('should convert non-Error to Error', async () => {
      const fn = async () => { throw 'String error'; };
      const result = await withErrorHandling(fn);
      assert.strictEqual(result, undefined);
      assert.ok(handleErrorStub.calledOnce);
      const errorArg = handleErrorStub.firstCall.args[0];
      assert.ok(errorArg instanceof Error);
    });

    test('should handle complex return types', async () => {
      const fn = async () => ({ id: 1, name: 'test', data: [1, 2, 3] });
      const result = await withErrorHandling(fn);
      assert.deepStrictEqual(result, { id: 1, name: 'test', data: [1, 2, 3] });
    });

    test('should preserve error context in handleError', async () => {
      const fn = async () => { throw new Error('Contextual error'); };
      await withErrorHandling(fn);
      const contextArg = handleErrorStub.firstCall.args[1];
      assert.strictEqual(contextArg, 'withErrorHandling');
    });
  });
});
