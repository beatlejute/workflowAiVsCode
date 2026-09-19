/**
 * Unit tests for showHumanGatePendingNotification deduplication
 *
 * Tests:
 * - Repeated events with same ticketId in same hour-bucket are deduplicated
 * - showInformationMessage is called exactly once for duplicate events
 * - Different hour-buckets allow new notifications
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
  onDidChange: (listener: (e: StoreChangeEvent) => void) => () => void;
}

interface MockPipelineService {
  onStateChange: (listener: (s: PipelineState) => void) => () => void;
  onManualGateActivated: (listener: (data: { stage: string | undefined; ticketId: string | undefined }) => void) => () => void;
  _fireManualGateActivated: (data: { stage: string | undefined; ticketId: string | undefined }) => void;
  _fireStateChange: (s: PipelineState) => void;
}

function createMockStore(tickets: MockTicket[] = [], reports: unknown[] = []): MockStore & { eventEmitter: { removeListener: (event: string, listener: any) => void } } {
  const changeListeners: ((event: StoreChangeEvent) => void)[] = [];
  const ticketMap = new Map<string, MockTicket>(tickets.map(t => [t.id, t]));

  return {
    getTickets: () => tickets,
    getTicketById: (id: string) => ticketMap.get(id),
    getReports: () => reports,
    onDidChange: (listener: (e: StoreChangeEvent) => void) => {
      changeListeners.push(listener);
      return () => {};
    },
    eventEmitter: {
      removeListener: (event: string, listener: any) => {
        if (event === 'change') {
          const idx = changeListeners.indexOf(listener);
          if (idx >= 0) { changeListeners.splice(idx, 1); }
        }
      }
    }
  };
}

function createMockPipelineService(): MockPipelineService & { removeListener: (event: string, listener: any) => void } {
  const stateChangeListeners: ((state: PipelineState) => void)[] = [];
  const gateActivatedListeners: ((data: { stage: string | undefined; ticketId: string | undefined }) => void)[] = [];

  return {
    onStateChange: (listener: (s: PipelineState) => void) => {
      stateChangeListeners.push(listener);
      return () => {};
    },
    onManualGateActivated: (listener: (data: { stage: string | undefined; ticketId: string | undefined }) => void) => {
      gateActivatedListeners.push(listener);
      return () => {};
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
}

suite('NotificationsManager - showHumanGatePendingNotification (dedup)', () => {
  let store: MockStore;
  let pipelineService: MockPipelineService;
  let showInfoMessageCallCount: number = 0;
  let originalDateNow: () => number;

  setup(() => {
    showInfoMessageCallCount = 0;
    originalDateNow = Date.now;

    // Patch vscode mock to count calls
    const origInfo = vscode.window.showInformationMessage;
    (vscode.window as unknown as Record<string, unknown>)._origInfo = origInfo;

    vscode.window.showInformationMessage = (async (_msg: string, ..._items: string[]) => {
      showInfoMessageCallCount++;
      return undefined;
    }) as any;

    store = createMockStore();
    pipelineService = createMockPipelineService();
  });

  teardown(() => {
    const origInfo = (vscode.window as unknown as Record<string, unknown>)._origInfo;
    if (origInfo) { vscode.window.showInformationMessage = origInfo as typeof vscode.window.showInformationMessage; }
    Date.now = originalDateNow;
  });

  suite('deduplication by hour-bucket', () => {
    test('same ticketId in same hour-bucket is deduplicated', async () => {
      // Mock Date.now to return same hour-bucket
      const fixedTime = 1000000;
      Date.now = () => fixedTime;

      const manager = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
      manager.initialize();

      // First event
      pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-1' });
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.strictEqual(showInfoMessageCallCount, 1, 'First event should show notification');

      // Second event with same ticketId at same time (same hour-bucket)
      pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-1' });
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.strictEqual(showInfoMessageCallCount, 1, 'Second event in same hour-bucket should be deduplicated');

      manager.dispose();
    });

    test('different ticketIds in same hour-bucket are NOT deduplicated', async () => {
      const fixedTime = 1000000;
      Date.now = () => fixedTime;

      const manager = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
      manager.initialize();

      // First event with HUMAN-1
      pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-1' });
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.strictEqual(showInfoMessageCallCount, 1, 'First notification should be shown');

      // Second event with HUMAN-2 at same time (same hour-bucket but different ticketId)
      pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-2' });
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.strictEqual(showInfoMessageCallCount, 2, 'Different ticketId should create new notification');

      manager.dispose();
    });

    test('same ticketId in different hour-buckets creates new notification', async () => {
      let currentTime = 1000000;
      Date.now = () => currentTime;

      const manager = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
      manager.initialize();

      // First event in hour-bucket 1
      pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-1' });
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.strictEqual(showInfoMessageCallCount, 1, 'First notification should be shown');

      // Second event in different hour-bucket (3600001 ms = 1 hour later)
      currentTime = 1000000 + 3_600_001;
      pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-1' });
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.strictEqual(showInfoMessageCallCount, 2, 'Different hour-bucket should create new notification');

      manager.dispose();
    });

    test('multiple sequential events in same hour-bucket are deduplicated', async () => {
      const fixedTime = 1000000;
      Date.now = () => fixedTime;

      const manager = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
      manager.initialize();

      // Simulate 3 events in rapid succession
      pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-1' });
      await new Promise(resolve => setTimeout(resolve, 5));
      pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-1' });
      await new Promise(resolve => setTimeout(resolve, 5));
      pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-1' });
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.strictEqual(showInfoMessageCallCount, 1, 'All events in same hour-bucket should be deduplicated to 1');

      manager.dispose();
    });
  });
});
