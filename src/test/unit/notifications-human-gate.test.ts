/**
 * Unit tests for showHumanGatePendingNotification
 *
 * Tests:
 * - showHumanGatePendingNotification with valid ticketId
 * - Message contains ticketId
 * - Two action buttons: "Open" and "Move to review"
 * - Fallback message when ticketId is undefined
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
  _fireChange: (event: StoreChangeEvent) => void;
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
    },
    _fireChange: (event: StoreChangeEvent) => {
      changeListeners.forEach(l => l(event));
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

suite('NotificationsManager - showHumanGatePendingNotification', () => {
  let store: MockStore;
  let pipelineService: MockPipelineService;
  let shownInfos: Array<{ message: string; actions: string[] }> = [];

  setup(() => {
    shownInfos = [];

    // Patch vscode mock to capture both message and actions
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

  suite('basic notification', () => {
    test('shows notification when manual-gate-human is activated with ticketId', async () => {
      const manager = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
      manager.initialize();

      pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-1' });

      await new Promise(resolve => setTimeout(resolve, 10));
      assert.strictEqual(shownInfos.length, 1, 'One notification should be shown');
      manager.dispose();
    });

    test('message contains ticketId', async () => {
      const manager = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
      manager.initialize();

      pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-1' });

      await new Promise(resolve => setTimeout(resolve, 10));
      assert.ok(shownInfos[0].message.includes('HUMAN-1'), 'Message should contain ticketId');
      manager.dispose();
    });

    test('provides "Open" and "Move to review" action buttons', async () => {
      const manager = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
      manager.initialize();

      pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: 'HUMAN-1' });

      await new Promise(resolve => setTimeout(resolve, 10));
      const actions = shownInfos[0].actions;
      assert.ok(actions.some(a => a.includes('Open')), 'Should have "Open" button');
      assert.ok(actions.some(a => a.includes('Move to review')), 'Should have "Move to review" button');
      manager.dispose();
    });

    test('fallback message when ticketId is undefined', async () => {
      const manager = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
      manager.initialize();

      pipelineService._fireManualGateActivated({ stage: 'manual-gate-human', ticketId: undefined });

      await new Promise(resolve => setTimeout(resolve, 10));
      assert.strictEqual(shownInfos.length, 1, 'Fallback notification should be shown');
      // Message should not contain a specific ticket ID when ticketId is undefined
      const message = shownInfos[0].message;
      assert.ok(message.includes('Pipeline') || message.includes('вмешательства'), 'Fallback message should be shown');
      manager.dispose();
    });

    test('no notification for non-human-gate stages', async () => {
      const manager = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
      manager.initialize();

      pipelineService._fireManualGateActivated({ stage: 'manual-gate-review', ticketId: 'TICKET-1' });

      await new Promise(resolve => setTimeout(resolve, 10));
      assert.strictEqual(shownInfos.length, 0, 'No notification for non-human-gate stages');
      manager.dispose();
    });
  });
});
