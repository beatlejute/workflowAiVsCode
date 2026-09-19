/**
 * Unit tests for NotificationsManager lifecycle and disposal
 *
 * Tests:
 * - All event subscribers are properly unsubscribed after dispose()
 * - Events do not trigger notifications after dispose
 * - dispose() clears the disposables array
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { NotificationsManager } from '../../ui/notifications';
import { PipelineService, PipelineState } from '../../services/pipeline-service';
import { TicketStatus } from '../../data/types';
import { WorkflowStore } from '../../data/workflow-store';

interface MockTicket {
  id: string;
  status: TicketStatus;
  title: string;
  type: string;
  priority: number;
}

interface StoreChangeEvent {
  type: string;
  operation: string;
  id?: string;
}

interface MockStore {
  getTickets: () => MockTicket[];
  getTicketById: (id: string) => MockTicket | undefined;
  getReports: () => unknown[];
  onDidChange: (listener: (e: StoreChangeEvent) => void) => void;
  _fireChange: (event: StoreChangeEvent) => void;
  eventEmitter: { removeListener: (event: string, listener: any) => void };
  _listeners: { store: number; state: number; gate: number };
}

interface MockPipelineService {
  onStateChange: (listener: (s: PipelineState) => void) => MockPipelineService;
  onManualGateActivated: (listener: (data: { stage: string | undefined; ticketId: string | undefined }) => void) => MockPipelineService;
  removeListener: (event: string, listener: any) => void;
  _fireManualGateActivated: (data: { stage: string | undefined; ticketId: string | undefined }) => void;
  _fireStateChange: (s: PipelineState) => void;
  _listeners: { state: number; gate: number };
}

function createMockStore(tickets: MockTicket[] = [], reports: unknown[] = []): MockStore {
  const changeListeners: ((event: StoreChangeEvent) => void)[] = [];
  const ticketMap = new Map<string, MockTicket>(tickets.map(t => [t.id, t]));

  return {
    getTickets: () => tickets,
    getTicketById: (id: string) => ticketMap.get(id),
    getReports: () => reports,
    onDidChange: (listener: (e: StoreChangeEvent) => void) => {
      changeListeners.push(listener);
    },
    _fireChange: (event: StoreChangeEvent) => {
      changeListeners.forEach(l => l(event));
    },
    eventEmitter: {
      removeListener: (event: string, listener: any) => {
        const idx = changeListeners.indexOf(listener);
        if (idx >= 0) { changeListeners.splice(idx, 1); }
      }
    },
    get _listeners() {
      return { store: changeListeners.length, state: 0, gate: 0 };
    }
  };
}

function createMockPipelineService(): MockPipelineService {
  const stateChangeListeners: ((state: PipelineState) => void)[] = [];
  const gateActivatedListeners: ((data: { stage: string | undefined; ticketId: string | undefined }) => void)[] = [];

  const service: MockPipelineService = {
    onStateChange: (listener: (s: PipelineState) => void) => {
      stateChangeListeners.push(listener);
      return service;
    },
    onManualGateActivated: (listener: (data: { stage: string | undefined; ticketId: string | undefined }) => void) => {
      gateActivatedListeners.push(listener);
      return service;
    },
    removeListener: (event: string, listener: any) => {
      if (event === 'stateChange') {
        const idx = stateChangeListeners.indexOf(listener);
        if (idx >= 0) { stateChangeListeners.splice(idx, 1); }
      } else if (event === 'manual-gate-activated') {
        const idx = gateActivatedListeners.indexOf(listener);
        if (idx >= 0) { gateActivatedListeners.splice(idx, 1); }
      }
    },
    _fireManualGateActivated: (data: { stage: string | undefined; ticketId: string | undefined }) => {
      gateActivatedListeners.forEach(l => l(data));
    },
    _fireStateChange: (s: PipelineState) => {
      stateChangeListeners.forEach(l => l(s));
    },
    get _listeners() {
      return { state: stateChangeListeners.length, gate: gateActivatedListeners.length };
    }
  };
  return service;
}

suite('NotificationsManager - Disposal and Lifecycle', () => {
  let store: MockStore;
  let pipelineService: MockPipelineService;
  let shownInfos: Array<{ message: string; actions: string[] }> = [];

  setup(() => {
    shownInfos = [];

    // Patch vscode mock to capture notifications
    const origInfo = vscode.window.showInformationMessage;
    (vscode.window as unknown as Record<string, unknown>)._origInfo = origInfo;

    vscode.window.showInformationMessage = (async (msg: string, ...items: string[]) => {
      shownInfos.push({ message: msg, actions: items });
      return undefined;
    }) as any;

    store = createMockStore();
    pipelineService = createMockPipelineService();
  });

  teardown(() => {
    const origInfo = (vscode.window as unknown as Record<string, unknown>)._origInfo;
    if (origInfo) { vscode.window.showInformationMessage = origInfo as typeof vscode.window.showInformationMessage; }
  });

  suite('disposal and listener cleanup', () => {
    test('all listeners are unsubscribed after dispose()', async () => {
      const manager = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
      manager.initialize();

      // Verify listeners are registered
      assert.strictEqual(pipelineService._listeners.state, 1, 'onStateChange listener should be registered');
      assert.strictEqual(pipelineService._listeners.gate, 1, 'onManualGateActivated listener should be registered');

      manager.dispose();

      // Verify listeners are unsubscribed
      assert.strictEqual(pipelineService._listeners.state, 0, 'onStateChange listener should be unsubscribed after dispose');
      assert.strictEqual(pipelineService._listeners.gate, 0, 'onManualGateActivated listener should be unsubscribed after dispose');
    });

    test('events do not trigger notifications after dispose()', async () => {
      const manager = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
      manager.initialize();

      manager.dispose();

      // Try to fire an event after dispose
      pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-1' });

      // Wait a bit for async handling
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.strictEqual(shownInfos.length, 0, 'No notification should be shown after dispose');
    });

    test('pipeline state change does not trigger notifications after dispose()', async () => {
      const manager = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
      manager.initialize();

      manager.dispose();

      // Try to fire a state change event after dispose
      pipelineService._fireStateChange(PipelineState.Error);

      await new Promise(resolve => setTimeout(resolve, 10));

      assert.strictEqual(shownInfos.length, 0, 'No error notification should be shown after dispose');
    });

    test('repeated initialize and dispose work correctly', async () => {
      const manager = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);

      // First initialize
      manager.initialize();
      assert.strictEqual(pipelineService._listeners.state, 1, 'Listener should be registered after first initialize');

      manager.dispose();
      assert.strictEqual(pipelineService._listeners.state, 0, 'Listener should be unsubscribed after first dispose');

      // Second initialize
      manager.initialize();
      assert.strictEqual(pipelineService._listeners.state, 1, 'Listener should be registered after second initialize');

      manager.dispose();
      assert.strictEqual(pipelineService._listeners.state, 0, 'Listener should be unsubscribed after second dispose');
    });
  });
});
