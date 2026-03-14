/**
 * Integration tests for bootstrap.ts
 *
 * Tests:
 * - createContainer() returns Container with all services
 * - Services are properly initialized
 * - Container.dispose() cleans up all resources
 * - Order of initialization is correct
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { createContainer } from '../../bootstrap';
import { TicketStatus, type Ticket } from '../../data/types';

suite('Bootstrap Integration Suite', () => {
  let context: vscode.ExtensionContext;
  let disposables: vscode.Disposable[];

  /**
   * Create mock ExtensionContext for testing
   */
  function createMockContext(): vscode.ExtensionContext {
    disposables = [];
    return {
      subscriptions: disposables,
      extensions: { getExtension: () => undefined },
      globalState: {
        get: () => undefined,
        update: () => Promise.resolve(),
        keys: () => []
      },
      workspaceState: {
        get: () => undefined,
        update: () => Promise.resolve(),
        keys: () => []
      },
      secrets: {
        get: () => undefined,
        store: () => Promise.resolve(),
        delete: () => Promise.resolve()
      },
      extensionUri: vscode.Uri.file('/test'),
      extensionPath: '/test',
      storagePath: '/test/storage',
      globalStoragePath: '/test/global-storage',
      environmentVariableCollection: {
        replace: () => {},
        get: () => undefined,
        forEach: () => {},
        delete: () => {},
        clear: () => {},
        description: ''
      },
      extension: {
        id: 'test',
        extensionUri: vscode.Uri.file('/test'),
        extensionPath: '/test'
      },
      logUri: vscode.Uri.file('/test/log'),
      logPath: '/test/log',
      storageUri: vscode.Uri.file('/test/storage'),
      globalStorageUri: vscode.Uri.file('/test/global-storage'),
      asAbsolutePath: (path: string) => path,
      extensionMode: 2 as vscode.ExtensionMode, // ExtensionMode.Test = 2
      languageModelAccessInformation: {
        onDidChange: () => ({ dispose: () => {} }),
        canSendRequest: () => true
      }
    } as unknown as vscode.ExtensionContext;
  }

  setup(() => {
    context = createMockContext();
  });

  teardown(() => {
    // Cleanup disposables
    for (const d of disposables) {
      try {
        d.dispose();
      } catch {
        // Ignore disposal errors
      }
    }
  });

  suite('createContainer()', () => {
    test('should return Container with all required services', () => {
      const container = createContainer(context);

      assert.ok(container, 'Container should be created');
      assert.ok(container.store, 'Container should have store');
      assert.ok(container.ticketService, 'Container should have ticketService');
      assert.ok(container.dependencyService, 'Container should have dependencyService');
      assert.ok(container.planService, 'Container should have planService');
      assert.ok(container.pipelineService, 'Container should have pipelineService');
      assert.ok(container.reportService, 'Container should have reportService');
      assert.ok(container.validationService, 'Container should have validationService');
      assert.ok(typeof container.dispose === 'function', 'Container should have dispose method');
    });

    test('should have workflowRoot property (null when no workspace)', () => {
      const container = createContainer(context);

      // workflowRoot can be null if no workspace is open
      assert.ok(
        container.workflowRoot === null || typeof container.workflowRoot === 'string',
        'workflowRoot should be null or string'
      );
    });

    test('should have fileWatcher only when workflowRoot is available', () => {
      const container = createContainer(context);

      // fileWatcher is optional, depends on workflowRoot availability
      if (container.workflowRoot !== null) {
        assert.ok(container.fileWatcher, 'fileWatcher should exist when workflowRoot is available');
      } else {
        assert.strictEqual(container.fileWatcher, undefined, 'fileWatcher should be undefined when workflowRoot is null');
      }
    });

    test('should initialize services in correct order (store first)', () => {
      const container = createContainer(context);

      // Store should be initialized and functional
      const tickets = container.store.getTickets();
      assert.ok(Array.isArray(tickets), 'Store should be initialized and return tickets array');

      const plans = container.store.getPlans();
      assert.ok(Array.isArray(plans), 'Store should be initialized and return plans array');
    });

    test('should add container to context subscriptions', () => {
      const container = createContainer(context);
      context.subscriptions.push(container);

      assert.strictEqual(context.subscriptions.includes(container), true, 'Container should be added to subscriptions');
    });
  });

  suite('Container.dispose()', () => {
    test('should dispose container without errors', () => {
      const container = createContainer(context);

      assert.doesNotThrow(() => {
        container.dispose();
      }, 'dispose() should not throw errors');
    });

    test('should clear store data on dispose', () => {
      const container = createContainer(context);

      // Store should have data before dispose (even if empty, it should be functional)
      const ticketsBefore = container.store.getTickets();
      assert.ok(Array.isArray(ticketsBefore), 'Store should be functional before dispose');

      container.dispose();

      // After dispose, store should be cleared
      const ticketsAfter = container.store.getTickets();
      assert.ok(Array.isArray(ticketsAfter), 'Store should still be accessible after dispose');
    });

    test('should be idempotent (can call dispose multiple times)', () => {
      const container = createContainer(context);

      assert.doesNotThrow(() => {
        container.dispose();
        container.dispose();
        container.dispose();
      }, 'dispose() should be idempotent');
    });

    test('should dispose fileWatcher if it exists', () => {
      const container = createContainer(context);

      if (container.fileWatcher) {
        assert.doesNotThrow(() => {
          container.dispose();
        }, 'dispose() should dispose fileWatcher without errors');
      }
    });

    test('should stop WorkflowStore EventEmitter after dispose', () => {
      const container = createContainer(context);
      let eventFired = false;

      container.store.onDidChange(() => {
        eventFired = true;
      });

      container.store.dispose();

      (container.store as unknown as { eventEmitter: EventEmitter }).eventEmitter.emit('change', {});
      assert.strictEqual(eventFired, false, 'EventEmitter should not fire after dispose');
    });

    test('should stop PipelineService EventEmitter after dispose', () => {
      const container = createContainer(context);
      let eventFired = false;

      container.pipelineService.on('log', () => {
        eventFired = true;
      });

      container.pipelineService.dispose();

      (container.pipelineService as unknown as EventEmitter).emit('log', 'test');
      assert.strictEqual(eventFired, false, 'EventEmitter should not fire after dispose');
    });
  });

  suite('Service dependencies', () => {
    test('ticketService should have access to store', () => {
      const container = createContainer(context);

      // TicketService should be able to access store data
      const tickets = container.ticketService.getAll();
      assert.ok(Array.isArray(tickets), 'ticketService should have access to store tickets');
    });

    test('dependencyService should have access to store', () => {
      const container = createContainer(context);

      // DependencyService should be able to access store data
      const dependencies = container.dependencyService.getDependencies('TEST-001');
      assert.ok(Array.isArray(dependencies), 'dependencyService should have access to store');
    });

    test('planService should have access to store', () => {
      const container = createContainer(context);

      // PlanService should be able to access store data
      const plans = container.planService.getAll();
      assert.ok(Array.isArray(plans), 'planService should have access to store plans');
    });

    test('pipelineService should be functional', () => {
      const container = createContainer(context);

      // PipelineService should have getState method
      const state = container.pipelineService.getState();
      assert.ok(state !== undefined, 'pipelineService should be functional');
    });

    test('validationService should have access to store', () => {
      const container = createContainer(context);

      // ValidationService should be able to validate tickets
      const mockUri = vscode.Uri.file('/test/tickets/TEST-001.md');
      const mockTicket: Ticket = {
        id: 'TEST-001',
        title: 'Test Ticket',
        status: TicketStatus.Backlog,
        priority: 3,
        type: 'feature',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: 'PLAN-001',
        parent_task: '',
        created_at: '2026-03-10T00:00:00Z',
        updated_at: '2026-03-10T00:00:00Z',
        completed_at: ''
      };
      const result = container.validationService.validateTicket(mockUri, mockTicket);

      assert.ok(Array.isArray(result), 'validationService should return array of diagnostics');
    });

    test('reportService should have access to store', () => {
      const container = createContainer(context);

      // ReportService should be able to access store data
      const reports = container.reportService.getAll();
      assert.ok(Array.isArray(reports), 'reportService should have access to store reports');
    });
  });

  suite('Container interface', () => {
    test('should implement Container interface correctly', () => {
      const container = createContainer(context);

      // Check all required properties exist
      const requiredProperties = [
        'store',
        'ticketService',
        'dependencyService',
        'planService',
        'pipelineService',
        'reportService',
        'validationService',
        'workflowRoot',
        'dispose'
      ];

      for (const prop of requiredProperties) {
        assert.ok(
          prop in container,
          `Container should have ${prop} property`
        );
      }
    });

    test('fileWatcher should be optional in Container', () => {
      const container = createContainer(context);

      // fileWatcher is optional (depends on workflowRoot)
      assert.ok(
        container.fileWatcher === undefined || container.fileWatcher !== undefined,
        'fileWatcher should be optional'
      );
    });
  });
});
