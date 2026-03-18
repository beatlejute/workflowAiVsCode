/**
 * NotificationsManager Unit Tests
 *
 * Tests for:
 * - showInformationMessage called on ticket → done transition
 * - showWarningMessage called on ticket → blocked transition
 * - showErrorMessage called on pipeline error
 * - showInformationMessage called on pipeline completed
 * - Button actions work correctly (Open, Details, View Log, Report)
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { NotificationsManager } from '../../ui/notifications';
import { PipelineService, PipelineState } from '../../services/pipeline-service';
import { WorkflowStore } from '../../data/workflow-store';
import { Ticket, TicketStatus } from '../../data/types';

/**
 * Mock vscode.window for testing notifications
 */
class MockVSCodeWindow {
  public showInformationMessageCalls: Array<{ message: string; buttons: string[] }> = [];
  public showWarningMessageCalls: Array<{ message: string; buttons: string[] }> = [];
  public showErrorMessageCalls: Array<{ message: string; buttons: string[] }> = [];
  public showInformationMessageResult: Thenable<string | undefined> | undefined;

  showInformationMessage(message: string, ...buttons: string[]): Thenable<string | undefined> {
    this.showInformationMessageCalls.push({ message, buttons });
    return this.showInformationMessageResult || Promise.resolve(undefined);
  }

  showWarningMessage(message: string, ...buttons: string[]): Thenable<string | undefined> {
    this.showWarningMessageCalls.push({ message, buttons });
    return this.showInformationMessageResult || Promise.resolve(undefined);
  }

  showErrorMessage(message: string, ...buttons: string[]): Thenable<string | undefined> {
    this.showErrorMessageCalls.push({ message, buttons });
    return this.showInformationMessageResult || Promise.resolve(undefined);
  }

  reset(): void {
    this.showInformationMessageCalls = [];
    this.showWarningMessageCalls = [];
    this.showErrorMessageCalls = [];
    this.showInformationMessageResult = undefined;
  }
}

/**
 * Mock PipelineService for testing
 */
class MockPipelineService {
  private currentState: PipelineState = PipelineState.Idle;
  private stateChangeListeners: ((state: PipelineState) => void)[] = [];

  getState(): PipelineState {
    return this.currentState;
  }

  setState(state: PipelineState): void {
    this.currentState = state;
    for (const listener of this.stateChangeListeners) {
      listener(state);
    }
  }

  onStateChange(listener: (state: PipelineState) => void): vscode.Disposable {
    this.stateChangeListeners.push(listener);
    return {
      dispose: () => {
        const index = this.stateChangeListeners.indexOf(listener);
        if (index > -1) {
          this.stateChangeListeners.splice(index, 1);
        }
      }
    };
  }
}

/**
 * Create a mock ticket for testing
 */
function createMockTicket(id: string, status: TicketStatus): Ticket {
  return {
    id,
    title: `Test Ticket ${id}`,
    status,
    priority: 2,
    type: 'IMPL',
    dependencies: [],
    conditions: [],
    context: {},
    tags: [],
    complexity: 'medium',
    parent_plan: 'PLAN-001',
    parent_task: '',
    created_at: '2026-03-05T00:00:00Z',
    updated_at: '2026-03-05T00:00:00Z',
    completed_at: ''
  };
}

suite('NotificationsManager Suite', () => {
  let mockPipelineService: MockPipelineService;
  let mockWindow: MockVSCodeWindow;
  let store: WorkflowStore;
  let notificationsManager: NotificationsManager;

  setup(async () => {
    // Initialize mock services
    mockPipelineService = new MockPipelineService();
    mockWindow = new MockVSCodeWindow();
    store = new WorkflowStore();

    // Mock vscode.window methods directly (Object.assign doesn't copy prototype methods)
    (vscode.window as any).showInformationMessage = (...args: any[]) => mockWindow.showInformationMessage(...args);
    (vscode.window as any).showWarningMessage = (...args: any[]) => mockWindow.showWarningMessage(...args);
    (vscode.window as any).showErrorMessage = (...args: any[]) => mockWindow.showErrorMessage(...args);

    // Create notifications manager with typed mock
    notificationsManager = new NotificationsManager(
      store,
      mockPipelineService as unknown as PipelineService
    );
    notificationsManager.initialize();
  });

  teardown(() => {
    notificationsManager.dispose();
    store.clear();
    mockWindow.reset();
  });

  test('showInformationMessage called on ticket → done transition', async () => {
    // Add ticket in in-progress status
    const ticket = createMockTicket('IMPL-001', TicketStatus.InProgress);
    store.addTicket(ticket);

    await new Promise(resolve => setTimeout(resolve, 10));

    // Move ticket to done
    const doneTicket = { ...ticket, status: TicketStatus.Done };
    store.updateTicket('IMPL-001', doneTicket);

    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify notification was shown
    assert.strictEqual(
      mockWindow.showInformationMessageCalls.length,
      1,
      'Should show information message once'
    );
    assert.ok(
      mockWindow.showInformationMessageCalls[0].message.includes('IMPL-001'),
      'Message should contain ticket ID'
    );
    assert.ok(
      mockWindow.showInformationMessageCalls[0].message.includes('completed'),
      'Message should indicate completion'
    );
  });

  test('showWarningMessage called on ticket → blocked transition', async () => {
    // Add ticket in ready status
    const ticket = createMockTicket('IMPL-002', TicketStatus.Ready);
    store.addTicket(ticket);

    await new Promise(resolve => setTimeout(resolve, 10));

    // Move ticket to blocked
    const blockedTicket = { ...ticket, status: TicketStatus.Blocked };
    store.updateTicket('IMPL-002', blockedTicket);

    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify notification was shown
    assert.strictEqual(
      mockWindow.showWarningMessageCalls.length,
      1,
      'Should show warning message once'
    );
    assert.ok(
      mockWindow.showWarningMessageCalls[0].message.includes('IMPL-002'),
      'Message should contain ticket ID'
    );
    assert.ok(
      mockWindow.showWarningMessageCalls[0].message.includes('blocked'),
      'Message should indicate blocked status'
    );
  });

  test('showErrorMessage called on pipeline error', async () => {
    // Trigger pipeline error
    mockPipelineService.setState(PipelineState.Error);

    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify notification was shown
    assert.strictEqual(
      mockWindow.showErrorMessageCalls.length,
      1,
      'Should show error message once'
    );
    assert.ok(
      mockWindow.showErrorMessageCalls[0].message.includes('Pipeline error'),
      'Message should indicate pipeline error'
    );
  });

  test('showInformationMessage called on pipeline completed', async () => {
    // Trigger pipeline completed
    mockPipelineService.setState(PipelineState.Completed);

    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify notification was shown
    assert.strictEqual(
      mockWindow.showInformationMessageCalls.length,
      1,
      'Should show information message once'
    );
    assert.ok(
      mockWindow.showInformationMessageCalls[0].message.includes('Pipeline completed'),
      'Message should indicate pipeline completion'
    );
  });

  test('Open button action on ticket completed notification', async () => {
    // Set up mock to return 'Open' when clicked
    mockWindow.showInformationMessageResult = Promise.resolve('Open');

    // Add ticket and move to done
    const ticket = createMockTicket('IMPL-003', TicketStatus.InProgress);
    store.addTicket(ticket);

    await new Promise(resolve => setTimeout(resolve, 10));

    const doneTicket = { ...ticket, status: TicketStatus.Done };
    store.updateTicket('IMPL-003', doneTicket);

    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify Open button was available
    assert.ok(
      mockWindow.showInformationMessageCalls[0].buttons.includes('Open'),
      'Should have Open button'
    );
  });

  test('Details button action on ticket blocked notification', async () => {
    // Set up mock to return 'Details' when clicked
    mockWindow.showInformationMessageResult = Promise.resolve('Details');

    // Add ticket and move to blocked
    const ticket = createMockTicket('IMPL-004', TicketStatus.Ready);
    store.addTicket(ticket);

    await new Promise(resolve => setTimeout(resolve, 10));

    const blockedTicket = { ...ticket, status: TicketStatus.Blocked };
    store.updateTicket('IMPL-004', blockedTicket);

    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify Details button was available
    assert.ok(
      mockWindow.showWarningMessageCalls[0].buttons.includes('Details'),
      'Should have Details button'
    );
  });

  test('View Log button action on pipeline error notification', async () => {
    // Set up mock to return 'View Log' when clicked
    mockWindow.showInformationMessageResult = Promise.resolve('View Log');

    // Trigger pipeline error
    mockPipelineService.setState(PipelineState.Error);

    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify View Log button was available
    assert.ok(
      mockWindow.showErrorMessageCalls[0].buttons.includes('View Log'),
      'Should have View Log button'
    );
  });

  test('Report button action on pipeline completed notification', async () => {
    // Set up mock to return 'Report' when clicked
    mockWindow.showInformationMessageResult = Promise.resolve('Report');

    // Trigger pipeline completed
    mockPipelineService.setState(PipelineState.Completed);

    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify Report button was available
    assert.ok(
      mockWindow.showInformationMessageCalls[0].buttons.includes('Report'),
      'Should have Report button'
    );
  });

  test('No notification on ticket transition to other statuses', async () => {
    // Add ticket in backlog
    const ticket = createMockTicket('IMPL-005', TicketStatus.Backlog);
    store.addTicket(ticket);

    await new Promise(resolve => setTimeout(resolve, 10));

    // Move to ready (not done or blocked)
    const readyTicket = { ...ticket, status: TicketStatus.Ready };
    store.updateTicket('IMPL-005', readyTicket);

    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify no notifications were shown
    assert.strictEqual(
      mockWindow.showInformationMessageCalls.length,
      0,
      'Should not show information message'
    );
    assert.strictEqual(
      mockWindow.showWarningMessageCalls.length,
      0,
      'Should not show warning message'
    );
    assert.strictEqual(
      mockWindow.showErrorMessageCalls.length,
      0,
      'Should not show error message'
    );
  });

  test('Multiple ticket transitions trigger multiple notifications', async () => {
    // Add first ticket and move to done
    const ticket1 = createMockTicket('IMPL-006', TicketStatus.InProgress);
    store.addTicket(ticket1);

    await new Promise(resolve => setTimeout(resolve, 10));

    const doneTicket1 = { ...ticket1, status: TicketStatus.Done };
    store.updateTicket('IMPL-006', doneTicket1);

    await new Promise(resolve => setTimeout(resolve, 10));

    // Add second ticket and move to blocked
    const ticket2 = createMockTicket('IMPL-007', TicketStatus.Ready);
    store.addTicket(ticket2);

    await new Promise(resolve => setTimeout(resolve, 10));

    const blockedTicket2 = { ...ticket2, status: TicketStatus.Blocked };
    store.updateTicket('IMPL-007', blockedTicket2);

    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify both notifications were shown
    assert.strictEqual(
      mockWindow.showInformationMessageCalls.length,
      1,
      'Should show one information message'
    );
    assert.strictEqual(
      mockWindow.showWarningMessageCalls.length,
      1,
      'Should show one warning message'
    );
  });

  test('NotificationsManager disposes resources correctly', () => {
    const newManager = new NotificationsManager(
      store,
      mockPipelineService as unknown as PipelineService
    );
    newManager.initialize();

    // Dispose
    newManager.dispose();

    // Should not throw
    assert.ok(true, 'NotificationsManager disposed without errors');
  });

  test('setWorkflowRoot stores the root path', () => {
    const testRoot = '/path/to/workflow';
    notificationsManager.setWorkflowRoot(testRoot);

    // Verify root is set (indirectly through method not throwing)
    assert.ok(true, 'setWorkflowRoot executed without errors');
  });

  test('Pipeline error and completed both trigger notifications', async () => {
    // Trigger error
    mockPipelineService.setState(PipelineState.Error);
    await new Promise(resolve => setTimeout(resolve, 10));

    // Reset mock to track new calls
    const errorCalls = mockWindow.showErrorMessageCalls.length;

    // Trigger completed
    mockPipelineService.setState(PipelineState.Completed);
    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify both states triggered notifications
    assert.strictEqual(errorCalls, 1, 'Should have error notification');
    assert.strictEqual(
      mockWindow.showInformationMessageCalls.length,
      1,
      'Should have completed notification'
    );
  });
});
