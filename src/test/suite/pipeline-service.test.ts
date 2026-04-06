/**
 * PipelineService Unit Tests
 *
 * Tests for:
 * - start() / stop() lifecycle
 * - PipelineState transitions
 * - onStateChange and onLog events
 * - stdout parsing ([GOTO], [INFO], [CTX])
 * - Defensive parsing with fallback
 */

import * as assert from 'assert';
import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';
import { PipelineService, PipelineState, ParsedLogEntry } from '../../services/pipeline-service';
import { SpawnFunction } from '../../types/process-types';

/**
 * Mock ChildProcess for testing
 */
class MockChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;
  exitCode: number | null = null;

  kill(signal?: string): boolean {
    this.killed = true;
    if (signal === 'SIGTERM') {
      this.exitCode = 0;
    }
    return true;
  }
}

/**
 * Interface for accessing private methods of PipelineService for testing
 */
interface PipelineServiceTestAccess {
  parseLine(line: string): ParsedLogEntry;
  parseLineLegacy(line: string): ParsedLogEntry;
  parseStdout(output: string): void;
  setState(state: PipelineState): void;
  getCurrentStage(): string | undefined;
  getCurrentAgent(): string | undefined;
  getCurrentTicket(): string | undefined;
  getRetryCount(): number;
}

suite('PipelineService Suite', () => {

  let pipelineService: PipelineService;
  let mockChild: MockChildProcess;

  setup(() => {
    mockChild = new MockChildProcess();

    // Create mock spawn function
    const mockSpawn: SpawnFunction = () => mockChild as unknown as ChildProcess;

    pipelineService = new PipelineService(mockSpawn);
  });

  teardown(() => {
    pipelineService.dispose();
  });

  /**
   * Test: start() changes state to running
   */
  test('start() changes state to running', async () => {
    assert.strictEqual(pipelineService.getState(), PipelineState.Idle);
    
    await pipelineService.start();
    
    assert.strictEqual(pipelineService.getState(), PipelineState.Running);
  });

  /**
   * Test: start() throws if already running
   */
  test('start() throws if already running', async () => {
    await pipelineService.start();
    
    await assert.rejects(
      async () => pipelineService.start(),
      /Pipeline is already running/
    );
  });

  /**
   * Test: start() resets currentStage to undefined before transitioning to Running
   *
   * Regression test for DEF-QA022-2: currentStage must be cleared before
   * setState(Running) to avoid StatusBar briefly showing stale stage from
   * the previous run.
   */
  test('start() resets currentStage to undefined before Running state', async () => {
    // Simulate a previous run's stage lingering
    (pipelineService as unknown as PipelineServiceTestAccess).setState(PipelineState.Idle);

    // Track stage changes and state changes in order
    const stageChanges: (string | undefined)[] = [];
    const stateChanges: PipelineState[] = [];

    pipelineService.onStageChange((stage) => {
      stageChanges.push(stage);
    });
    pipelineService.onStateChange((state) => {
      stateChanges.push(state);
    });

    await pipelineService.start();

    // currentStage should be undefined after start
    assert.strictEqual(pipelineService.getCurrentStage(), undefined);

    // onStageChange should have fired with undefined before or at the same time as Running
    assert.ok(stageChanges.length >= 1, 'onStageChange should have fired');
    assert.strictEqual(stageChanges[0], undefined, 'First stage change should be undefined');

    // State should transition to Running
    assert.strictEqual(stateChanges.length, 1);
    assert.strictEqual(stateChanges[0], PipelineState.Running);
  });

  /**
   * Test: stop() performs graceful shutdown
   */
  test('stop() performs graceful shutdown', async () => {
    await pipelineService.start();

    await pipelineService.stop();

    assert.strictEqual(mockChild.killed, true);
    assert.strictEqual(pipelineService.getState(), PipelineState.Idle);
  });

  /**
   * Test: stop() when no process is running
   */
  test('stop() when no process is running does nothing', async () => {
    // Should not throw, returns immediately
    await pipelineService.stop();
    assert.strictEqual(pipelineService.getState(), PipelineState.Idle);
  });

  /**
   * Test: onStateChange event fires on state transition
   */
  test('onStateChange event fires on state transition', async () => {
    const stateChanges: PipelineState[] = [];
    
    pipelineService.onStateChange((state) => {
      stateChanges.push(state);
    });
    
    await pipelineService.start();
    
    assert.strictEqual(stateChanges.length, 1);
    assert.strictEqual(stateChanges[0], PipelineState.Running);
  });

  /**
   * Test: onLog event fires on stdout output
   */
  test('onLog event fires on stdout output', async () => {
    const logs: string[] = [];
    
    pipelineService.onLog((log) => {
      logs.push(log);
    });
    
    await pipelineService.start();
    
    // Simulate stdout output
    mockChild.stdout.emit('data', Buffer.from('test log line'));
    
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0], 'test log line');
  });

  /**
   * Test: process exit with code 0 sets state to completed
   */
  test('process exit with code 0 sets state to completed', async () => {
    await pipelineService.start();
    
    // Simulate process exit
    mockChild.emit('close', 0);
    
    assert.strictEqual(pipelineService.getState(), PipelineState.Completed);
  });

  /**
   * Test: process exit with non-zero code sets state to error
   */
  test('process exit with non-zero code sets state to error', async () => {
    await pipelineService.start();
    
    // Simulate process exit with error
    mockChild.emit('close', 1);
    
    assert.strictEqual(pipelineService.getState(), PipelineState.Error);
  });

  /**
   * Test: process error sets state to error
   */
  test('process error sets state to error', async () => {
    await pipelineService.start();
    
    // Simulate process error
    mockChild.emit('error', new Error('spawn failed'));
    
    assert.strictEqual(pipelineService.getState(), PipelineState.Error);
  });

  /**
   * Test: parseLine [GOTO] pattern
   */
  test('parseLine [GOTO] pattern extracts stage and elapsed', () => {
    // Access private method via type cast for testing
    const service = pipelineService as unknown as PipelineServiceTestAccess;

    const result = service.parseLine('[GOTO] validate-deps (elapsed: 1.2s)');

    assert.strictEqual(result.type, 'goto');
    assert.strictEqual(result.stage, 'validate-deps');
    assert.strictEqual(result.elapsed, '1.2s');
  });

  /**
   * Test: parseLine [GOTO] without elapsed
   */
  test('parseLine [GOTO] without elapsed', () => {
    const service = pipelineService as unknown as PipelineServiceTestAccess;
    
    const result = service.parseLine('[GOTO] execute-task');
    
    assert.strictEqual(result.type, 'goto');
    assert.strictEqual(result.stage, 'execute-task');
    assert.strictEqual(result.elapsed, undefined);
  });

  /**
   * Test: parseLine [INFO] pattern extracts agent, ticket, retry
   */
  test('parseLine [INFO] pattern extracts agent, ticket, retry', () => {
    const service = pipelineService as unknown as PipelineServiceTestAccess;
    
    const result = service.parseLine('[INFO] agent: qwen-code, ticket: IMPL-014, retry: 1/3');
    
    assert.strictEqual(result.type, 'info');
    assert.strictEqual(result.agent, 'qwen-code');
    assert.strictEqual(result.ticket, 'IMPL-014');
    assert.strictEqual(result.retry, 1);
    assert.strictEqual(result.maxAttempts, 3);
  });

  /**
   * Test: parseLine [INFO] with partial data
   */
  test('parseLine [INFO] with only agent', () => {
    const service = pipelineService as unknown as PipelineServiceTestAccess;
    
    const result = service.parseLine('[INFO] agent: qwen-code');
    
    assert.strictEqual(result.type, 'info');
    assert.strictEqual(result.agent, 'qwen-code');
    assert.strictEqual(result.ticket, undefined);
    assert.strictEqual(result.retry, undefined);
  });

  /**
   * Test: parseLine [CTX] pattern
   */
  test('parseLine [CTX] pattern extracts key-value', () => {
    const service = pipelineService as unknown as PipelineServiceTestAccess;
    
    const result = service.parseLine('[CTX] current-stage: execute-task');
    
    assert.strictEqual(result.type, 'ctx');
    assert.strictEqual(result.stage, 'current-stage');
    assert.strictEqual(result.elapsed, 'execute-task');
  });

  /**
   * Test: parseLine unknown format falls back to raw
   */
  test('parseLine unknown format falls back to raw', () => {
    const service = pipelineService as unknown as PipelineServiceTestAccess;
    
    const result = service.parseLine('Some random log output');
    
    assert.strictEqual(result.type, 'raw');
    assert.strictEqual(result.raw, 'Some random log output');
    assert.strictEqual(result.stage, undefined);
  });

  /**
   * Test: parseStdout updates currentStage from [GOTO]
   */
  test('parseStdout updates currentStage from [GOTO]', async () => {
    await pipelineService.start();
    
    // Access private method via any cast for testing
    const service = pipelineService as unknown as PipelineServiceTestAccess;
    service.parseStdout('[GOTO] validate-deps');
    
    assert.strictEqual(service.getCurrentStage(), 'validate-deps');
  });

  /**
   * Test: parseStdout updates currentAgent and currentTicket from [INFO]
   */
  test('parseStdout updates currentAgent and currentTicket from [INFO]', async () => {
    await pipelineService.start();
    
    const service = pipelineService as unknown as PipelineServiceTestAccess;
    service.parseStdout('[INFO] agent: qwen-code, ticket: IMPL-014');
    
    assert.strictEqual(service.getCurrentAgent(), 'qwen-code');
    assert.strictEqual(service.getCurrentTicket(), 'IMPL-014');
  });

  /**
   * Test: parseStdout updates retryCount from [INFO]
   */
  test('parseStdout updates retryCount from [INFO]', async () => {
    await pipelineService.start();
    
    const service = pipelineService as unknown as PipelineServiceTestAccess;
    service.parseStdout('[INFO] retry: 2/5');
    
    assert.strictEqual(service.getRetryCount(), 2);
  });

  /**
   * Test: start passes run arg
   */
  test('start passes run arg', async () => {
    let capturedArgs: readonly string[] | undefined;

    const mockSpawn: SpawnFunction = (command, args) => {
      capturedArgs = args;
      return mockChild as unknown as ChildProcess;
    };

    const service = new PipelineService(mockSpawn);
    await service.start();

    assert.deepStrictEqual(capturedArgs, ['run']);
    service.dispose();
  });

  /**
   * Test: spawnWithFallback uses primary command when available
   */
  test('spawnWithFallback uses primary command when available', async () => {
    let capturedCommand: string | undefined;

    const mockSpawn: SpawnFunction = (_command, _args) => {
      capturedCommand = _command;
      return mockChild as unknown as ChildProcess;
    };

    const service = new PipelineService(mockSpawn);
    await service.start();

    assert.strictEqual(capturedCommand, 'workflow');
    service.dispose();
  });

  /**
   * Test: spawnWithFallback falls back to workflow-ai on ENOENT
   */
  test('spawnWithFallback falls back to workflow-ai on ENOENT', async () => {
    const commands: string[] = [];

    const mockSpawn: SpawnFunction = (command, _args) => {
      commands.push(command);
      const mock = new MockChildProcess();
      // Simulate ENOENT on first call (workflow)
      if (command === 'workflow') {
        setTimeout(() => mock.emit('error', Object.assign(new Error('spawn failed'), { code: 'ENOENT' })), 0);
      }
      return mock as unknown as ChildProcess;
    };

    const service = new PipelineService(mockSpawn);
    await service.start();

    // Wait for async fallback
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.strictEqual(commands.length, 2);
    assert.strictEqual(commands[0], 'workflow');
    assert.strictEqual(commands[1], 'workflow-ai');
    service.dispose();
  });

  /**
   * Test: stderr output is prefixed with [ERROR]
   */
  test('stderr output is prefixed with [ERROR]', async () => {
    const logs: string[] = [];
    
    pipelineService.onLog((log) => {
      logs.push(log);
    });
    
    await pipelineService.start();
    
    // Simulate stderr output
    mockChild.stderr.emit('data', Buffer.from('error message'));
    
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0], '[ERROR] error message');
  });

  /**
   * Test: dispose stops pipeline and removes listeners
   */
  test('dispose stops pipeline and removes listeners', async () => {
    await pipelineService.start();

    pipelineService.dispose();

    assert.strictEqual(pipelineService.getState(), PipelineState.Idle);
    assert.strictEqual(pipelineService.listenerCount('stateChange'), 0);
    assert.strictEqual(pipelineService.listenerCount('log'), 0);
  });

  /**
   * Test: start with planId passes plan argument
   */
  test('start with planId passes plan argument', async () => {
    let capturedArgs: readonly string[] | undefined;

    const mockSpawn: SpawnFunction = (command, args) => {
      capturedArgs = args;
      return mockChild as unknown as ChildProcess;
    };

    const service = new PipelineService(mockSpawn);
    await service.start('PLAN-001');

    assert.deepStrictEqual(capturedArgs, ['run', '--plan', 'PLAN-001']);
    service.dispose();
  });

  /**
   * Test: parseLine new format with timestamp
   */
  test('parseLine new format with timestamp parses GOTO', () => {
    const service = pipelineService as unknown as PipelineServiceTestAccess;

    const result = service.parseLine('[2024-01-01T12:00:00] [INFO] [stage] GOTO next-stage (elapsed: 2.5s)');

    assert.strictEqual(result.type, 'goto');
    assert.strictEqual(result.stage, 'next-stage');
    assert.strictEqual(result.elapsed, '2.5s');
    assert.strictEqual(result.timestamp, '2024-01-01T12:00:00');
  });

  /**
   * Test: parseLine new format parses START
   */
  test('parseLine new format parses START', () => {
    const service = pipelineService as unknown as PipelineServiceTestAccess;

    const result = service.parseLine('[2024-01-01T12:00:00] [INFO] [stage] START stage="execute" agent="qwen" skill="code"');

    assert.strictEqual(result.type, 'start');
    assert.strictEqual(result.stage, 'execute');
    assert.strictEqual(result.agent, 'qwen');
    assert.strictEqual(result.skill, 'code');
  });

  /**
   * Test: parseLine new format parses RETRY
   */
  test('parseLine new format parses RETRY', () => {
    const service = pipelineService as unknown as PipelineServiceTestAccess;

    const result = service.parseLine('[2024-01-01T12:00:00] [WARN] [stage] RETRY stage="execute" attempt=2/3');

    assert.strictEqual(result.type, 'info');
    assert.strictEqual(result.stage, 'execute');
    assert.strictEqual(result.retry, 2);
    assert.strictEqual(result.maxAttempts, 3);
  });

  /**
   * Test: parseLineLegacy parses GOTO with elapsed
   */
  test('parseLineLegacy parses GOTO with elapsed', () => {
    const service = pipelineService as unknown as PipelineServiceTestAccess;

    const result = service.parseLineLegacy('[GOTO] validate-deps (elapsed: 1.2s)');

    assert.strictEqual(result.type, 'goto');
    assert.strictEqual(result.stage, 'validate-deps');
    assert.strictEqual(result.elapsed, '1.2s');
  });

  /**
   * Test: parseLineLegacy parses GOTO without elapsed
   */
  test('parseLineLegacy parses GOTO without elapsed', () => {
    const service = pipelineService as unknown as PipelineServiceTestAccess;

    const result = service.parseLineLegacy('[GOTO] execute-task');

    assert.strictEqual(result.type, 'goto');
    assert.strictEqual(result.stage, 'execute-task');
    assert.strictEqual(result.elapsed, undefined);
  });

  /**
   * Test: parseLineLegacy parses INFO with all fields
   */
  test('parseLineLegacy parses INFO with all fields', () => {
    const service = pipelineService as unknown as PipelineServiceTestAccess;

    const result = service.parseLineLegacy('[INFO] agent: qwen-code, ticket: IMPL-014, retry: 1/3');

    assert.strictEqual(result.type, 'info');
    assert.strictEqual(result.agent, 'qwen-code');
    assert.strictEqual(result.ticket, 'IMPL-014');
    assert.strictEqual(result.retry, 1);
    assert.strictEqual(result.maxAttempts, 3);
  });

  /**
   * Test: parseLineLegacy parses INFO with only agent
   */
  test('parseLineLegacy parses INFO with only agent', () => {
    const service = pipelineService as unknown as PipelineServiceTestAccess;

    const result = service.parseLineLegacy('[INFO] agent: qwen-code');

    assert.strictEqual(result.type, 'info');
    assert.strictEqual(result.agent, 'qwen-code');
    assert.strictEqual(result.ticket, undefined);
  });

  /**
   * Test: parseLineLegacy parses INFO with only ticket
   */
  test('parseLineLegacy parses INFO with only ticket', () => {
    const service = pipelineService as unknown as PipelineServiceTestAccess;

    const result = service.parseLineLegacy('[INFO] ticket: IMPL-014');

    assert.strictEqual(result.type, 'info');
    assert.strictEqual(result.ticket, 'IMPL-014');
    assert.strictEqual(result.agent, undefined);
  });

  /**
   * Test: parseLineLegacy parses retry only
   */
  test('parseLineLegacy parses retry only', () => {
    const service = pipelineService as unknown as PipelineServiceTestAccess;

    const result = service.parseLineLegacy('[INFO] retry: 2/5');

    assert.strictEqual(result.type, 'info');
    assert.strictEqual(result.retry, 2);
    assert.strictEqual(result.maxAttempts, 5);
  });

  /**
   * Test: parseLineLegacy parses CTX
   */
  test('parseLineLegacy parses CTX', () => {
    const service = pipelineService as unknown as PipelineServiceTestAccess;

    const result = service.parseLineLegacy('[CTX] current-stage: execute-task');

    assert.strictEqual(result.type, 'ctx');
    assert.strictEqual(result.stage, 'current-stage');
    assert.strictEqual(result.elapsed, 'execute-task');
  });

  /**
   * Test: parseLineLegacy falls back to raw for unknown format
   */
  test('parseLineLegacy falls back to raw for unknown format', () => {
    const service = pipelineService as unknown as PipelineServiceTestAccess;

    const result = service.parseLineLegacy('Some random log output');

    assert.strictEqual(result.type, 'raw');
    assert.strictEqual(result.raw, 'Some random log output');
  });

  /**
   * Test: parseStdout handles multiple lines
   */
  test('parseStdout handles multiple lines', async () => {
    await pipelineService.start();

    const service = pipelineService as unknown as PipelineServiceTestAccess;
    service.parseStdout('[GOTO] stage1\n[GOTO] stage2\n');

    assert.strictEqual(service.getCurrentStage(), 'stage2');
  });

  /**
   * Test: parseStdout ignores empty lines
   */
  test('parseStdout ignores empty lines', async () => {
    await pipelineService.start();

    const service = pipelineService as unknown as PipelineServiceTestAccess;
    service.parseStdout('\n\n[GOTO] stage1\n\n');

    assert.strictEqual(service.getCurrentStage(), 'stage1');
  });

  /**
   * Test: setState does not emit if state is unchanged
   */
  test('setState does not emit if state is unchanged', async () => {
    const stateChanges: PipelineState[] = [];

    pipelineService.onStateChange((state) => {
      stateChanges.push(state);
    });

    // Set to Running
    await pipelineService.start();
    const initialCount = stateChanges.length;

    // Try to set to Running again (should not emit)
    const service = pipelineService as unknown as PipelineServiceTestAccess;
    service.setState(PipelineState.Running);

    assert.strictEqual(stateChanges.length, initialCount);
  });

  /**
   * Test: getCurrentStage returns undefined initially
   */
  test('getCurrentStage returns undefined initially', () => {
    assert.strictEqual(pipelineService.getCurrentStage(), undefined);
  });

  /**
   * Test: getCurrentAgent returns undefined initially
   */
  test('getCurrentAgent returns undefined initially', () => {
    assert.strictEqual(pipelineService.getCurrentAgent(), undefined);
  });

  /**
   * Test: getCurrentTicket returns undefined initially
   */
  test('getCurrentTicket returns undefined initially', () => {
    assert.strictEqual(pipelineService.getCurrentTicket(), undefined);
  });

  /**
   * Test: getRetryCount returns 0 initially
   */
  test('getRetryCount returns 0 initially', () => {
    assert.strictEqual(pipelineService.getRetryCount(), 0);
  });

  /**
   * Test: onStateChange returns this for chaining
   */
  test('onStateChange returns this for chaining', () => {
    const result = pipelineService.onStateChange(() => {});
    assert.strictEqual(result, pipelineService);
  });

  /**
   * Test: onLog returns this for chaining
   */
  test('onLog returns this for chaining', () => {
    const result = pipelineService.onLog(() => {});
    assert.strictEqual(result, pipelineService);
  });

  /**
   * Test: stop on Windows uses taskkill
   */
  test('stop on Windows uses taskkill', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    await pipelineService.start();
    await pipelineService.stop();

    assert.strictEqual(mockChild.killed, true);

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  /**
   * Test: process exit with code 0 after stop does not override state
   */
  test('process exit with code 0 after stop does not override state', async () => {
    await pipelineService.start();

    await pipelineService.stop();

    // Simulate process exit after stop
    mockChild.emit('close', 0);

    assert.strictEqual(pipelineService.getState(), PipelineState.Idle);
  });

  /**
   * Test: parseLine detects FAIL pattern and sets hasStageErrors
   */
  test('parseLine detects FAIL pattern and sets hasStageErrors', () => {
    const service = pipelineService as unknown as PipelineServiceTestAccess;

    service.parseLine('[2024-01-01T12:00:00] [ERROR] [stage] FAIL: stage execution failed');

    // Access private hasStageErrors via any cast
    const hasErrors = (pipelineService as any).hasStageErrors;
    assert.strictEqual(hasErrors, true);
  });

  /**
   * Test: parseLine detects ERROR pattern and sets hasStageErrors
   */
  test('parseLine detects ERROR pattern and sets hasStageErrors', () => {
    const service = pipelineService as unknown as PipelineServiceTestAccess;

    service.parseLine('[2024-01-01T12:00:00] [ERROR] [stage] ERROR: something went wrong');

    const hasErrors = (pipelineService as any).hasStageErrors;
    assert.strictEqual(hasErrors, true);
  });

  /**
   * Test: parseLine detects failed pattern and sets hasStageErrors
   */
  test('parseLine detects failed pattern and sets hasStageErrors', () => {
    const service = pipelineService as unknown as PipelineServiceTestAccess;

    service.parseLine('[2024-01-01T12:00:00] [WARN] [stage] stage failed with exit code 1');

    const hasErrors = (pipelineService as any).hasStageErrors;
    assert.strictEqual(hasErrors, true);
  });

  /**
   * Test: parseLine detects failure pattern and sets hasStageErrors
   */
  test('parseLine detects failure pattern and sets hasStageErrors', () => {
    const service = pipelineService as unknown as PipelineServiceTestAccess;

    service.parseLine('[2024-01-01T12:00:00] [ERROR] [stage] task failure detected');

    const hasErrors = (pipelineService as any).hasStageErrors;
    assert.strictEqual(hasErrors, true);
  });

  /**
   * Test: parseLine does not set hasStageErrors for normal messages
   */
  test('parseLine does not set hasStageErrors for normal messages', () => {
    const service = pipelineService as unknown as PipelineServiceTestAccess;

    service.parseLine('[2024-01-01T12:00:00] [INFO] [stage] task completed successfully');

    const hasErrors = (pipelineService as any).hasStageErrors;
    assert.strictEqual(hasErrors, false);
  });

  /**
   * Test: parseLineLegacy detects error patterns
   */
  test('parseLineLegacy detects error patterns', () => {
    const service = pipelineService as unknown as PipelineServiceTestAccess;

    service.parseLineLegacy('ERROR: stage execution failed');

    const hasErrors = (pipelineService as any).hasStageErrors;
    assert.strictEqual(hasErrors, true);
  });

  /**
   * Test: parseLineLegacy does not set hasStageErrors for normal messages
   */
  test('parseLineLegacy does not set hasStageErrors for normal messages', () => {
    const service = pipelineService as unknown as PipelineServiceTestAccess;

    service.parseLineLegacy('INFO: task completed');

    const hasErrors = (pipelineService as any).hasStageErrors;
    assert.strictEqual(hasErrors, false);
  });

  /**
   * Test: exit code 0 with hasStageErrors sets state to Error
   */
  test('exit code 0 with hasStageErrors sets state to Error', async () => {
    await pipelineService.start();

    // Simulate error detection during execution
    const service = pipelineService as unknown as PipelineServiceTestAccess;
    service.parseStdout('[2024-01-01T12:00:00] [ERROR] [stage] FAIL: stage failed');

    // Simulate process exit with code 0
    mockChild.emit('close', 0);

    assert.strictEqual(pipelineService.getState(), PipelineState.Error);
  });

  /**
   * Test: exit code 0 without errors sets state to Completed
   */
  test('exit code 0 without errors sets state to Completed', async () => {
    await pipelineService.start();

    // Simulate normal execution without errors
    const service = pipelineService as unknown as PipelineServiceTestAccess;
    service.parseStdout('[2024-01-01T12:00:00] [INFO] [stage] task completed');

    // Simulate process exit with code 0
    mockChild.emit('close', 0);

    assert.strictEqual(pipelineService.getState(), PipelineState.Completed);
  });

  /**
   * Test: hasStageErrors is reset on start
   */
  test('hasStageErrors is reset on start', async () => {
    // First run with errors
    await pipelineService.start();
    const service = pipelineService as unknown as PipelineServiceTestAccess;
    service.parseStdout('[2024-01-01T12:00:00] [ERROR] [stage] FAIL');
    mockChild.emit('close', 0);

    // Second run should reset hasStageErrors
    await pipelineService.start();

    const hasErrors = (pipelineService as any).hasStageErrors;
    assert.strictEqual(hasErrors, false);
  });

  /**
   * Test: exit code non-zero still sets Error regardless of hasStageErrors
   */
  test('exit code non-zero still sets Error regardless of hasStageErrors', async () => {
    await pipelineService.start();

    // Simulate error detection
    const service = pipelineService as unknown as PipelineServiceTestAccess;
    service.parseStdout('[2024-01-01T12:00:00] [ERROR] [stage] FAIL');

    // Simulate process exit with non-zero code
    mockChild.emit('close', 1);

    assert.strictEqual(pipelineService.getState(), PipelineState.Error);
  });

  /**
   * Test: retry edge case - error + retry + success = Completed
   */
  test('retry edge case - error + retry + success = Completed', async () => {
    await pipelineService.start();

    const service = pipelineService as unknown as PipelineServiceTestAccess;

    // Stage has an error
    service.parseStdout('[2024-01-01T12:00:00] [ERROR] [stage-a] FAIL: stage failed');

    // Retry is triggered
    service.parseStdout('[2024-01-01T12:01:00] [WARN] [stage-a] RETRY stage="stage-a" attempt=1/3');

    // Stage completes successfully with status="success"
    service.parseStdout('[2024-01-01T12:02:00] [INFO] [Runner] GOTO stage-a → stage-b status="success"');

    // Simulate process exit with code 0
    mockChild.emit('close', 0);

    // Should be Completed, not Error
    assert.strictEqual(pipelineService.getState(), PipelineState.Completed);
  });

  /**
   * Test: retry edge case - error + retry + no success status = Error
   */
  test('retry edge case - error + retry + no success status = Error', async () => {
    await pipelineService.start();

    const service = pipelineService as unknown as PipelineServiceTestAccess;

    // Stage has an error
    service.parseStdout('[2024-01-01T12:00:00] [ERROR] [stage-a] FAIL: stage failed');

    // Retry is triggered
    service.parseStdout('[2024-01-01T12:01:00] [WARN] [stage-a] RETRY stage="stage-a" attempt=1/3');

    // GOTO without status="success" (old format)
    service.parseStdout('[2024-01-01T12:02:00] [INFO] [Runner] GOTO stage-b');

    // Simulate process exit with code 0
    mockChild.emit('close', 0);

    // Should be Error because we don't know if retry succeeded
    assert.strictEqual(pipelineService.getState(), PipelineState.Error);
  });

  /**
   * Test: multiple errors with retry - only cleared when specific stage succeeds
   */
  test('multiple errors with retry - only cleared when specific stage succeeds', async () => {
    await pipelineService.start();

    const service = pipelineService as unknown as PipelineServiceTestAccess;

    // First stage has error
    service.parseStdout('[2024-01-01T12:00:00] [ERROR] [stage-a] FAIL: stage-a failed');
    service.parseStdout('[2024-01-01T12:01:00] [WARN] [stage-a] RETRY stage="stage-a" attempt=1/3');

    // Second stage also has error
    service.parseStdout('[2024-01-01T12:02:00] [ERROR] [stage-b] FAIL: stage-b failed');
    service.parseStdout('[2024-01-01T12:03:00] [WARN] [stage-b] RETRY stage="stage-b" attempt=1/3');

    // Only stage-a succeeds
    service.parseStdout('[2024-01-01T12:04:00] [INFO] [Runner] GOTO stage-a → stage-b status="success"');

    // Simulate process exit with code 0
    mockChild.emit('close', 0);

    // Should still be Error because stage-b didn't succeed
    assert.strictEqual(pipelineService.getState(), PipelineState.Error);
  });

  /**
   * Test: all retries succeed - should be Completed
   */
  test('all retries succeed - should be Completed', async () => {
    await pipelineService.start();

    const service = pipelineService as unknown as PipelineServiceTestAccess;

    // Stage-a has error and retry
    service.parseStdout('[2024-01-01T12:00:00] [ERROR] [stage-a] FAIL: stage-a failed');
    service.parseStdout('[2024-01-01T12:01:00] [WARN] [stage-a] RETRY stage="stage-a" attempt=1/3');

    // Stage-b has error and retry
    service.parseStdout('[2024-01-01T12:02:00] [ERROR] [stage-b] FAIL: stage-b failed');
    service.parseStdout('[2024-01-01T12:03:00] [WARN] [stage-b] RETRY stage="stage-b" attempt=1/3');

    // Both stages succeed
    service.parseStdout('[2024-01-01T12:04:00] [INFO] [Runner] GOTO stage-a → stage-b status="success"');
    service.parseStdout('[2024-01-01T12:05:00] [INFO] [Runner] GOTO stage-b → end status="success"');

    // Simulate process exit with code 0
    mockChild.emit('close', 0);

    // Should be Completed
    assert.strictEqual(pipelineService.getState(), PipelineState.Completed);
  });

  /**
   * Test: stop() returns a Promise and can be awaited
   */
  test('stop() returns a Promise and can be awaited', async () => {
    await pipelineService.start();

    const result = pipelineService.stop();
    assert.ok(result instanceof Promise);
    await result;

    assert.strictEqual(pipelineService.getState(), PipelineState.Idle);
  });

  /**
   * Test: stop() on non-Windows uses SIGTERM (no forceKillIfAlive)
   */
  test('stop() on non-Windows uses SIGTERM without force kill', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux' });

    await pipelineService.start();
    await pipelineService.stop();

    assert.strictEqual(mockChild.killed, true);

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  /**
   * Test: start() emits stateChange with Running state
   */
  test('start() emits stateChange with Running state', async () => {
    const stateChanges: PipelineState[] = [];
    pipelineService.onStateChange((state) => {
      stateChanges.push(state);
    });

    await pipelineService.start();

    assert.strictEqual(stateChanges.length, 1);
    assert.strictEqual(stateChanges[0], PipelineState.Running);
    assert.strictEqual(pipelineService.getState(), PipelineState.Running);
  });

  /**
   * Test: stop() emits stateChange with Idle state
   */
  test('stop() emits stateChange with Idle state', async () => {
    const stateChanges: PipelineState[] = [];
    pipelineService.onStateChange((state) => {
      stateChanges.push(state);
    });

    await pipelineService.start();
    const afterStart = stateChanges.length;
    assert.strictEqual(stateChanges[afterStart - 1], PipelineState.Running);

    await pipelineService.stop();
    const afterStop = stateChanges.length;
    assert.strictEqual(stateChanges[afterStop - 1], PipelineState.Idle);
    assert.strictEqual(pipelineService.getState(), PipelineState.Idle);
  });


});
