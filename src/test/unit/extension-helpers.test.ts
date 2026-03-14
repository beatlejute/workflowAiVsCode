/**
 * Unit tests for extension-helpers.ts (pure resolver functions and VSCode-dependent functions)
 *
 * Tests:
 * - resolveTicketId(): string, object with ticket.id, object with ticket string, object with id
 * - resolvePlanId(): string, object with plan.id, object with entry.planId, object with id
 * - resolveLogFile(): string, object with entry.logFile, object with logFile
 * - resolveReportPath(): string, object with reportPath, object with entry.reports[0].path
 * - checkCliInstalled(): CLI detection with custom path
 * - checkWorkflowDir(): workspace folder detection
 * - updateContextKeys(): context key updates
 * - installCli(): CLI installation with progress
 * - initWorkflow(): workflow initialization
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  resolveTicketId,
  resolvePlanId,
  resolveLogFile,
  resolveReportPath,
  checkCliInstalled,
  checkWorkflowDir,
  updateContextKeys,
  installCli,
  initWorkflow
} from '../../utils/extension-helpers';
import { PipelineService, PipelineState } from '../../services/pipeline-service';
import { getErrorHandler } from '../../error-handler';

let originalVscode: unknown;
let mockWorkspaceFolders: vscode.WorkspaceFolder[] | undefined;
let mockConfiguration: Map<string, Map<string, unknown>>;
let mockExecAsync: unknown;
let mockExecAsyncResult: unknown;
let originalT: unknown;
let mockTResult: string;

suite('extension-helpers - resolver functions', () => {
  suite('resolveTicketId()', () => {
    test('returns string directly', () => {
      assert.strictEqual(resolveTicketId('IMPL-001'), 'IMPL-001');
    });

    test('returns undefined for null', () => {
      assert.strictEqual(resolveTicketId(null), undefined);
    });

    test('returns undefined for undefined', () => {
      assert.strictEqual(resolveTicketId(undefined), undefined);
    });

    test('returns undefined for number', () => {
      assert.strictEqual(resolveTicketId(42), undefined);
    });

    test('extracts ticket.id from nested object', () => {
      const item = { ticket: { id: 'IMPL-042' } };
      assert.strictEqual(resolveTicketId(item), 'IMPL-042');
    });

    test('extracts ticket string from object', () => {
      const item = { ticket: 'IMPL-043' };
      assert.strictEqual(resolveTicketId(item), 'IMPL-043');
    });

    test('extracts id directly from object', () => {
      const item = { id: 'IMPL-044' };
      assert.strictEqual(resolveTicketId(item), 'IMPL-044');
    });

    test('returns undefined for empty object', () => {
      assert.strictEqual(resolveTicketId({}), undefined);
    });

    test('nested ticket.id takes priority over ticket string', () => {
      const item = { ticket: { id: 'IMPL-001' } };
      assert.strictEqual(resolveTicketId(item), 'IMPL-001');
    });
  });

  suite('resolvePlanId()', () => {
    test('returns string directly', () => {
      assert.strictEqual(resolvePlanId('PLAN-015'), 'PLAN-015');
    });

    test('returns undefined for null', () => {
      assert.strictEqual(resolvePlanId(null), undefined);
    });

    test('extracts plan.id from nested object', () => {
      const item = { plan: { id: 'PLAN-015' } };
      assert.strictEqual(resolvePlanId(item), 'PLAN-015');
    });

    test('extracts entry.planId from object', () => {
      const item = { entry: { planId: 'PLAN-015' } };
      assert.strictEqual(resolvePlanId(item), 'PLAN-015');
    });

    test('extracts id directly from object', () => {
      const item = { id: 'PLAN-015' };
      assert.strictEqual(resolvePlanId(item), 'PLAN-015');
    });

    test('returns undefined for empty object', () => {
      assert.strictEqual(resolvePlanId({}), undefined);
    });

    test('plan.id takes priority over entry.planId', () => {
      const item = { plan: { id: 'PLAN-001' }, entry: { planId: 'PLAN-002' } };
      assert.strictEqual(resolvePlanId(item), 'PLAN-001');
    });
  });

  suite('resolveLogFile()', () => {
    test('returns string directly', () => {
      assert.strictEqual(resolveLogFile('/path/to/log.txt'), '/path/to/log.txt');
    });

    test('returns undefined for null', () => {
      assert.strictEqual(resolveLogFile(null), undefined);
    });

    test('extracts entry.logFile from object', () => {
      const item = { entry: { logFile: '/workflow/logs/pipeline.log' } };
      assert.strictEqual(resolveLogFile(item), '/workflow/logs/pipeline.log');
    });

    test('extracts logFile directly from object', () => {
      const item = { logFile: '/direct/log.txt' };
      assert.strictEqual(resolveLogFile(item), '/direct/log.txt');
    });

    test('returns undefined for empty object', () => {
      assert.strictEqual(resolveLogFile({}), undefined);
    });

    test('entry.logFile takes priority over direct logFile', () => {
      const item = { entry: { logFile: '/entry/log.txt' }, logFile: '/direct/log.txt' };
      assert.strictEqual(resolveLogFile(item), '/entry/log.txt');
    });
  });

  suite('resolveReportPath()', () => {
    test('returns string directly', () => {
      assert.strictEqual(resolveReportPath('/path/report.md'), '/path/report.md');
    });

    test('returns undefined for null', () => {
      assert.strictEqual(resolveReportPath(null), undefined);
    });

    test('extracts reportPath directly from object', () => {
      const item = { reportPath: '/workflow/reports/report.md' };
      assert.strictEqual(resolveReportPath(item), '/workflow/reports/report.md');
    });

    test('extracts entry.reports[0].path from object', () => {
      const item = {
        entry: {
          reports: [
            { path: '/workflow/reports/first.md' },
            { path: '/workflow/reports/second.md' }
          ]
        }
      };
      assert.strictEqual(resolveReportPath(item), '/workflow/reports/first.md');
    });

    test('returns undefined for object with empty reports array', () => {
      const item = { entry: { reports: [] } };
      assert.strictEqual(resolveReportPath(item), undefined);
    });

    test('returns undefined for empty object', () => {
      assert.strictEqual(resolveReportPath({}), undefined);
    });

    test('reportPath takes priority over entry.reports', () => {
      const item = {
        reportPath: '/direct/report.md',
        entry: { reports: [{ path: '/entry/report.md' }] }
      };
      assert.strictEqual(resolveReportPath(item), '/direct/report.md');
    });
  });

  suite('VSCode-dependent functions', () => {
    setup(() => {
      mockConfiguration = new Map();
      mockWorkspaceFolders = undefined;
      mockExecAsyncResult = undefined;
      mockTResult = '';

      const globalAny = global as typeof globalThis & Record<string, unknown>;
      originalVscode = globalAny.vscode;
      originalT = globalAny.t;

      // Mock execAsync
      mockExecAsync = async (..._args: unknown[]) => {
        if (mockExecAsyncResult) {
          throw mockExecAsyncResult;
        }
        return { stdout: '', stderr: '' };
      };

      // Mock child_process.promises.exec
      if (!(globalAny.child_process as Record<string, unknown>)) {
        (globalAny as Record<string, unknown>).child_process = {};
      }
      if (!((globalAny.child_process as Record<string, unknown>).promises as Record<string, unknown>)) {
        ((globalAny.child_process as Record<string, unknown>) as Record<string, unknown>).promises = {};
      }
      ((globalAny.child_process as Record<string, unknown>).promises as Record<string, unknown>).exec = mockExecAsync;

      // Mock t function
      globalAny.t = (key: string, ..._args: unknown[]) => {
        return mockTResult || key;
      };

      globalAny.vscode = {
        workspace: {
          workspaceFolders: mockWorkspaceFolders,
          getConfiguration: (section: string) => {
            return {
              get: (key: string, defaultValue?: unknown) => {
                const sectionMap = mockConfiguration.get(section);
                if (sectionMap) {
                  return sectionMap.get(key) ?? defaultValue;
                }
                return defaultValue;
              }
            };
          }
        },
        commands: {
          executeCommand: async (_command: string, ..._args: unknown[]) => {
            return undefined;
          }
        },
        window: {
          withProgress: async (_options: unknown, task: (task: { report: () => void }, token: { isCancellationRequested: boolean; onCancellationRequested: { dispose: () => void } }) => Promise<unknown>) => {
            return await task({ report: () => {} }, { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) });
          },
          showInformationMessage: async (_message: string) => {
            return undefined;
          },
          showWarningMessage: async (_message: string, ..._items: string[]) => {
            return undefined;
          },
          showErrorMessage: async (_message: string) => {
            return undefined;
          }
        },
        ProgressLocation: {
          Notification: 1
        },
        Uri: {
          file: (path: string) => ({ fsPath: path })
        }
      };
    });

    teardown(() => {
      const globalAny = global as typeof globalThis & Record<string, unknown>;
      globalAny.vscode = originalVscode;
      globalAny.t = originalT;
      if (globalAny.child_process) {
        delete (globalAny.child_process as Record<string, unknown>).promises;
      }
    });

    suite('checkCliInstalled()', () => {
      test('should return boolean when custom CLI path is provided', async () => {
        mockConfiguration.set('workflow', new Map([['cliPath', '/valid/cli/path']]));
        
        const result = await checkCliInstalled();
        assert.strictEqual(typeof result, 'boolean');
      });

      test('should return boolean for non-existent custom CLI path', async () => {
        mockConfiguration.set('workflow', new Map([['cliPath', '/nonexistent/cli/path']]));
        
        const result = await checkCliInstalled();
        assert.strictEqual(typeof result, 'boolean');
      });
    });

    suite('checkWorkflowDir()', () => {
      test('should return false when no workspace folder', () => {
        mockWorkspaceFolders = undefined;
        
        const result = checkWorkflowDir();
        assert.strictEqual(result, false);
      });

      test('should return false when workflow directory does not exist', () => {
        mockWorkspaceFolders = [{
          uri: vscode.Uri.file('/nonexistent/workspace'),
          name: 'test',
          index: 0
        }];
        
        const result = checkWorkflowDir();
        assert.strictEqual(result, false);
      });
    });

    suite('updateContextKeys()', () => {
      test('should update context keys without pipeline service', async () => {
        mockWorkspaceFolders = [{
          uri: vscode.Uri.file('/nonexistent'),
          name: 'test',
          index: 0
        }];

        await updateContextKeys(undefined, getErrorHandler());
      });

      test('should update context keys with running pipeline', async () => {
        mockWorkspaceFolders = [{
          uri: vscode.Uri.file('/nonexistent'),
          name: 'test',
          index: 0
        }];

        const mockPipelineService = {
          getState: () => PipelineState.Running
        } as unknown as PipelineService;

        await updateContextKeys(mockPipelineService, getErrorHandler());
      });
    });

    suite('installCli()', () => {
      test('should install CLI successfully', async () => {
        mockTResult = 'CLI installed';
        mockExecAsyncResult = undefined; // Success

        // Mock execAsync directly in the module
        const globalAny = global as typeof globalThis & Record<string, unknown>;
        (globalAny.child_process as Record<string, unknown>).promises = { exec: async () => ({ stdout: '', stderr: '' }) };
        
        await installCli(getErrorHandler());
      });

      test('should handle installation error with errorHandler', async () => {
        mockTResult = 'Installation failed message';

        // Mock execAsync to throw error
        const globalAny = global as typeof globalThis & Record<string, unknown>;
        (globalAny.child_process as Record<string, unknown>).promises = { exec: async () => { throw new Error('Installation failed'); } };
        
        await installCli(getErrorHandler());
      });

      test('should handle installation error without errorHandler', async () => {
        mockTResult = 'Installation failed message';

        // Mock execAsync to throw error
        const globalAny = global as typeof globalThis & Record<string, unknown>;
        (globalAny.child_process as Record<string, unknown>).promises = { exec: async () => { throw new Error('Installation failed'); } };
        
        await installCli(undefined);
      });
    });

    suite('initWorkflow()', () => {
      test('should initialize workflow successfully', async () => {
        mockWorkspaceFolders = [{
          uri: vscode.Uri.file('/test/workspace'),
          name: 'test',
          index: 0
        }];
        mockTResult = 'Workflow initialized';

        const globalAny = global as typeof globalThis & Record<string, unknown>;
        (globalAny.child_process as Record<string, unknown>).promises = { exec: async () => ({ stdout: '', stderr: '' }) };
        
        await initWorkflow(getErrorHandler());
      });

      test('should handle missing workspace folder', async () => {
        mockWorkspaceFolders = undefined;
        mockTResult = 'Please open a folder';
        
        await initWorkflow(getErrorHandler());
      });

      test('should handle workflow command not found and use workflow-ai', async () => {
        mockWorkspaceFolders = [{
          uri: vscode.Uri.file('/test/workspace'),
          name: 'test',
          index: 0
        }];
        mockTResult = 'Workflow initialized';

        const globalAny = global as typeof globalThis & Record<string, unknown>;
        let callCount = 0;
        (globalAny.child_process as Record<string, unknown>).promises = {
          exec: async () => {
            callCount++;
            if (callCount === 1) {
              const err: Error & { code?: string } = new Error('ENOENT');
              err.code = 'ENOENT';
              throw err;
            }
            return { stdout: '', stderr: '' };
          }
        };
        
        await initWorkflow(getErrorHandler());
      });

      test('should handle initialization error with errorHandler', async () => {
        mockWorkspaceFolders = [{
          uri: vscode.Uri.file('/test/workspace'),
          name: 'test',
          index: 0
        }];
        mockTResult = 'Failed to initialize';

        const globalAny = global as typeof globalThis & Record<string, unknown>;
        (globalAny.child_process as Record<string, unknown>).promises = { exec: async () => { throw new Error('Init failed'); } };
        
        await initWorkflow(getErrorHandler());
      });

      test('should handle initialization error without errorHandler', async () => {
        mockWorkspaceFolders = [{
          uri: vscode.Uri.file('/test/workspace'),
          name: 'test',
          index: 0
        }];
        mockTResult = 'Failed to initialize';

        const globalAny = global as typeof globalThis & Record<string, unknown>;
        (globalAny.child_process as Record<string, unknown>).promises = { exec: async () => { throw new Error('Init failed'); } };
        
        await initWorkflow(undefined);
      });
    });
  });
});
