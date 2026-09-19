/**
 * Edge case test: Rapid state transitions (Running → Paused → Running → Paused)
 *
 * Tests that when multiple manual-gate events occur in rapid succession (within 100ms),
 * with different ticketIds, the deduplication logic correctly distinguishes between them
 * and shows both notifications instead of silently dropping one.
 *
 * This tests the hour-bucket dedup with different ticketIds to ensure:
 * 1. Same ticketId in same hour → deduplicated (shown once)
 * 2. Different ticketIds in same hour → NOT deduplicated (shown separately)
 *
 * Requirement: "дедуп различает разные события — не глотает ни одно (показываются обе нотификации)"
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
  eventEmitter?: { removeListener: (event: string, listener: any) => void };
}

interface MockPipelineService {
  onStateChange: (listener: (s: PipelineState) => void) => () => void;
  onManualGateActivated: (listener: (data: { stage: string | undefined; ticketId: string | undefined }) => void) => () => void;
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
      return () => {};
    },
    eventEmitter: {
      removeListener: (event: string, listener: any) => {
        const idx = changeListeners.indexOf(listener);
        if (idx >= 0) changeListeners.splice(idx, 1);
      }
    }
  };
}

function createMockPipelineService(): MockPipelineService {
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
        if (idx >= 0) stateChangeListeners.splice(idx, 1);
      } else if (event === 'manual-gate-activated') {
        const idx = gateActivatedListeners.indexOf(listener);
        if (idx >= 0) gateActivatedListeners.splice(idx, 1);
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

suite('Edge case: Rapid state transitions with dedup', () => {
  let store: MockStore;
  let pipelineService: MockPipelineService;
  let shownInfos: Array<{ message: string; ticketId?: string }> = [];

  setup(() => {
    shownInfos = [];

    const origInfo = vscode.window.showInformationMessage;
    (vscode.window as unknown as Record<string, unknown>)._origInfo = origInfo;

    vscode.window.showInformationMessage = (async (msg: string, ..._items: string[]) => {
      // Extract ticketId from message if present
      const ticketMatch = msg.match(/HUMAN-\d+/);
      shownInfos.push({ message: msg, ticketId: ticketMatch ? ticketMatch[0] : undefined });
      return undefined;
    }) as any;

    store = createMockStore();
    pipelineService = createMockPipelineService();
  });

  teardown(() => {
    const origInfo = (vscode.window as unknown as Record<string, unknown>)._origInfo;
    if (origInfo) { vscode.window.showInformationMessage = origInfo as typeof vscode.window.showInformationMessage; }
  });

  test('rapid Running→Paused→Running→Paused with different ticketIds shows both notifications', async () => {
    const fixedTime = 1000000;
    const originalDateNow = Date.now;
    Date.now = () => fixedTime;

    const manager = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
    manager.initialize();

    // Simulate rapid transitions: Running → Paused (HUMAN-1)
    pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-1' });
    await new Promise(resolve => setTimeout(resolve, 25));

    // → Running → Paused (HUMAN-2) — different ticketId, same hour-bucket
    pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-2' });
    await new Promise(resolve => setTimeout(resolve, 25));

    // → Running → Paused (HUMAN-3) — another different ticketId, same hour-bucket
    pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-3' });
    await new Promise(resolve => setTimeout(resolve, 25));

    // All three should be shown because they have different ticketIds
    assert.strictEqual(shownInfos.length, 3, 'All three notifications with different ticketIds should be shown');

    // Verify each has correct ticketId
    assert.strictEqual(shownInfos[0].ticketId, 'HUMAN-1');
    assert.strictEqual(shownInfos[1].ticketId, 'HUMAN-2');
    assert.strictEqual(shownInfos[2].ticketId, 'HUMAN-3');

    Date.now = originalDateNow;
    manager.dispose();
  });

  test('rapid transitions with same ticketId shows only one notification (dedup)', async () => {
    const fixedTime = 1000000;
    const originalDateNow = Date.now;
    Date.now = () => fixedTime;

    const manager = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
    manager.initialize();

    // Same ticketId, same hour-bucket
    pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-1' });
    await new Promise(resolve => setTimeout(resolve, 25));

    // Same ticketId again → should be deduplicated
    pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-1' });
    await new Promise(resolve => setTimeout(resolve, 25));

    // Same ticketId third time → still deduplicated
    pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-1' });
    await new Promise(resolve => setTimeout(resolve, 25));

    // Only first event should be shown
    assert.strictEqual(shownInfos.length, 1, 'Only one notification with same ticketId in same hour should be shown');
    assert.strictEqual(shownInfos[0].ticketId, 'HUMAN-1');

    Date.now = originalDateNow;
    manager.dispose();
  });

  test('mixed rapid transitions: same and different ticketIds are deduplicated correctly', async () => {
    const fixedTime = 1000000;
    const originalDateNow = Date.now;
    Date.now = () => fixedTime;

    const manager = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
    manager.initialize();

    // First HUMAN-1
    pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-1' });
    await new Promise(resolve => setTimeout(resolve, 15));

    // HUMAN-1 again (duplicate)
    pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-1' });
    await new Promise(resolve => setTimeout(resolve, 15));

    // HUMAN-2 (different)
    pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-2' });
    await new Promise(resolve => setTimeout(resolve, 15));

    // HUMAN-1 again (duplicate)
    pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-1' });
    await new Promise(resolve => setTimeout(resolve, 15));

    // HUMAN-2 again (duplicate)
    pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-2' });
    await new Promise(resolve => setTimeout(resolve, 25));

    // Should have exactly 2: HUMAN-1 and HUMAN-2 (no duplicates)
    assert.strictEqual(shownInfos.length, 2, 'Should have exactly 2 notifications');
    assert.strictEqual(shownInfos[0].ticketId, 'HUMAN-1');
    assert.strictEqual(shownInfos[1].ticketId, 'HUMAN-2');

    Date.now = originalDateNow;
    manager.dispose();
  });
});
