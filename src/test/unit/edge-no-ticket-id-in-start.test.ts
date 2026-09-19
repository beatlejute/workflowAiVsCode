/**
 * Edge case test: START without ticket_id
 *
 * Tests that when a START event for manual-gate-human is received without a ticket= field
 * (from an old runner that hasn't been updated), the notification system gracefully shows
 * a fallback message instead of crashing.
 *
 * Requirement: "Pipeline waits for human intervention" (fallback message)
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

suite('Edge case: START without ticket_id', () => {
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

  test('START stage="manual-gate-human" without ticket= shows fallback notification', async () => {
    const manager = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
    manager.initialize();

    // Simulate START without ticket_id (old runner scenario)
    pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: undefined });

    await new Promise(resolve => setTimeout(resolve, 20));

    assert.strictEqual(shownInfos.length, 1, 'Notification should be shown');
    const message = shownInfos[0].message;

    // Check for fallback message containing required text
    // According to plan: "Pipeline waits for human intervention"
    assert.ok(
      message.includes('Pipeline') && message.includes('intervention') ||
      message.includes('Pipeline') && message.includes('ручного'),
      `Fallback message should contain "Pipeline waits for human intervention", got: "${message}"`
    );

    manager.dispose();
  });

  test('extension does not crash when handling START without ticket_id', async () => {
    const manager = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
    manager.initialize();

    let exceptionThrown = false;
    try {
      pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: undefined });
      await new Promise(resolve => setTimeout(resolve, 20));
    } catch (_e) {
      exceptionThrown = true;
    }

    assert.strictEqual(exceptionThrown, false, 'No exception should be thrown');
    assert.ok(shownInfos.length > 0, 'Notification should still be attempted despite undefined ticket');

    manager.dispose();
  });

  test('notification fallback does not have Open button without ticketId', async () => {
    const manager = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
    manager.initialize();

    pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: undefined });

    await new Promise(resolve => setTimeout(resolve, 20));

    assert.strictEqual(shownInfos.length, 1, 'Notification should be shown');
    const actions = shownInfos[0].actions;

    // When ticketId is undefined, Open button should not be present or should be disabled
    // The fallback should only show "Move to review" or similar action if applicable
    assert.ok(
      actions.length === 0 || actions.every(a => !a.includes('Open')),
      'Open button should not be present without ticketId'
    );

    manager.dispose();
  });
});
