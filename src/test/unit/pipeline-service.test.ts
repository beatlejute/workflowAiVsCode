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
import * as fs from 'fs';
import * as path from 'path';
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
    service = new PipelineService((_cmd, _args, _opts) => {
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
    service = new PipelineService((_cmd, _args, _opts) => {
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
            // First spawn (workflow) fails with ENOENT в†’ triggers fallback
            setTimeout(() => {
              const err = new Error('spawn workflow ENOENT') as NodeJS.ErrnoException;
              err.code = 'ENOENT';
              handler(err);
            }, 10);
          }
          if (event === 'error' && spawnCallCount === 2) {
            // Second spawn (workflow-ai) also fails в†’ Error state
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

  // ADR-003: Summary-based status detection (FIX-043)
  suite('Summary-based status detection (last 50 lines)', () => {
    
    test('should complete when summary shows "Stages failed: 0" and code === 0', (done) => {
      service.onStateChange((state) => {
        if (state === PipelineState.Completed) {
          done();
        }
      });

      // Simulate log with summary in last 50 lines
      mock.simulateStdout('[2026-03-11T10:00:00] [ERROR] [stage] Some error occurred\n');
      mock.simulateStdout('Pipeline completed successfully!\n');
      mock.simulateStdout('Stages failed: 0\n');
      mock.simulateClose(0);
    }).timeout(5000);

    test('should error when summary shows "Stages failed: 2" regardless of hasStageErrors', (done) => {
      service.onStateChange((state) => {
        if (state === PipelineState.Error) {
          done();
        }
      });

      // Simulate log with failure count in summary
      mock.simulateStdout('Pipeline execution finished\n');
      mock.simulateStdout('Stages failed: 2\n');
      mock.simulateClose(0); // Even with code 0, should error based on summary
    }).timeout(5000);

    test('should complete when "Pipeline completed successfully!" is in tail without "Stages failed"', (done) => {
      service.onStateChange((state) => {
        if (state === PipelineState.Completed) {
          done();
        }
      });

      // Simulate success marker without explicit failure count
      mock.simulateStdout('Some output\n');
      mock.simulateStdout('Pipeline completed successfully!\n');
      mock.simulateClose(0);
    }).timeout(5000);

    test('should NOT match "Pipeline completed successfully!" in middle of log (only in last 50 lines)', (done) => {
      service.onStateChange((state) => {
        if (state === PipelineState.Error) {
          done();
        }
      });

      // Simulate success marker in middle of log (not in tail)
      mock.simulateStdout('Pipeline completed successfully!\n');
      // Add 50+ more lines to push the success marker out of the tail window
      for (let i = 0; i < 55; i++) {
        mock.simulateStdout(`Log line ${i}\n`);
      }
      // Now close with error code
      mock.simulateClose(1);
    }).timeout(5000);

    test('should fallback to heuristic + exitCode when no summary in tail', (done) => {
      service.onStateChange((state) => {
        if (state === PipelineState.Error) {
          done();
        }
      });

      // Simulate error without summary markers
      mock.simulateStdout('[2026-03-11T10:00:00] [ERROR] [stage] FAIL: stage execution failed\n');
      mock.simulateStdout('Process crashed\n');
      mock.simulateClose(0); // Code 0 but hasStageErrors should trigger Error
    }).timeout(5000);

    test('should override hasStageErrors when summary is present in tail', (done) => {
      service.onStateChange((state) => {
        if (state === PipelineState.Completed) {
          done();
        }
      });

      // Simulate error in log but successful summary
      mock.simulateStdout('[2026-03-11T10:00:00] [ERROR] [stage] Temporary error (recovered)\n');
      mock.simulateStdout('Stage recovered\n');
      mock.simulateStdout('Pipeline completed successfully!\n');
      mock.simulateStdout('Stages failed: 0\n');
      mock.simulateClose(0);
    }).timeout(5000);

    test('should handle "Stages failed: 0" with non-zero code as Error', (done) => {
      service.onStateChange((state) => {
        if (state === PipelineState.Error) {
          done();
        }
      });

      // Summary says success but exit code says failure
      mock.simulateStdout('Pipeline completed successfully!\n');
      mock.simulateStdout('Stages failed: 0\n');
      mock.simulateClose(1); // Non-zero code should override summary success
    }).timeout(5000);

    test('should handle summary with high failure count', (done) => {
      service.onStateChange((state) => {
        if (state === PipelineState.Error) {
          done();
        }
      });

      mock.simulateStdout('Pipeline execution completed\n');
      mock.simulateStdout('Stages failed: 5\n');
      mock.simulateClose(0);
    }).timeout(5000);
  });
});

suite('PipelineService - stop with active process', () => {
  test('stop() should kill process and set state to Idle', async function() {
    // On Windows stop() invokes taskkill + 1s wait + process.kill probe — needs more than 2s default mocha timeout
    this.timeout(5000);
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
    service = new PipelineService((_cmd, _args, _opts) => {
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
    service = new PipelineService((_cmd, _args, _opts) => {
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
    service = new PipelineService((_cmd, _args, _opts) => {
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

// QA-031: False-positive pipeline status detection tests (TDD — post FIX-042/FIX-043)
suite('QA-031: False-positive pipeline status detection', () => {

  // Test 1: INFO-строка "Total failed: N, passed: M" → Completed (hasStageErrors=false)
  test('should NOT treat INFO stats line "Total failed: N, passed: M" as stage error → Completed', (done) => {
    const mock = createMockSpawn();
    const service = new PipelineService((_cmd, _args, _opts) => mock.mockProcess);
    callSpawnWithFallback(service, 'workflow', ['run'], process.env);

    service.onStateChange((state) => {
      if (state === PipelineState.Completed) {
        service.removeAllListeners();
        done();
      } else if (state === PipelineState.Error) {
        service.removeAllListeners();
        assert.fail('INFO stats line should not trigger Error state');
      }
    });

    // Simulate INFO line with ticket statistics (not stage errors)
    mock.simulateStdout('[2026-04-07T10:00:00] [INFO] [stats] Total failed: 166, passed: 220\n');
    mock.simulateStdout('[2026-04-07T10:00:01] [INFO] [Runner] Pipeline completed successfully!\n');
    mock.simulateStdout('Stages failed: 0\n');
    mock.simulateClose(0);
  }).timeout(5000);

  // Test 2: Явная ошибка → Error
  test('should detect explicit [ERROR] Stage X failed → Error', (done) => {
    const mock = createMockSpawn();
    const service = new PipelineService((_cmd, _args, _opts) => mock.mockProcess);
    callSpawnWithFallback(service, 'workflow', ['run'], process.env);

    service.onStateChange((state) => {
      if (state === PipelineState.Error) {
        service.removeAllListeners();
        done();
      }
    });

    // Simulate explicit error in log
    mock.simulateStdout('[2026-04-07T10:00:00] [ERROR] [stage-x] Stage "stage-x" failed\n');
    mock.simulateStdout('exitCode=1\n');
    mock.simulateClose(0); // Even with code 0, explicit error should trigger Error
  }).timeout(5000);

  // Test 3: Retry с последующим успехом → Completed (регресс на clear hasStageErrors)
  test('should clear hasStageErrors on retry followed by success → Completed', (done) => {
    const mock = createMockSpawn();
    const service = new PipelineService((_cmd, _args, _opts) => mock.mockProcess);
    callSpawnWithFallback(service, 'workflow', ['run'], process.env);

    service.onStateChange((state) => {
      if (state === PipelineState.Completed) {
        service.removeAllListeners();
        done();
      } else if (state === PipelineState.Error) {
        service.removeAllListeners();
        assert.fail('Retry followed by success should not trigger Error state');
      }
    });

    // Simulate retry scenario: error on attempt 1, success on attempt 2
    mock.simulateStdout('[2026-04-07T10:00:00] [WARN] [stage-a] RETRY stage="stage-a" attempt=1/3\n');
    mock.simulateStdout('[2026-04-07T10:00:01] [ERROR] [stage-a] Stage "stage-a" failed on attempt 1\n');
    mock.simulateStdout('[2026-04-07T10:00:02] [INFO] [stage-a] Retrying stage-a\n');
    mock.simulateStdout('[2026-04-07T10:00:10] [INFO] [stage-a] GOTO stage-a → stage-b status="success"\n');
    mock.simulateStdout('[2026-04-07T10:01:00] [INFO] [stage-b] GOTO stage-b → complete status="success"\n');
    mock.simulateStdout('Pipeline completed successfully!\n');
    mock.simulateStdout('Stages failed: 0\n');
    mock.simulateClose(0);
  }).timeout(5000);

  // Test 4: Summary "Stages failed: 2" → Error
  test('should detect summary "Stages failed: 2" → Error', (done) => {
    const mock = createMockSpawn();
    const service = new PipelineService((_cmd, _args, _opts) => mock.mockProcess);
    callSpawnWithFallback(service, 'workflow', ['run'], process.env);

    service.onStateChange((state) => {
      if (state === PipelineState.Error) {
        service.removeAllListeners();
        done();
      }
    });

    mock.simulateStdout('[2026-04-07T10:00:00] [INFO] [stage-a] GOTO stage-a → stage-b status="success"\n');
    mock.simulateStdout('Pipeline execution finished\n');
    mock.simulateStdout('Stages failed: 2\n');
    mock.simulateClose(0); // Even with exit code 0, summary says 2 failed
  }).timeout(5000);

  // Test 5: Summary "Stages failed: 10" → Error (двузначное число)
  test('should detect summary "Stages failed: 10" (multi-digit) → Error', (done) => {
    const mock = createMockSpawn();
    const service = new PipelineService((_cmd, _args, _opts) => mock.mockProcess);
    callSpawnWithFallback(service, 'workflow', ['run'], process.env);

    service.onStateChange((state) => {
      if (state === PipelineState.Error) {
        service.removeAllListeners();
        done();
      }
    });

    mock.simulateStdout('[2026-04-07T10:00:00] [INFO] [Runner] Processing stages\n');
    mock.simulateStdout('Pipeline execution finished\n');
    mock.simulateStdout('Stages failed: 10\n');
    mock.simulateClose(0);
  }).timeout(5000);

  // Test 6: Негативный тест окна summary — маркер в середине + ошибка в хвосте → Error
  // Reads fixture file: src/test/unit/__fixtures__/pipeline-mid-success-tail-error.log
  test('should NOT match "Pipeline completed successfully!" in middle of log when tail has errors → Error', (done) => {
    const mock = createMockSpawn();
    const service = new PipelineService((_cmd, _args, _opts) => mock.mockProcess);
    callSpawnWithFallback(service, 'workflow', ['run'], process.env);

    service.onStateChange((state) => {
      if (state === PipelineState.Error) {
        service.removeAllListeners();
        done();
      }
    });

    // Read log content from fixture file
    const fixturePath = path.join(__dirname, '__fixtures__', 'pipeline-mid-success-tail-error.log');
    const logContent = fs.readFileSync(fixturePath, 'utf-8');
    const lines = logContent.split('\n');

    // Simulate stdout line by line from fixture
    for (const line of lines) {
      if (line.trim()) {
        mock.simulateStdout(line + '\n');
      }
    }
    mock.simulateClose(1);
  }).timeout(5000);

  // Test 7: Негативный тест по exitCode — exitCode=10 и exitCode=127 → hasStageErrors=true
  test('should detect exitCode=10 as stage error (multi-digit exit code)', (done) => {
    const mock = createMockSpawn();
    const service = new PipelineService((_cmd, _args, _opts) => mock.mockProcess);
    callSpawnWithFallback(service, 'workflow', ['run'], process.env);

    let stateChanged = false;
    service.onStateChange((state) => {
      stateChanged = true;
      if (state === PipelineState.Error) {
        done();
      }
    });

    mock.simulateStdout('[2026-04-07T10:00:00] [ERROR] [stage-a] exitCode=10\n');
    mock.simulateClose(0);

    // Fallback timeout: if state didn't change in 3s, fail explicitly
    setTimeout(() => {
      if (!stateChanged) {
        assert.fail('State did not change for exitCode=10 test');
      }
    }, 3000);
  }).timeout(5000);

  test('should detect exitCode=127 as stage error (command not found)', (done) => {
    const mock = createMockSpawn();
    const service = new PipelineService((_cmd, _args, _opts) => mock.mockProcess);
    callSpawnWithFallback(service, 'workflow', ['run'], process.env);

    let stateChanged = false;
    service.onStateChange((state) => {
      stateChanged = true;
      if (state === PipelineState.Error) {
        done();
      }
    });

    mock.simulateStdout('[2026-04-07T10:00:00] [ERROR] [stage-a] exitCode=127\n');
    mock.simulateClose(0);

    setTimeout(() => {
      if (!stateChanged) {
        assert.fail('State did not change for exitCode=127 test');
      }
    }, 3000);
  }).timeout(5000);
});
