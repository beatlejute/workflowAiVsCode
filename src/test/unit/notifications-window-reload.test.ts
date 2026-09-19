/**
 * Unit tests for NotificationsManager window reload scenario
 *
 * Tests:
 * - humanGateNotificationDedup map is reset upon re-initialization
 * - Cached tickets do not trigger notifications on re-activation
 * - Fresh notifications work correctly after reload
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
}

interface MockPipelineService {
  onStateChange: (listener: (s: PipelineState) => void) => MockPipelineService;
  onManualGateActivated: (listener: (data: { stage: string | undefined; ticketId: string | undefined }) => void) => MockPipelineService;
  removeListener: (event: string, listener: any) => void;
  _fireManualGateActivated: (data: { stage: string | undefined; ticketId: string | undefined }) => void;
  _fireStateChange: (s: PipelineState) => void;
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
    }
  };

  return service;
}

suite('NotificationsManager - Window Reload Scenario', () => {
  let store: MockStore;
  let pipelineService: MockPipelineService;
  let shownInfos: Array<{ message: string; actions: string[] }> = [];

  setup(() => {
    shownInfos = [];

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

  suite('dedup map reset on re-activation', () => {
    test('dedup map is cleared upon new instance creation', async () => {
      const manager1 = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
      manager1.initialize();

      // Trigger notification
      pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-1' });
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.strictEqual(shownInfos.length, 1, 'First notification should be shown');

      // Trigger same event again - should be deduped
      shownInfos = [];
      pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-1' });
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.strictEqual(shownInfos.length, 0, 'Second notification should be deduped (same hour bucket)');

      manager1.dispose();

      // Create new manager (simulating window reload)
      const manager2 = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
      manager2.initialize();

      // Same event should now trigger notification (dedup map was reset)
      shownInfos = [];
      pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-1' });
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.strictEqual(shownInfos.length, 1, 'Notification should be shown again after reload (dedup map was reset)');

      manager2.dispose();
    });

    test('cached ticket status does not trigger notification on re-initialization', async () => {
      // Start with a cached ticket in ready state
      const store2 = createMockStore([
        { id: 'READY-1', status: TicketStatus.Ready, title: 'Test', type: 'qa', priority: 1 }
      ]);

      const manager1 = new NotificationsManager(store2 as any as WorkflowStore, pipelineService as any as PipelineService);
      manager1.initialize();

      // Simulate store update to done status
      shownInfos = [];
      const ticketInDone = { id: 'READY-1', status: TicketStatus.Done, title: 'Test', type: 'qa', priority: 1 };
      (store2 as any).getTicketById = () => ticketInDone;
      store2._fireChange({ type: 'ticket', operation: 'update', id: 'READY-1' });

      await new Promise(resolve => setTimeout(resolve, 10));
      assert.strictEqual(shownInfos.length, 1, 'Notification should be shown for valid transition');

      manager1.dispose();
      shownInfos = [];

      // Create new manager with same ticket already in done state
      const manager2 = new NotificationsManager(store2 as any as WorkflowStore, pipelineService as any as PipelineService);
      manager2.initialize(); // Should cache current state (done)

      // No notification should be triggered - ticket was already done
      assert.strictEqual(shownInfos.length, 0, 'Cached done ticket should not trigger notification on re-init');

      manager2.dispose();
    });

    test('fresh human-gate notifications work correctly after reload', async () => {
      const manager1 = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
      manager1.initialize();

      pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-1' });
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.strictEqual(shownInfos.length, 1, 'First human-gate notification');

      manager1.dispose();
      shownInfos = [];

      // After reload, different ticket should trigger notification
      const manager2 = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
      manager2.initialize();

      pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-2' });
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.strictEqual(shownInfos.length, 1, 'Different ticket should trigger new notification after reload');

      manager2.dispose();
    });
  });
});
