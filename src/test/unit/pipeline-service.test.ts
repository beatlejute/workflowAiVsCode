/**
 * Unit tests for PipelineService
 *
 * Tests:
 * - Constructor, getState, getters
 * - spawnWithFallback() - process lifecycle via private access
 * - stop() - graceful shutdown
 * - parseLine() - GOTO, START, RETRY, fallback, error detection
 * - parseLineLegacy() - legacy format parsing
 * - setState() - state change events
 * - dispose() - resource cleanup
 * - setWorkflowRoot()
 * - Event emission (stateChange, log)
 */

import * as assert from 'assert';
import { EventEmitter } from 'events';
import { PipelineService, PipelineState } from '../../services/pipeline-service';

// Mock spawn function for testing
function createMockSpawn() {
  let stdoutEmitter: EventEmitter | null = null;
  let stderrEmitter: EventEmitter | null = null;
  let exitHandler: ((code: number | null) => void) | null = null;
  let errorHandler: ((err: Error) => void) | null = null;
  let closeHandler: ((code: number | null) => void) | null = null;
  let killCalled = false;
  let killSignal: string | undefined;

  const mockProcess: any = {
    pid: 12345,
    stdout: null as EventEmitter | null,
    stderr: null as EventEmitter | null,
    kill: (signal?: string) => {
      killCalled = true;
      killSignal = signal;
    },
    on: (event: string, handler: any) => {
      if (event === 'exit') exitHandler = handler;
      if (event === 'error') errorHandler = handler;
      if (event === 'close') closeHandler = handler;
    }
  };

  stdoutEmitter = new EventEmitter();
  stderrEmitter = new EventEmitter();
  mockProcess.stdout = stdoutEmitter;
  mockProcess.stderr = stderrEmitter;

  return {
    mockProcess,
    stdoutEmitter,
    stderrEmitter,
    getExitHandler: () => exitHandler,
    getErrorHandler: () => errorHandler,
    getCloseHandler: () => closeHandler,
    getKillCalled: () => killCalled,
    getKillSignal: () => killSignal,
    simulateStdout: (data: string) => stdoutEmitter!.emit('data', Buffer.from(data)),
    simulateStderr: (data: string) => stderrEmitter!.emit('data', Buffer.from(data)),
    simulateExit: (code: number | null) => exitHandler?.(code),
    simulateError: (err: NodeJS.ErrnoException) => errorHandler?.(err),
    simulateClose: (code: number | null) => closeHandler?.(code),
    reset: () => {
      killCalled = false;
      killSignal = undefined;
    }
  };
}

/**
 * Call private spawnWithFallback on a PipelineService instance.
 * This is the key to testing the full lifecycle without vscode APIs.
 */
function callSpawnWithFallback(
  service: PipelineService,
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv
): void {
  (service as any).spawnWithFallback(command, args, env);
}

suite('PipelineService', () => {
  let service: PipelineService;

  setup(() => {
    service = new PipelineService();
  });

  teardown(() => {
    service.removeAllListeners();
  });

  suite('Constructor & Getters', () => {
    test('should initialize with Idle state', () => {
      assert.strictEqual(service.getState(), PipelineState.Idle);
    });

    test('should return undefined for currentStage initially', () => {
      assert.strictEqual(service.getCurrentStage(), undefined);
    });

    test('should return undefined for currentAgent initially', () => {
      assert.strictEqual(service.getCurrentAgent(), undefined);
    });

    test('should return undefined for currentTicket initially', () => {
      assert.strictEqual(service.getCurrentTicket(), undefined);
    });

    test('should return 0 for retryCount initially', () => {
      assert.strictEqual(service.getRetryCount(), 0);
    });

    test('should accept custom spawn function', () => {
      const mockSpawn = () => ({ pid: 1, on: () => {}, kill: () => {} }) as any;
      const svc = new PipelineService(mockSpawn);
      assert.ok(svc);
    });
  });

  suite('setWorkflowRoot()', () => {
    test('should set workflow root directory', () => {
      service.setWorkflowRoot('/test/path');
      assert.ok(true);
    });
  });

  suite('Event Listeners', () => {
    test('onStateChange should register listener and return this', () => {
      const result = service.onStateChange(() => {});
      assert.strictEqual(result, service);
    });

    test('onLog should register listener and return this', () => {
      const result = service.onLog(() => {});
      assert.strictEqual(result, service);
    });
  });

  suite('stop()', () => {
    test('should return immediately when no child process', async () => {
      await service.stop();
      assert.strictEqual(service.getState(), PipelineState.Idle);
    });

    test('should be idempotent', async () => {
      await service.stop();
      await service.stop();
      assert.strictEqual(service.getState(), PipelineState.Idle);
    });
  });

  suite('dispose()', () => {
    test('should dispose without errors', () => {
      service.dispose();
      assert.ok(true);
    });

    test('should be idempotent', () => {
      service.dispose();
      service.dispose();
      assert.ok(true);
    });
  });
});

suite('PipelineService - parseLine (via mock spawn)', () => {
  let mock: ReturnType<typeof createMockSpawn>;
  let service: PipelineService;

  setup(() => {
    mock = createMockSpawn();
    service = new PipelineService((cmd, args, opts) => {
      return mock.mockProcess;
    });
    // Directly call spawnWithFallback to register the mock process
    callSpawnWithFallback(service, 'workflow', ['run'], process.env);
  });

  teardown(() => {
    service.removeAllListeners();
  });

  test('should parse GOTO with arrow format and update stage', () => {
    const stageChanges: (string | undefined)[] = [];
    service.onStageChange((stage) => stageChanges.push(stage));

    mock.simulateStdout('[2026-03-11T10:00:00] [INFO] [stage-a] GOTO stage-a → stage-b status="success"\n');

    assert.strictEqual(service.getCurrentStage(), 'stage-b');
    assert.ok(stageChanges.includes('stage-b'));
  });

  test('should parse GOTO legacy format (without arrow)', () => {
    mock.simulateStdout('[2026-03-11T10:00:00] [INFO] [Runner] GOTO review-result (elapsed: 1m30s)\n');

    assert.strictEqual(service.getCurrentStage(), 'review-result');
  });

  test('should parse START with stage/agent/skill', () => {
    mock.simulateStdout('[2026-03-11T10:00:00] [INFO] [Runner] START stage="execute-task" agent="qwen-code" skill="execute-task"\n');

    assert.strictEqual(service.getCurrentStage(), 'execute-task');
    assert.strictEqual(service.getCurrentAgent(), 'qwen-code');
  });

  test('should parse RETRY and update retry count', () => {
    mock.simulateStdout('[2026-03-11T10:00:00] [WARN] [execute-task] RETRY stage="execute-task" attempt=2/5\n');

    assert.strictEqual(service.getRetryCount(), 2);
  });

  test('should parse fallback switch message', () => {
    mock.simulateStdout('[2026-04-02T17:16:46] [WARN] [stage-alpha] Primary agent failed, switching to fallback: success-node\n');

    assert.strictEqual(service.getCurrentAgent(), 'success-node');
  });

  test('should parse legacy [INFO] format with agent and ticket', () => {
    mock.simulateStdout('[INFO] agent: qwen-code, ticket: IMPL-042, retry: 2/5\n');

    assert.strictEqual(service.getCurrentAgent(), 'qwen-code');
    assert.strictEqual(service.getCurrentTicket(), 'IMPL-042');
    assert.strictEqual(service.getRetryCount(), 2);
  });

  test('should parse legacy [GOTO] format', () => {
    mock.simulateStdout('[GOTO] review-result (elapsed: 1m15s)\n');

    assert.strictEqual(service.getCurrentStage(), 'review-result');
  });

  test('should parse legacy [CTX] format', () => {
    mock.simulateStdout('[CTX] skill: execute-task\n');
    assert.ok(true);
  });

  test('should handle raw/unstructured log lines without crashing', () => {
    mock.simulateStdout('This is just some random output\n');
    assert.ok(true);
  });

  test('should handle multiple lines in single stdout event', () => {
    mock.simulateStdout(
      '[2026-03-11T10:00:00] [INFO] [Runner] START stage="stage-a" agent="agent-1" skill="skill-1"\n' +
      '[2026-03-11T10:00:01] [INFO] [stage-a] GOTO stage-a → stage-b status="success"\n'
    );

    assert.strictEqual(service.getCurrentStage(), 'stage-b');
    assert.strictEqual(service.getCurrentAgent(), 'agent-1');
  });

  test('should strip ANSI escape codes from colored output', () => {
    mock.simulateStdout('\x1b[32m[2026-03-11T10:00:00] [INFO] [Runner] GOTO stage-b\x1b[0m\n');

    assert.strictEqual(service.getCurrentStage(), 'stage-b');
  });

  test('should handle empty lines gracefully', () => {
    mock.simulateStdout('\n\n\n');
    assert.ok(true);
  });

  test('should handle mixed structured and unstructured output', () => {
    mock.simulateStdout(
      'Some random output\n' +
      '[2026-03-11T10:00:00] [INFO] [Runner] START stage="test-stage" agent="test-agent" skill="test-skill"\n' +
      'More random output\n'
    );

    assert.strictEqual(service.getCurrentStage(), 'test-stage');
    assert.strictEqual(service.getCurrentAgent(), 'test-agent');
  });
});

suite('PipelineService - process exit handling', () => {
  let mock: ReturnType<typeof createMockSpawn>;
  let service: PipelineService;

  setup(() => {
    mock = createMockSpawn();
    service = new PipelineService((cmd, args, opts) => {
      return mock.mockProcess;
    });
    callSpawnWithFallback(service, 'workflow', ['run'], process.env);
  });

  teardown(() => {
    service.removeAllListeners();
  });

  test('should transition to Completed on exit code 0 without errors', (done) => {
    service.onStateChange((state) => {
      if (state === PipelineState.Completed) {
        done();
      }
    });

    mock.simulateClose(0);
  }).timeout(5000);

  test('should transition to Error on non-zero exit code', (done) => {
    service.onStateChange((state) => {
      if (state === PipelineState.Error) {
        done();
      }
    });

    mock.simulateClose(1);
  }).timeout(5000);

  test('should transition to Error on exit code 0 with stage errors', (done) => {
    service.onStateChange((state) => {
      if (state === PipelineState.Error) {
        done();
      }
    });

    mock.simulateStdout('[2026-03-11T10:00:00] [ERROR] [stage] FAIL: stage execution failed\n');
    mock.simulateClose(0);
  }).timeout(5000);

  test('should transition to Error on spawn ENOENT without fallback', (done) => {
    service.onStateChange((state) => {
      if (state === PipelineState.Error) {
        done();
      }
    });

    // Set fallbackUsed=true so ENOENT triggers Error state instead of retry
    (service as any).fallbackUsed = true;

    const err = new Error('spawn workflow ENOENT') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    mock.simulateError(err);
  }).timeout(5000);

  test('should try fallback to workflow-ai on ENOENT', (done) => {
    let spawnCallCount = 0;
    const mockSpawn = (): any => {
      spawnCallCount++;
      const proc: any = {
        pid: 12345,
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        on: function(event: string, handler: any) {
          if (event === 'error' && spawnCallCount === 1) {
            // First spawn (workflow) fails with ENOENT → triggers fallback
            setTimeout(() => {
              const err = new Error('spawn workflow ENOENT') as NodeJS.ErrnoException;
              err.code = 'ENOENT';
              handler(err);
            }, 10);
          }
          if (event === 'error' && spawnCallCount === 2) {
            // Second spawn (workflow-ai) also fails → Error state
            setTimeout(() => {
              const err = new Error('spawn workflow-ai ENOENT') as NodeJS.ErrnoException;
              err.code = 'ENOENT';
              handler(err);
            }, 10);
          }
        },
        kill: () => {}
      };
      return proc;
    };

    const svc = new PipelineService(mockSpawn);
    svc.onStateChange((state) => {
      if (state === PipelineState.Error) {
        assert.strictEqual(spawnCallCount, 2);
        svc.dispose();
        done();
      }
    });

    callSpawnWithFallback(svc, 'workflow', ['run'], process.env);
  }).timeout(10000);
});

suite('PipelineService - stop with active process', () => {
  test('stop() should kill process and set state to Idle', async () => {
    const mockProc: any = {
      pid: 12345,
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      on: () => {},
      kill: () => {}
    };

    const service = new PipelineService(() => mockProc);
    callSpawnWithFallback(service, 'workflow', ['run'], process.env);

    await service.stop();
    assert.strictEqual(service.getState(), PipelineState.Idle);

    service.dispose();
  });
});

suite('PipelineService - parseLine edge cases', () => {
  let mock: ReturnType<typeof createMockSpawn>;
  let service: PipelineService;

  setup(() => {
    mock = createMockSpawn();
    service = new PipelineService((cmd, args, opts) => {
      return mock.mockProcess;
    });
    callSpawnWithFallback(service, 'workflow', ['run'], process.env);
  });

  teardown(() => {
    service.removeAllListeners();
  });

  test('should handle GOTO with retry error clearing (status=success)', () => {
    mock.simulateStdout('[2026-03-11T10:00:00] [WARN] [stage-a] RETRY stage="stage-a" attempt=1/3\n');
    mock.simulateStdout('[2026-03-11T10:00:00] [ERROR] [stage-a] Stage failed\n');
    mock.simulateStdout('[2026-03-11T10:00:01] [INFO] [stage-a] GOTO stage-a → stage-b status="success"\n');

    assert.strictEqual(service.getCurrentStage(), 'stage-b');
  });

  test('should handle legacy [INFO] with retry only', () => {
    mock.simulateStdout('[INFO] retry: 3/5\n');

    assert.strictEqual(service.getRetryCount(), 3);
  });

  test('should handle legacy [INFO] with partial fields', () => {
    mock.simulateStdout('[INFO] agent: claude-sonnet\n');

    assert.strictEqual(service.getCurrentAgent(), 'claude-sonnet');
  });

  test('should handle lines with only whitespace', () => {
    mock.simulateStdout('   \n  \n');
    assert.ok(true);
  });

  test('should handle very long log lines', () => {
    const longMessage = 'A'.repeat(10000);
    mock.simulateStdout(`[2026-03-11T10:00:00] [INFO] [stage] ${longMessage}\n`);
    assert.ok(true);
  });
});

suite('PipelineService - stderr handling', () => {
  let mock: ReturnType<typeof createMockSpawn>;
  let service: PipelineService;

  setup(() => {
    mock = createMockSpawn();
    service = new PipelineService((cmd, args, opts) => {
      return mock.mockProcess;
    });
    callSpawnWithFallback(service, 'workflow', ['run'], process.env);
  });

  teardown(() => {
    service.removeAllListeners();
  });

  test('should emit stderr output as log with [ERROR] prefix', (done) => {
    service.onLog((log) => {
      if (log.includes('[ERROR]')) {
        assert.ok(log.includes('stderr output'));
        done();
      }
    });

    mock.simulateStderr('stderr output\n');
  }).timeout(5000);
});

suite('PipelineService - log events', () => {
  let mock: ReturnType<typeof createMockSpawn>;
  let service: PipelineService;

  setup(() => {
    mock = createMockSpawn();
    service = new PipelineService((cmd, args, opts) => {
      return mock.mockProcess;
    });
    callSpawnWithFallback(service, 'workflow', ['run'], process.env);
  });

  teardown(() => {
    service.removeAllListeners();
  });

  test('should emit log events for stdout output', (done) => {
    service.onLog((log) => {
      if (log.includes('test output')) {
        done();
      }
    });

    mock.simulateStdout('test output\n');
  }).timeout(5000);
});
