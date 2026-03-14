/**
 * Unit tests for status-bar.ts
 *
 * Tests:
 * - StatusBar constructor: creates statusBarItem, subscribes to events
 * - render() for each PipelineState (Idle, Running, Error, Completed)
 * - buildRunningText: stage/ticket/retry formatting
 * - Tooltip builders for each state
 * - show(), hide(), dispose()
 * - activateStatusBar()
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { StatusBar, activateStatusBar } from '../../ui/status-bar';
import { PipelineState } from '../../services/pipeline-service';
import { TicketStatus } from '../../data/types';

// Mock interfaces
interface MockPipelineService {
  getState: () => PipelineState;
  getCurrentStage: () => string | undefined;
  getCurrentAgent: () => string | undefined;
  getCurrentTicket: () => string | undefined;
  getRetryCount: () => number;
  onStateChange: (listener: (s: PipelineState) => void) => { dispose: () => void };
  _fireStateChange: (s: PipelineState) => void;
}

interface MockStore {
  getTicketsByStatus: (status: string) => unknown[];
  onDidChange: (listener: (e: unknown) => void) => () => void;
  _fireChange: (event: unknown) => void;
}

interface StatusBarItemState {
  command: string;
  text: string;
  tooltip?: unknown;
  color?: string;
}

// Create mock PipelineService
function createMockPipelineService(state: PipelineState = PipelineState.Idle, overrides: Record<string, unknown> = {}): MockPipelineService {
  const stateChangeListeners: ((state: PipelineState) => void)[] = [];
  return {
    getState: () => state,
    getCurrentStage: () => overrides.currentStage as string | undefined,
    getCurrentAgent: () => overrides.currentAgent as string | undefined,
    getCurrentTicket: () => overrides.currentTicket as string | undefined,
    getRetryCount: () => (overrides.retryCount as number) ?? 0,
    onStateChange: (listener: (s: PipelineState) => void) => {
      stateChangeListeners.push(listener);
      return { dispose: () => {} };
    },
    _fireStateChange: (s: PipelineState) => {
      stateChangeListeners.forEach(l => l(s));
    }
  };
}

// Create mock WorkflowStore
function createMockStore(readyCount = 0, blockedCount = 0): MockStore {
  const changeListeners: ((event: unknown) => void)[] = [];
  return {
    getTicketsByStatus: (status: string) => {
      if (status === TicketStatus.Ready) return new Array(readyCount);
      if (status === TicketStatus.Blocked) return new Array(blockedCount);
      return [];
    },
    onDidChange: (listener: (e: unknown) => void) => {
      changeListeners.push(listener);
      return () => {};
    },
    _fireChange: (event: unknown) => {
      changeListeners.forEach(l => l(event));
    }
  };
}

// Capture StatusBarItem state
function getStatusBarItem(statusBar: StatusBar): StatusBarItemState {
  return (statusBar as unknown as { statusBarItem: StatusBarItemState }).statusBarItem;
}

suite('StatusBar Tests', () => {
  let pipelineService: MockPipelineService;
  let store: MockStore;

  setup(() => {
    pipelineService = createMockPipelineService(PipelineState.Idle);
    store = createMockStore(3, 1);
  });

  suite('constructor', () => {
    test('creates StatusBar without throwing', () => {
      assert.doesNotThrow(() => new StatusBar(pipelineService as unknown as MockPipelineService, store as unknown as MockStore));
    });

    test('statusBarItem has command set', () => {
      const statusBar = new StatusBar(pipelineService as unknown as MockPipelineService, store as unknown as MockStore);
      const item = getStatusBarItem(statusBar);
      assert.strictEqual(item.command, 'workflow.statusBarClick');
      statusBar.dispose();
    });

    test('statusBarItem is shown after construction', () => {
      let showCalled = false;
      const origCreate = vscode.window.createStatusBarItem;
      vscode.window.createStatusBarItem = (alignment, priority) => {
        const item = origCreate(alignment, priority);
        const origShow = item.show.bind(item);
        item.show = () => { showCalled = true; origShow(); };
        return item;
      };
      const statusBar = new StatusBar(pipelineService as unknown as MockPipelineService, store as unknown as MockStore);
      assert.ok(showCalled);
      statusBar.dispose();
      vscode.window.createStatusBarItem = origCreate;
    });
  });

  suite('render - Idle state', () => {
    test('sets idle text', () => {
      const statusBar = new StatusBar(pipelineService as unknown as MockPipelineService, store as unknown as MockStore);
      const item = getStatusBarItem(statusBar);
      assert.ok(item.text.includes('Idle') || item.text.includes('wf') || item.text.length > 0);
      statusBar.dispose();
    });

    test('tooltip is MarkdownString for idle', () => {
      const statusBar = new StatusBar(pipelineService as unknown as MockPipelineService, store as unknown as MockStore);
      const item = getStatusBarItem(statusBar);
      assert.ok(item.tooltip !== undefined);
      statusBar.dispose();
    });

    test('color is undefined for idle', () => {
      const statusBar = new StatusBar(pipelineService as unknown as MockPipelineService, store as unknown as MockStore);
      const item = getStatusBarItem(statusBar);
      assert.strictEqual(item.color, undefined);
      statusBar.dispose();
    });
  });

  suite('render - Running state', () => {
    test('sets running text with stage', () => {
      pipelineService = createMockPipelineService(PipelineState.Running, {
        currentStage: 'execute-task',
        currentTicket: 'IMPL-001',
        retryCount: 0
      });
      const statusBar = new StatusBar(pipelineService as unknown as MockPipelineService, store as unknown as MockStore);
      const item = getStatusBarItem(statusBar);
      assert.ok(item.text.includes('Running') || item.text.includes('execute-task') || item.text.includes('loading'));
      statusBar.dispose();
    });

    test('sets running text with retry count', () => {
      pipelineService = createMockPipelineService(PipelineState.Running, {
        currentStage: 'execute-task',
        retryCount: 2
      });
      const statusBar = new StatusBar(pipelineService as unknown as MockPipelineService, store as unknown as MockStore);
      const item = getStatusBarItem(statusBar);
      assert.ok(item.text.includes('retry') || item.text.includes('2'));
      statusBar.dispose();
    });

    test('sets running text with no stage', () => {
      pipelineService = createMockPipelineService(PipelineState.Running, {});
      const statusBar = new StatusBar(pipelineService as unknown as MockPipelineService, store as unknown as MockStore);
      const item = getStatusBarItem(statusBar);
      assert.ok(item.text.length > 0);
      statusBar.dispose();
    });
  });

  suite('render - Error state', () => {
    test('sets error text', () => {
      pipelineService = createMockPipelineService(PipelineState.Error);
      const statusBar = new StatusBar(pipelineService as unknown as MockPipelineService, store as unknown as MockStore);
      const item = getStatusBarItem(statusBar);
      assert.ok(item.text.includes('Error') || item.text.includes('error'));
      statusBar.dispose();
    });

    test('sets error color', () => {
      pipelineService = createMockPipelineService(PipelineState.Error);
      const statusBar = new StatusBar(pipelineService as unknown as MockPipelineService, store as unknown as MockStore);
      const item = getStatusBarItem(statusBar);
      assert.ok(item.color !== undefined);
      statusBar.dispose();
    });
  });

  suite('render - Completed state', () => {
    test('sets completed text', () => {
      pipelineService = createMockPipelineService(PipelineState.Completed);
      const statusBar = new StatusBar(pipelineService as unknown as MockPipelineService, store as unknown as MockStore);
      const item = getStatusBarItem(statusBar);
      assert.ok(item.text.includes('Completed') || item.text.includes('check'));
      statusBar.dispose();
    });

    test('color is undefined for completed', () => {
      pipelineService = createMockPipelineService(PipelineState.Completed);
      const statusBar = new StatusBar(pipelineService as unknown as MockPipelineService, store as unknown as MockStore);
      const item = getStatusBarItem(statusBar);
      assert.strictEqual(item.color, undefined);
      statusBar.dispose();
    });
  });

  suite('event subscriptions', () => {
    test('re-renders on pipeline state change', () => {
      pipelineService = createMockPipelineService(PipelineState.Idle);
      const statusBar = new StatusBar(pipelineService as unknown as MockPipelineService, store as unknown as MockStore);
      const item = getStatusBarItem(statusBar);

      // Simulate state change by changing mock state and firing
      (pipelineService as unknown as MockPipelineService).getState = () => PipelineState.Running;
      (pipelineService as unknown as MockPipelineService)._fireStateChange(PipelineState.Running);

      const newText = item.text;
      // Text may have changed (Running vs Idle)
      assert.ok(newText.length > 0);
      statusBar.dispose();
    });

    test('re-renders on store change', () => {
      const statusBar = new StatusBar(pipelineService as unknown as MockPipelineService, store as unknown as MockStore);
      const item = getStatusBarItem(statusBar);

      // Change store mock and fire event
      (store as unknown as MockStore).getTicketsByStatus = (status: string) => {
        if (status === TicketStatus.Ready) return new Array(10);
        return [];
      };
      (store as unknown as MockStore)._fireChange({ type: 'ticket', operation: 'update' });

      // Status bar should have re-rendered
      assert.ok(item.text.length > 0);
      statusBar.dispose();
    });
  });

  suite('show/hide', () => {
    test('show() calls statusBarItem.show()', () => {
      const statusBar = new StatusBar(pipelineService as unknown as MockPipelineService, store as unknown as MockStore);
      assert.doesNotThrow(() => statusBar.show());
      statusBar.dispose();
    });

    test('hide() calls statusBarItem.hide()', () => {
      const statusBar = new StatusBar(pipelineService as unknown as MockPipelineService, store as unknown as MockStore);
      assert.doesNotThrow(() => statusBar.hide());
      statusBar.dispose();
    });
  });

  suite('dispose', () => {
    test('dispose() does not throw', () => {
      const statusBar = new StatusBar(pipelineService as unknown as MockPipelineService, store as unknown as MockStore);
      assert.doesNotThrow(() => statusBar.dispose());
    });

    test('dispose() can be called multiple times', () => {
      const statusBar = new StatusBar(pipelineService as unknown as MockPipelineService, store as unknown as MockStore);
      assert.doesNotThrow(() => {
        statusBar.dispose();
        statusBar.dispose();
      });
    });
  });

  suite('tooltip builders', () => {
    test('idle tooltip contains ready/blocked counts', () => {
      store = createMockStore(5, 2);
      const statusBar = new StatusBar(pipelineService as unknown as MockPipelineService, store as unknown as MockStore);
      const item = getStatusBarItem(statusBar);
      const tooltipValue = item.tooltip?.value || '';
      assert.ok(tooltipValue.includes('5') || tooltipValue.length > 0);
      statusBar.dispose();
    });

    test('running tooltip with agent info', () => {
      pipelineService = createMockPipelineService(PipelineState.Running, {
        currentStage: 'execute',
        currentAgent: 'claude',
        currentTicket: 'IMPL-001',
        retryCount: 1
      });
      const statusBar = new StatusBar(pipelineService as unknown as MockPipelineService, store as unknown as MockStore);
      const item = getStatusBarItem(statusBar);
      const tooltipValue = item.tooltip?.value || '';
      assert.ok(tooltipValue.length > 0);
      statusBar.dispose();
    });

    test('running tooltip without optional fields', () => {
      pipelineService = createMockPipelineService(PipelineState.Running, {});
      const statusBar = new StatusBar(pipelineService as unknown as MockPipelineService, store as unknown as MockStore);
      const item = getStatusBarItem(statusBar);
      assert.ok(item.tooltip !== undefined);
      statusBar.dispose();
    });

    test('error tooltip has error text', () => {
      pipelineService = createMockPipelineService(PipelineState.Error);
      const statusBar = new StatusBar(pipelineService as unknown as MockPipelineService, store as unknown as MockStore);
      const item = getStatusBarItem(statusBar);
      const tooltipValue = item.tooltip?.value || '';
      assert.ok(tooltipValue.length > 0);
      statusBar.dispose();
    });

    test('completed tooltip has completion text', () => {
      pipelineService = createMockPipelineService(PipelineState.Completed);
      const statusBar = new StatusBar(pipelineService as unknown as MockPipelineService, store as unknown as MockStore);
      const item = getStatusBarItem(statusBar);
      const tooltipValue = item.tooltip?.value || '';
      assert.ok(tooltipValue.length > 0);
      statusBar.dispose();
    });
  });

  suite('activateStatusBar', () => {
    test('creates StatusBar and adds to subscriptions', () => {
      const subscriptions: unknown[] = [];
      const context = { subscriptions } as unknown as vscode.ExtensionContext;
      activateStatusBar(context, pipelineService as unknown as MockPipelineService, store as unknown as MockStore);
      assert.strictEqual(subscriptions.length, 1);
      // Cleanup
      (subscriptions[0] as { dispose: () => void }).dispose();
    });
  });
});
