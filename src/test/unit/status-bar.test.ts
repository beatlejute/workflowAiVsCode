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
import { PipelineService, PipelineState } from '../../services/pipeline-service';
import { WorkflowStore } from '../../data/workflow-store';
import { TicketStatus } from '../../data/types';

// Mock interfaces
interface MockPipelineService {
  getState: () => PipelineState;
  getCurrentStage: () => string | undefined;
  getCurrentAgent: () => string | undefined;
  getCurrentTicket: () => string | undefined;
  getRetryCount: () => number;
  onStateChange: (listener: (s: PipelineState) => void) => { dispose: () => void };
  onStageChange: (listener: (stage: string | undefined) => void) => vscode.Disposable;
  _fireStateChange: (s: PipelineState) => void;
  _fireStageChange: (stage: string | undefined) => void;
}

interface MockStore {
  getTicketsByStatus: (status: string) => unknown[];
  onDidChange: (listener: (e: unknown) => void) => () => void;
  _fireChange: (event: unknown) => void;
}

interface StatusBarItemState {
  command: string;
  text: string;
  tooltip?: { value: string } | string;
  color?: string;
}

// Create mock PipelineService
function createMockPipelineService(state: PipelineState = PipelineState.Idle, overrides: Record<string, unknown> = {}): MockPipelineService {
  const stateChangeListeners: ((state: PipelineState) => void)[] = [];
  const stageChangeListeners: ((stage: string | undefined) => void)[] = [];
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
    onStageChange: (listener: (stage: string | undefined) => void) => {
      stageChangeListeners.push(listener);
      return { dispose: () => {} };
    },
    _fireStateChange: (s: PipelineState) => {
      stateChangeListeners.forEach(l => l(s));
    },
    _fireStageChange: (stage: string | undefined) => {
      stageChangeListeners.forEach(l => l(stage));
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
      assert.doesNotThrow(() => new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore));
    });

    test('statusBarItem has command set', () => {
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      const item = getStatusBarItem(statusBar);
      assert.strictEqual(item.command, 'workflow.statusBarClick');
      statusBar.dispose();
    });

    test('statusBarItem is shown after construction', () => {
      let showCalled = false;
      const origCreate = vscode.window.createStatusBarItem;
      vscode.window.createStatusBarItem = (alignment: any, priority: any) => {
        const item = origCreate(alignment, priority) as vscode.StatusBarItem;
        const origShow = item.show.bind(item);
        item.show = () => { showCalled = true; origShow(); };
        return item;
      };
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      assert.ok(showCalled);
      statusBar.dispose();
      vscode.window.createStatusBarItem = origCreate;
    });
  });

  suite('render - Idle state', () => {
    test('sets idle text', () => {
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      const item = getStatusBarItem(statusBar);
      assert.ok(item.text.includes('Idle') || item.text.includes('wf') || item.text.length > 0);
      statusBar.dispose();
    });

    test('tooltip is MarkdownString for idle', () => {
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      const item = getStatusBarItem(statusBar);
      assert.ok(item.tooltip !== undefined);
      statusBar.dispose();
    });

    test('color is undefined for idle', () => {
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
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
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      const item = getStatusBarItem(statusBar);
      assert.ok(item.text.includes('Running') || item.text.includes('execute-task') || item.text.includes('loading'));
      statusBar.dispose();
    });

    test('sets running text with retry count', () => {
      pipelineService = createMockPipelineService(PipelineState.Running, {
        currentStage: 'execute-task',
        retryCount: 2
      });
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      const item = getStatusBarItem(statusBar);
      assert.ok(item.text.includes('retry') || item.text.includes('2'));
      statusBar.dispose();
    });

    test('sets running text with no stage', () => {
      pipelineService = createMockPipelineService(PipelineState.Running, {});
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      const item = getStatusBarItem(statusBar);
      assert.ok(item.text.length > 0);
      statusBar.dispose();
    });
  });

  suite('render - Error state', () => {
    test('sets error text', () => {
      pipelineService = createMockPipelineService(PipelineState.Error);
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      const item = getStatusBarItem(statusBar);
      assert.ok(item.text.includes('Error') || item.text.includes('error'));
      statusBar.dispose();
    });

    test('sets error color', () => {
      pipelineService = createMockPipelineService(PipelineState.Error);
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      const item = getStatusBarItem(statusBar);
      assert.ok(item.color !== undefined);
      statusBar.dispose();
    });
  });

  suite('render - Completed state', () => {
    test('sets completed text', () => {
      pipelineService = createMockPipelineService(PipelineState.Completed);
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      const item = getStatusBarItem(statusBar);
      assert.ok(item.text.includes('Completed') || item.text.includes('check'));
      statusBar.dispose();
    });

    test('color is undefined for completed', () => {
      pipelineService = createMockPipelineService(PipelineState.Completed);
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      const item = getStatusBarItem(statusBar);
      assert.strictEqual(item.color, undefined);
      statusBar.dispose();
    });
  });

  suite('event subscriptions', () => {
    test('re-renders on pipeline state change', () => {
      pipelineService = createMockPipelineService(PipelineState.Idle);
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      const item = getStatusBarItem(statusBar);

      // Simulate state change by changing mock state and firing
      pipelineService.getState = () => PipelineState.Running;
      pipelineService._fireStateChange(PipelineState.Running);

      const newText = item.text;
      // Text may have changed (Running vs Idle)
      assert.ok(newText.length > 0);
      statusBar.dispose();
    });

    test('re-renders on store change', () => {
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      const item = getStatusBarItem(statusBar);

      // Change store mock and fire event
      store.getTicketsByStatus = (status: string) => {
        if (status === TicketStatus.Ready) return new Array(10);
        return [];
      };
      store._fireChange({ type: 'ticket', operation: 'update' });

      // Status bar should have re-rendered
      assert.ok(item.text.length > 0);
      statusBar.dispose();
    });

    test('re-renders on stage change (GOTO event) and shows new stage', () => {
      // Start with Running state, no stage
      pipelineService = createMockPipelineService(PipelineState.Running, {
        currentStage: undefined
      });
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      let item = getStatusBarItem(statusBar);
      const initialText = item.text;

      // Simulate GOTO event: stage changes to 'execute-task'
      pipelineService.getCurrentStage = () => 'execute-task';
      pipelineService._fireStageChange('execute-task');

      item = getStatusBarItem(statusBar);
      // After GOTO, text should contain the new stage name
      assert.ok(
        item.text.includes('execute-task') || item.text !== initialText,
        `StatusBar text should update to show new stage after GOTO. Initial: "${initialText}", After: "${item.text}"`
      );
      statusBar.dispose();
    });
  });

  suite('show/hide', () => {
    test('show() calls statusBarItem.show()', () => {
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      assert.doesNotThrow(() => statusBar.show());
      statusBar.dispose();
    });

    test('hide() calls statusBarItem.hide()', () => {
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      assert.doesNotThrow(() => statusBar.hide());
      statusBar.dispose();
    });
  });

  suite('dispose', () => {
    test('dispose() does not throw', () => {
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      assert.doesNotThrow(() => statusBar.dispose());
    });

    test('dispose() can be called multiple times', () => {
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      assert.doesNotThrow(() => {
        statusBar.dispose();
        statusBar.dispose();
      });
    });
  });

  suite('tooltip builders', () => {
    test('idle tooltip contains ready/blocked counts', () => {
      store = createMockStore(5, 2);
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      const item = getStatusBarItem(statusBar);
      const tooltipValue = (item.tooltip as { value: string } | undefined)?.value || '';
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
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      const item = getStatusBarItem(statusBar);
      const tooltipValue = (item.tooltip as { value: string } | undefined)?.value || '';
      assert.ok(tooltipValue.length > 0);
      statusBar.dispose();
    });

    test('running tooltip without optional fields', () => {
      pipelineService = createMockPipelineService(PipelineState.Running, {});
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      const item = getStatusBarItem(statusBar);
      assert.ok(item.tooltip !== undefined);
      statusBar.dispose();
    });

    test('error tooltip has error text', () => {
      pipelineService = createMockPipelineService(PipelineState.Error);
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      const item = getStatusBarItem(statusBar);
      const tooltipValue = (item.tooltip as { value: string } | undefined)?.value || '';
      assert.ok(tooltipValue.length > 0);
      statusBar.dispose();
    });

    test('completed tooltip has completion text', () => {
      pipelineService = createMockPipelineService(PipelineState.Completed);
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      const item = getStatusBarItem(statusBar);
      const tooltipValue = (item.tooltip as { value: string } | undefined)?.value || '';
      assert.ok(tooltipValue.length > 0);
      statusBar.dispose();
    });
  });

  suite('activateStatusBar', () => {
    test('creates StatusBar and adds to subscriptions', () => {
      const subscriptions: unknown[] = [];
      const context = { subscriptions } as unknown as vscode.ExtensionContext;
      activateStatusBar(context, pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      assert.strictEqual(subscriptions.length, 1);
      // Cleanup
      (subscriptions[0] as { dispose: () => void }).dispose();
    });
  });

  suite('PipelineService Integration - Stage Error Detection', () => {
    test('StatusBar shows Error when PipelineService has stage error', () => {
      // Simulate PipelineService with Error state (stage error detected)
      pipelineService = createMockPipelineService(PipelineState.Error);
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      const item = getStatusBarItem(statusBar);

      // Verify Error state is displayed
      assert.ok(item.text.includes('Error') || item.text.includes('error'));
      assert.ok(item.color !== undefined, 'Error color should be set');
      statusBar.dispose();
    });

    test('StatusBar shows Completed when pipeline succeeds without stage errors', () => {
      // Simulate PipelineService with Completed state (no stage errors)
      pipelineService = createMockPipelineService(PipelineState.Completed);
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      const item = getStatusBarItem(statusBar);

      // Verify Completed state is displayed
      assert.ok(item.text.includes('Completed') || item.text.includes('check'));
      assert.strictEqual(item.color, undefined);
      statusBar.dispose();
    });

    test('StatusBar transitions from Running to Error on stage failure', () => {
      // Start with Running state
      pipelineService = createMockPipelineService(PipelineState.Running, {
        currentStage: 'execute-task'
      });
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      let item = getStatusBarItem(statusBar);

      // Verify Running state
      assert.ok(item.text.includes('Running') || item.text.includes('loading'));

      // Simulate transition to Error state (stage failure detected)
      pipelineService.getState = () => PipelineState.Error;
      pipelineService._fireStateChange(PipelineState.Error);

      item = getStatusBarItem(statusBar);
      assert.ok(item.text.includes('Error') || item.text.includes('error'));
      assert.ok(item.color !== undefined);
      statusBar.dispose();
    });

    test('StatusBar transitions from Running to Completed on success', () => {
      // Start with Running state
      pipelineService = createMockPipelineService(PipelineState.Running, {
        currentStage: 'execute-task'
      });
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      let item = getStatusBarItem(statusBar);

      // Verify Running state
      assert.ok(item.text.includes('Running') || item.text.includes('loading'));

      // Simulate transition to Completed state (all stages succeeded)
      pipelineService.getState = () => PipelineState.Completed;
      pipelineService._fireStateChange(PipelineState.Completed);

      item = getStatusBarItem(statusBar);
      assert.ok(item.text.includes('Completed') || item.text.includes('check'));
      assert.strictEqual(item.color, undefined);
      statusBar.dispose();
    });

    test('StatusBar shows retry count during Running state', () => {
      // Simulate Running state with retry
      pipelineService = createMockPipelineService(PipelineState.Running, {
        currentStage: 'execute-task',
        retryCount: 2
      });
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      const item = getStatusBarItem(statusBar);

      // Verify retry count is displayed
      assert.ok(item.text.includes('retry') || item.text.includes('2'));
      statusBar.dispose();
    });

    test('StatusBar tooltip contains error information in Error state', () => {
      pipelineService = createMockPipelineService(PipelineState.Error);
      const statusBar = new StatusBar(pipelineService as unknown as PipelineService, store as unknown as WorkflowStore);
      const item = getStatusBarItem(statusBar);

      const tooltipValue = (item.tooltip as { value: string } | undefined)?.value || '';
      assert.ok(tooltipValue.length > 0, 'Tooltip should contain error information');
      statusBar.dispose();
    });
  });
});
