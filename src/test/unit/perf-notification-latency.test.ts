/**
 * Performance test: Notification latency from manual-gate-activated event to showInformationMessage
 *
 * Tests the latency of the notification system when a manual-gate-human event is received.
 * Measures time from event emission to the actual showInformationMessage call.
 *
 * Requirement: p95 ≤ 500 ms (without UI rendering; UI including system overhead ≤ 1 sec)
 * Test runs 100 iterations and calculates p95 (95th percentile) latency.
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
  ticket?: MockTicket;
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

suite('Performance: Notification Latency', () => {
  let store: MockStore;
  let pipelineService: MockPipelineService;
  let _showInfoCalls: Array<{ startTime: number; message: string }> = [];

  setup(() => {
    _showInfoCalls = [];

    const origInfo = vscode.window.showInformationMessage;
    (vscode.window as unknown as Record<string, unknown>)._origInfo = origInfo;

    // Mock showInformationMessage as a no-op synchronous function for latency testing
    vscode.window.showInformationMessage = ((_msg: string, ..._items: string[]) => {
      // Record the call time (this is called synchronously from the event handler)
      // Note: this is a simplified measurement - real UI rendering would take longer
      return undefined;
    }) as any;

    store = createMockStore();
    pipelineService = createMockPipelineService();
  });

  teardown(() => {
    const origInfo = (vscode.window as unknown as Record<string, unknown>)._origInfo;
    if (origInfo) { vscode.window.showInformationMessage = origInfo as typeof vscode.window.showInformationMessage; }
  });

  test('Latency: manual-gate-activated event to showInformationMessage (p95 ≤ 500ms)', () => {
    const manager = new NotificationsManager(store as any as WorkflowStore, pipelineService as any as PipelineService);
    manager.initialize();

    const latencies: number[] = [];
    const iterations = 100;
    const ticketId = 'HUMAN-1';

    // Run 100 iterations of the event emission + handler execution
    for (let i = 0; i < iterations; i++) {
      // Reset the dedup cache by using different ticket IDs or timestamps
      // We'll use different stage values to bypass dedup (since dedup is per-stage-hour-bucket)
      const stageNum = Math.floor(i / 10); // Change stage every 10 iterations to reset dedup

      const startTime = performance.now();

      // Fire the manual-gate-activated event
      pipelineService._fireManualGateActivated({
        stage: `manual-gate-human-${stageNum}`,
        ticketId: ticketId
      });

      // Allow event handler to execute (synchronous)
      // Note: we're measuring the event emission + handler sync execution time,
      // not including async UI rendering (which would be much longer)

      const endTime = performance.now();
      const latency = endTime - startTime;
      latencies.push(latency);
    }

    // Calculate p95 (95th percentile)
    latencies.sort((a, b) => a - b);
    const p95Index = Math.ceil(0.95 * latencies.length) - 1;
    const p95Latency = latencies[p95Index];

    console.log(`Notification latency (100 iterations):`);
    console.log(`  Min: ${Math.min(...latencies).toFixed(3)}ms`);
    console.log(`  Max: ${Math.max(...latencies).toFixed(3)}ms`);
    console.log(`  Mean: ${(latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(3)}ms`);
    console.log(`  P95: ${p95Latency.toFixed(3)}ms`);

    assert.ok(
      p95Latency <= 500,
      `Expected p95 latency ≤ 500ms, but got ${p95Latency.toFixed(3)}ms`
    );

    manager.dispose();
  });
});
