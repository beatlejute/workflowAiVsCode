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
import { PipelineService, PipelineState, SpawnFunction } from '../../services/pipeline-service';

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

suite('PipelineService Suite', () => {

  let pipelineService: PipelineService;
  let mockChild: MockChildProcess;

  setup(() => {
    mockChild = new MockChildProcess();
    
    // Create mock spawn function
    const mockSpawn: SpawnFunction = () => mockChild as any;
    
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
    
    await pipelineService.start('single-cycle');
    
    assert.strictEqual(pipelineService.getState(), PipelineState.Running);
  });

  /**
   * Test: start() throws if already running
   */
  test('start() throws if already running', async () => {
    await pipelineService.start('single-cycle');
    
    await assert.rejects(
      async () => pipelineService.start('single-cycle'),
      /Pipeline is already running/
    );
  });

  /**
   * Test: stop() performs graceful shutdown
   */
  test('stop() performs graceful shutdown', async () => {
    await pipelineService.start('single-cycle');
    
    pipelineService.stop();
    
    assert.strictEqual(mockChild.killed, true);
    assert.strictEqual(pipelineService.getState(), PipelineState.Idle);
  });

  /**
   * Test: stop() when no process is running
   */
  test('stop() when no process is running does nothing', () => {
    // Should not throw
    pipelineService.stop();
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
    
    await pipelineService.start('single-cycle');
    
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
    
    await pipelineService.start('single-cycle');
    
    // Simulate stdout output
    mockChild.stdout.emit('data', Buffer.from('test log line'));
    
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0], 'test log line');
  });

  /**
   * Test: process exit with code 0 sets state to completed
   */
  test('process exit with code 0 sets state to completed', async () => {
    await pipelineService.start('single-cycle');
    
    // Simulate process exit
    mockChild.emit('close', 0);
    
    assert.strictEqual(pipelineService.getState(), PipelineState.Completed);
  });

  /**
   * Test: process exit with non-zero code sets state to error
   */
  test('process exit with non-zero code sets state to error', async () => {
    await pipelineService.start('single-cycle');
    
    // Simulate process exit with error
    mockChild.emit('close', 1);
    
    assert.strictEqual(pipelineService.getState(), PipelineState.Error);
  });

  /**
   * Test: process error sets state to error
   */
  test('process error sets state to error', async () => {
    await pipelineService.start('single-cycle');
    
    // Simulate process error
    mockChild.emit('error', new Error('spawn failed'));
    
    assert.strictEqual(pipelineService.getState(), PipelineState.Error);
  });

  /**
   * Test: parseLine [GOTO] pattern
   */
  test('parseLine [GOTO] pattern extracts stage and elapsed', () => {
    // Access private method via any cast for testing
    const service = pipelineService as any;
    
    const result = service.parseLine('[GOTO] validate-deps (elapsed: 1.2s)');
    
    assert.strictEqual(result.type, 'goto');
    assert.strictEqual(result.stage, 'validate-deps');
    assert.strictEqual(result.elapsed, '1.2s');
  });

  /**
   * Test: parseLine [GOTO] without elapsed
   */
  test('parseLine [GOTO] without elapsed', () => {
    const service = pipelineService as any;
    
    const result = service.parseLine('[GOTO] execute-task');
    
    assert.strictEqual(result.type, 'goto');
    assert.strictEqual(result.stage, 'execute-task');
    assert.strictEqual(result.elapsed, undefined);
  });

  /**
   * Test: parseLine [INFO] pattern extracts agent, ticket, retry
   */
  test('parseLine [INFO] pattern extracts agent, ticket, retry', () => {
    const service = pipelineService as any;
    
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
    const service = pipelineService as any;
    
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
    const service = pipelineService as any;
    
    const result = service.parseLine('[CTX] current-stage: execute-task');
    
    assert.strictEqual(result.type, 'ctx');
    assert.strictEqual(result.stage, 'current-stage');
    assert.strictEqual(result.elapsed, 'execute-task');
  });

  /**
   * Test: parseLine unknown format falls back to raw
   */
  test('parseLine unknown format falls back to raw', () => {
    const service = pipelineService as any;
    
    const result = service.parseLine('Some random log output');
    
    assert.strictEqual(result.type, 'raw');
    assert.strictEqual(result.raw, 'Some random log output');
    assert.strictEqual(result.stage, undefined);
  });

  /**
   * Test: parseStdout updates currentStage from [GOTO]
   */
  test('parseStdout updates currentStage from [GOTO]', async () => {
    await pipelineService.start('single-cycle');
    
    // Access private method via any cast for testing
    const service = pipelineService as any;
    service.parseStdout('[GOTO] validate-deps');
    
    assert.strictEqual(service.getCurrentStage(), 'validate-deps');
  });

  /**
   * Test: parseStdout updates currentAgent and currentTicket from [INFO]
   */
  test('parseStdout updates currentAgent and currentTicket from [INFO]', async () => {
    await pipelineService.start('single-cycle');
    
    const service = pipelineService as any;
    service.parseStdout('[INFO] agent: qwen-code, ticket: IMPL-014');
    
    assert.strictEqual(service.getCurrentAgent(), 'qwen-code');
    assert.strictEqual(service.getCurrentTicket(), 'IMPL-014');
  });

  /**
   * Test: parseStdout updates retryCount from [INFO]
   */
  test('parseStdout updates retryCount from [INFO]', async () => {
    await pipelineService.start('single-cycle');
    
    const service = pipelineService as any;
    service.parseStdout('[INFO] retry: 2/5');
    
    assert.strictEqual(service.getRetryCount(), 2);
  });

  /**
   * Test: start with continuous mode passes only run arg
   */
  test('start with continuous mode passes only run arg', async () => {
    let capturedArgs: readonly string[] | undefined;

    const mockSpawn: SpawnFunction = (command, args) => {
      capturedArgs = args;
      return mockChild as any;
    };

    const service = new PipelineService(mockSpawn);
    await service.start('continuous');

    assert.deepStrictEqual(capturedArgs, ['run']);
    service.dispose();
  });

  /**
   * Test: start with n-tasks mode passes only run arg
   */
  test('start with n-tasks mode passes only run arg', async () => {
    let capturedArgs: readonly string[] | undefined;

    const mockSpawn: SpawnFunction = (command, args) => {
      capturedArgs = args;
      return mockChild as any;
    };

    const service = new PipelineService(mockSpawn);
    await service.start('n-tasks', 5);

    assert.deepStrictEqual(capturedArgs, ['run']);
    service.dispose();
  });

  /**
   * Test: spawnWithFallback uses primary command when available
   */
  test('spawnWithFallback uses primary command when available', async () => {
    let capturedCommand: string | undefined;

    const mockSpawn: SpawnFunction = (command, args) => {
      capturedCommand = command;
      return mockChild as any;
    };

    const service = new PipelineService(mockSpawn);
    await service.start('single-cycle');

    assert.strictEqual(capturedCommand, 'workflow');
    service.dispose();
  });

  /**
   * Test: spawnWithFallback falls back to workflow-ai on ENOENT
   */
  test('spawnWithFallback falls back to workflow-ai on ENOENT', async () => {
    const commands: string[] = [];

    const mockSpawn: SpawnFunction = (command, args) => {
      commands.push(command);
      const mock = new MockChildProcess();
      // Simulate ENOENT on first call (workflow)
      if (command === 'workflow') {
        setTimeout(() => mock.emit('error', Object.assign(new Error('spawn failed'), { code: 'ENOENT' })), 0);
      }
      return mock as any;
    };

    const service = new PipelineService(mockSpawn);
    await service.start('single-cycle');

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
    
    await pipelineService.start('single-cycle');
    
    // Simulate stderr output
    mockChild.stderr.emit('data', Buffer.from('error message'));
    
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0], '[ERROR] error message');
  });

  /**
   * Test: dispose stops pipeline and removes listeners
   */
  test('dispose stops pipeline and removes listeners', async () => {
    await pipelineService.start('single-cycle');
    
    pipelineService.dispose();
    
    assert.strictEqual(pipelineService.getState(), PipelineState.Idle);
    assert.strictEqual(pipelineService.listenerCount('stateChange'), 0);
    assert.strictEqual(pipelineService.listenerCount('log'), 0);
  });

});
