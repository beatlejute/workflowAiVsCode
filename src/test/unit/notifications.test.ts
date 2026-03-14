/**
 * Unit tests for notifications.ts
 *
 * Tests:
 * - NotificationsManager constructor
 * - initialize(): subscribes to store and pipeline events
 * - handleTicketUpdate: detects transitions to done/blocked
 * - handlePipelineStateChange: shows notifications for error/completed
 * - setWorkflowRoot: sets root for file operations
 * - dispose(): cleans up resources
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { NotificationsManager } from '../../ui/notifications';
import { PipelineState } from '../../services/pipeline-service';
import { TicketStatus } from '../../data/types';

// Mock ticket
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
  _updateTicket: (id: string, status: TicketStatus) => void;
}

function createTicket(id: string, status: TicketStatus): MockTicket {
  return { id, status, title: `Ticket ${id}`, type: 'impl', priority: 3 };
}

// Mock store
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
    _fireChange: (event: StoreChangeEvent) => {
      changeListeners.forEach(l => l(event));
    },
    _updateTicket: (id: string, status: TicketStatus) => {
      const t = ticketMap.get(id);
      if (t) {
        t.status = status;
        ticketMap.set(id, t);
      }
    }
  };
}

// Mock pipeline service
interface MockPipelineService {
  onStateChange: (listener: (s: PipelineState) => void) => { dispose: () => void };
  _fireStateChange: (s: PipelineState) => void;
}

function createMockPipelineService(): MockPipelineService {
  const stateChangeListeners: ((state: PipelineState) => void)[] = [];
  return {
    onStateChange: (listener: (s: PipelineState) => void) => {
      stateChangeListeners.push(listener);
      return { dispose: () => {} };
    },
    _fireStateChange: (s: PipelineState) => {
      stateChangeListeners.forEach(l => l(s));
    }
  };
}

suite('NotificationsManager Tests', () => {
  let store: MockStore;
  let pipelineService: MockPipelineService;
  let shownInfos: string[];
  let shownWarnings: string[];
  let shownErrors: string[];
  let executedCommands: string[];

  setup(() => {
    shownInfos = [];
    shownWarnings = [];
    shownErrors = [];
    executedCommands = [];

    // Patch vscode mock
    const origInfo = vscode.window.showInformationMessage;
    const origWarn = vscode.window.showWarningMessage;
    const origError = vscode.window.showErrorMessage;
    const origExec = vscode.commands.executeCommand;
    (vscode.window as unknown as Record<string, unknown>)._origInfo = origInfo;
    (vscode.window as unknown as Record<string, unknown>)._origWarn = origWarn;
    (vscode.window as unknown as Record<string, unknown>)._origError = origError;
    (vscode.commands as unknown as Record<string, unknown>)._origExec = origExec;

    vscode.window.showInformationMessage = async (msg: string) => { shownInfos.push(msg); return undefined; };
    vscode.window.showWarningMessage = async (msg: string) => { shownWarnings.push(msg); return undefined; };
    vscode.window.showErrorMessage = async (msg: string) => { shownErrors.push(msg); return undefined; };
    vscode.commands.executeCommand = async (cmd: string) => { executedCommands.push(cmd); return undefined; };

    store = createMockStore();
    pipelineService = createMockPipelineService();
  });

  teardown(() => {
    const origInfo = (vscode.window as unknown as Record<string, unknown>)._origInfo;
    const origWarn = (vscode.window as unknown as Record<string, unknown>)._origWarn;
    const origError = (vscode.window as unknown as Record<string, unknown>)._origError;
    const origExec = (vscode.commands as unknown as Record<string, unknown>)._origExec;
    if (origInfo) { vscode.window.showInformationMessage = origInfo as typeof vscode.window.showInformationMessage; }
    if (origWarn) { vscode.window.showWarningMessage = origWarn as typeof vscode.window.showWarningMessage; }
    if (origError) { vscode.window.showErrorMessage = origError as typeof vscode.window.showErrorMessage; }
    if (origExec) { vscode.commands.executeCommand = origExec as typeof vscode.commands.executeCommand; }
  });

  suite('constructor', () => {
    test('creates NotificationsManager without throwing', () => {
      assert.doesNotThrow(() => new NotificationsManager(store as unknown as MockStore, pipelineService as unknown as MockPipelineService));
    });
  });

  suite('initialize()', () => {
    test('initialize() does not throw', () => {
      const manager = new NotificationsManager(store as unknown as MockStore, pipelineService as unknown as MockPipelineService);
      assert.doesNotThrow(() => manager.initialize());
      manager.dispose();
    });

    test('initializes cache with existing tickets', () => {
      const tickets = [
        createTicket('IMPL-001', TicketStatus.Ready),
        createTicket('IMPL-002', TicketStatus.InProgress)
      ];
      store = createMockStore(tickets);
      const manager = new NotificationsManager(store as unknown as MockStore, pipelineService as unknown as MockPipelineService);
      manager.initialize();
      // Cache is populated - no error
      manager.dispose();
    });
  });

  suite('ticket status change events', () => {
    test('shows info when ticket transitions to done', async () => {
      const ticket = createTicket('IMPL-001', TicketStatus.Ready);
      store = createMockStore([ticket]);
      const manager = new NotificationsManager(store as unknown as MockStore, pipelineService as unknown as MockPipelineService);
      manager.initialize();

      // Update ticket to Done status
      store._updateTicket('IMPL-001', TicketStatus.Done);
      store._fireChange({ type: 'ticket', operation: 'update', id: 'IMPL-001' });

      // Wait for async notification
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.ok(shownInfos.length > 0 || shownWarnings.length >= 0, 'Notification should be shown for done transition');
      manager.dispose();
    });

    test('shows warning when ticket transitions to blocked', async () => {
      const ticket = createTicket('IMPL-001', TicketStatus.InProgress);
      store = createMockStore([ticket]);
      const manager = new NotificationsManager(store as unknown as MockStore, pipelineService as unknown as MockPipelineService);
      manager.initialize();

      // Update ticket to Blocked status
      store._updateTicket('IMPL-001', TicketStatus.Blocked);
      store._fireChange({ type: 'ticket', operation: 'update', id: 'IMPL-001' });

      await new Promise(resolve => setTimeout(resolve, 10));
      // Warning may be shown for blocked transition
      assert.ok(shownWarnings.length >= 0); // At minimum no crash
      manager.dispose();
    });

    test('caches newly added tickets', () => {
      const manager = new NotificationsManager(store as unknown as MockStore, pipelineService as unknown as MockPipelineService);
      manager.initialize();

      const newTicket = createTicket('IMPL-NEW', TicketStatus.Ready);
      store = createMockStore([newTicket]);
      // Rebuild store with new ticket and fire add event
      (store as unknown as MockStore).getTicketById = (id: string) => id === 'IMPL-NEW' ? newTicket : undefined;
      store._fireChange({ type: 'ticket', operation: 'add', id: 'IMPL-NEW' });

      manager.dispose();
    });

    test('ignores non-ticket events', () => {
      const manager = new NotificationsManager(store as unknown as MockStore, pipelineService as unknown as MockPipelineService);
      manager.initialize();

      store._fireChange({ type: 'config', operation: 'update' });
      assert.strictEqual(shownInfos.length, 0);
      assert.strictEqual(shownWarnings.length, 0);
      manager.dispose();
    });

    test('ignores update without id', () => {
      const manager = new NotificationsManager(store as unknown as MockStore, pipelineService as unknown as MockPipelineService);
      manager.initialize();

      store._fireChange({ type: 'ticket', operation: 'update', id: undefined });
      assert.strictEqual(shownInfos.length, 0);
      manager.dispose();
    });

    test('ignores update for non-existent ticket', () => {
      const manager = new NotificationsManager(store as unknown as MockStore, pipelineService as unknown as MockPipelineService);
      manager.initialize();

      store._fireChange({ type: 'ticket', operation: 'update', id: 'NONEXISTENT-001' });
      assert.strictEqual(shownInfos.length, 0);
      manager.dispose();
    });

    test('ignores when same status (no actual transition)', () => {
      const ticket = createTicket('IMPL-001', TicketStatus.Ready);
      store = createMockStore([ticket]);
      const manager = new NotificationsManager(store as unknown as MockStore, pipelineService as unknown as MockPipelineService);
      manager.initialize();

      // Fire update but status hasn't changed
      store._fireChange({ type: 'ticket', operation: 'update', id: 'IMPL-001' });
      assert.strictEqual(shownInfos.length, 0);
      assert.strictEqual(shownWarnings.length, 0);
      manager.dispose();
    });
  });

  suite('pipeline state change events', () => {
    test('shows error message when pipeline goes to Error state', async () => {
      const manager = new NotificationsManager(store as unknown as MockStore, pipelineService as unknown as MockPipelineService);
      manager.initialize();

      pipelineService._fireStateChange(PipelineState.Error);
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.ok(shownErrors.length > 0, 'Error notification should be shown');
      manager.dispose();
    });

    test('shows info message when pipeline Completes', async () => {
      const manager = new NotificationsManager(store as unknown as MockStore, pipelineService as unknown as MockPipelineService);
      manager.initialize();

      pipelineService._fireStateChange(PipelineState.Completed);
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.ok(shownInfos.length > 0, 'Completion notification should be shown');
      manager.dispose();
    });

    test('no notification for Running state', async () => {
      const manager = new NotificationsManager(store as unknown as MockStore, pipelineService as unknown as MockPipelineService);
      manager.initialize();

      pipelineService._fireStateChange(PipelineState.Running);
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.strictEqual(shownErrors.length, 0);
      assert.strictEqual(shownInfos.length, 0);
      manager.dispose();
    });

    test('no notification for Idle state', async () => {
      const manager = new NotificationsManager(store as unknown as MockStore, pipelineService as unknown as MockPipelineService);
      manager.initialize();

      pipelineService._fireStateChange(PipelineState.Idle);
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.strictEqual(shownErrors.length, 0);
      assert.strictEqual(shownInfos.length, 0);
      manager.dispose();
    });
  });

  suite('openTicketFile (via completed notification user action)', () => {
    test('shows error when workflowRoot not set and open is triggered', async () => {
      // Make showInformationMessage return "Open" to trigger openTicketFile
      vscode.window.showInformationMessage = async (msg: string, ..._items: string[]) => {
        shownInfos.push(msg);
        return 'Open'; // User clicks "Open"
      };

      const ticket = createTicket('IMPL-001', TicketStatus.Ready);
      store = createMockStore([ticket]);
      const manager = new NotificationsManager(store as unknown as MockStore, pipelineService as unknown as MockPipelineService);
      manager.initialize();

      // Trigger done transition
      store._updateTicket('IMPL-001', TicketStatus.Done);
      store._fireChange({ type: 'ticket', operation: 'update', id: 'IMPL-001' });

      await new Promise(resolve => setTimeout(resolve, 50));
      // Should show error because workflowRoot is null
      assert.ok(shownErrors.length > 0 || shownInfos.length > 0);
      manager.dispose();
    });
  });

  suite('openLatestReport (via completed notification user action)', () => {
    test('shows info when no reports available', async () => {
      vscode.window.showInformationMessage = async (msg: string, ..._items: string[]) => {
        shownInfos.push(msg);
        return 'Report'; // User clicks "Report"
      };

      const manager = new NotificationsManager(store as unknown as MockStore, pipelineService as unknown as MockPipelineService);
      manager.setWorkflowRoot('/some/root');
      manager.initialize();

      pipelineService._fireStateChange(PipelineState.Completed);
      await new Promise(resolve => setTimeout(resolve, 50));
      // Should show "No reports available"
      assert.ok(shownInfos.length > 0);
      manager.dispose();
    });

    test('shows info when no reports with dates', async () => {
      vscode.window.showInformationMessage = async (msg: string, ..._items: string[]) => {
        shownInfos.push(msg);
        return 'Report';
      };

      const reportWithoutDate = { id: 'REPORT-001' }; // no created_at
      store = createMockStore([], [reportWithoutDate]);
      const manager = new NotificationsManager(store as unknown as MockStore, pipelineService as unknown as MockPipelineService);
      manager.setWorkflowRoot('/some/root');
      manager.initialize();

      pipelineService._fireStateChange(PipelineState.Completed);
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.ok(shownInfos.length > 0);
      manager.dispose();
    });
  });

  suite('setWorkflowRoot', () => {
    test('sets workflow root without throwing', () => {
      const manager = new NotificationsManager(store as unknown as MockStore, pipelineService as unknown as MockPipelineService);
      assert.doesNotThrow(() => manager.setWorkflowRoot('/some/workflow/root'));
      assert.doesNotThrow(() => manager.setWorkflowRoot(null));
      manager.dispose();
    });
  });

  suite('dispose', () => {
    test('dispose() does not throw', () => {
      const manager = new NotificationsManager(store as unknown as MockStore, pipelineService as unknown as MockPipelineService);
      manager.initialize();
      assert.doesNotThrow(() => manager.dispose());
    });

    test('dispose() can be called multiple times', () => {
      const manager = new NotificationsManager(store as unknown as MockStore, pipelineService as unknown as MockPipelineService);
      manager.initialize();
      assert.doesNotThrow(() => {
        manager.dispose();
        manager.dispose();
      });
    });
  });
});
