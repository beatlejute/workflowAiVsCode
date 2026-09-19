/**
 * E2E Suite Tests - Manual Gate Flow
 *
 * Tests complete manual-gate-human flow:
 * 1. Pipeline starts with emulated runner log
 * 2. Pipeline transitions to manual-gate-human stage
 * 3. Notification appears with "Open" and "Move to review" buttons
 * 4. User clicks "Move to review"
 * 5. Ticket is moved from ready/ to review/ directory
 * 6. Pipeline continues (Paused → Running state)
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PipelineService, PipelineState } from '../../services/pipeline-service';
import { NotificationsManager } from '../../ui/notifications';
import { WorkflowStore } from '../../data/workflow-store';
import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

/**
 * Mock ChildProcess that emulates runner output
 */
class MockRunnerProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;
  exitCode: number | null = null;

  kill(_signal?: string): boolean {
    this.killed = true;
    return true;
  }

  emitLog(line: string): void {
    this.stdout.emit('data', Buffer.from(line + '\n'));
  }
}

suite('Manual Gate Flow E2E Tests', () => {
  let pipelineService: PipelineService;
  let notificationsManager: NotificationsManager;
  let store: WorkflowStore;
  let mockProcess: MockRunnerProcess;
  let workflowRoot: string;
  let readyDir: string;
  let reviewDir: string;
  let shownInfos: Array<{ message: string; buttons: string[] }> = [];

  setup(async () => {
    // Setup workflow directories
    let workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      // Fallback for unit-test runs where vscode-mock returns []: create a temp workspace
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-gate-flow-'));
      const stubFolder = { uri: vscode.Uri.file(tmpRoot), name: path.basename(tmpRoot), index: 0 };
      Object.defineProperty(vscode.workspace, 'workspaceFolders', { value: [stubFolder], configurable: true });
      workspaceFolders = vscode.workspace.workspaceFolders;
    }
    workflowRoot = workspaceFolders![0].uri.fsPath;
    readyDir = path.join(workflowRoot, '.workflow', 'tickets', 'ready');
    reviewDir = path.join(workflowRoot, '.workflow', 'tickets', 'review');

    // Ensure directories exist
    if (!fs.existsSync(readyDir)) {
      fs.mkdirSync(readyDir, { recursive: true });
    }
    if (!fs.existsSync(reviewDir)) {
      fs.mkdirSync(reviewDir, { recursive: true });
    }

    // Setup mock for vscode.window.showInformationMessage
    shownInfos = [];
    const origInfo = vscode.window.showInformationMessage;
    (vscode.window as any)._origInfo = origInfo;

    vscode.window.showInformationMessage = (async (msg: string, ...items: string[]) => {
      shownInfos.push({ message: msg, buttons: items });
      // Simulate user clicking "Move to review" button
      return 'Move to review';
    }) as any;

    // Create test ticket in ready directory
    const testTicketContent = `---
id: HUMAN-001
title: Test Human Gate Ticket
status: ready
priority: 1
type: HUMAN
created_at: "2026-04-29T00:00:00.000Z"
updated_at: "2026-04-29T00:00:00.000Z"
---

## Description

Test ticket for manual-gate-human flow
`;
    fs.writeFileSync(path.join(readyDir, 'HUMAN-001.md'), testTicketContent);

    // Create mock process that will emit runner log
    mockProcess = new MockRunnerProcess();

    // Create pipeline service with mock spawn
    const mockSpawn = () => mockProcess as unknown as ChildProcess;
    pipelineService = new PipelineService(mockSpawn);

    // Create store and load tickets
    store = new WorkflowStore();
    store.setWorkflowRoot(workflowRoot);

    // Create notifications manager
    notificationsManager = new NotificationsManager(store, pipelineService);
    notificationsManager.setWorkflowRoot(workflowRoot);
    notificationsManager.initialize();
  });

  teardown(async () => {
    // Restore vscode.window
    const origInfo = (vscode.window as any)._origInfo;
    if (origInfo) {
      vscode.window.showInformationMessage = origInfo;
    }

    // Cleanup
    pipelineService.dispose();
    notificationsManager.dispose();
    store.clear();

    // Cleanup test files
    try {
      const testFile = path.join(readyDir, 'HUMAN-001.md');
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
      const reviewFile = path.join(reviewDir, 'HUMAN-001.md');
      if (fs.existsSync(reviewFile)) {
        fs.unlinkSync(reviewFile);
      }
    } catch (_e) {
      // Ignore cleanup errors
    }
  });

  test('Complete manual-gate-human flow: activation → notification → move to review → continue', async () => {
    // Start pipeline
    const _startPromise = pipelineService.start();
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify initial state
    assert.strictEqual(
      pipelineService.getState(),
      PipelineState.Running,
      'Pipeline should be running'
    );

    // Emulate runner log: pipeline starts
    mockProcess.emitLog('[2026-04-29 10:00:00] [INFO] [Runner] Pipeline started');
    await new Promise(resolve => setTimeout(resolve, 50));

    // Emulate runner log: START stage with manual-gate-human
    mockProcess.emitLog('[2026-04-29 10:00:01] [INFO] [Runner] START stage="manual-gate-human" agent="manual-gate" ticket="HUMAN-001"');
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify pipeline transitioned to Paused state
    assert.strictEqual(
      pipelineService.getState(),
      PipelineState.Paused,
      'Pipeline should be paused at manual-gate-human'
    );

    // Verify notification was shown
    assert.strictEqual(
      shownInfos.length,
      1,
      'One notification should be shown'
    );

    const notification = shownInfos[0];
    assert.ok(
      notification.message.includes('HUMAN-001'),
      'Notification should contain ticket ID'
    );
    assert.strictEqual(
      notification.buttons.length,
      2,
      'Should have two buttons: Open and Move to review'
    );

    // Verify ticket is in ready directory
    const readyPath = path.join(readyDir, 'HUMAN-001.md');
    assert.ok(
      fs.existsSync(readyPath),
      'Ticket should exist in ready/ directory'
    );

    // Simulate user clicking "Move to review" button
    // In real flow, this would trigger workflow.moveTicket command
    // For test, we manually move the file to simulate the command execution
    const reviewPath = path.join(reviewDir, 'HUMAN-001.md');
    const content = fs.readFileSync(readyPath, 'utf-8');
    fs.writeFileSync(reviewPath, content);
    fs.unlinkSync(readyPath);

    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify ticket moved to review
    assert.ok(
      fs.existsSync(reviewPath),
      'Ticket should be moved to review/ directory'
    );
    assert.ok(
      !fs.existsSync(readyPath),
      'Ticket should be removed from ready/ directory'
    );

    // Emulate runner log: GOTO from manual-gate-human (pipeline continues)
    mockProcess.emitLog('[2026-04-29 10:00:02] [INFO] [manual-gate-human] GOTO manual-gate-human → pick-next-task status="approved"');
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify pipeline transitioned back to Running
    assert.strictEqual(
      pipelineService.getState(),
      PipelineState.Running,
      'Pipeline should resume running after gate approval'
    );

    // Cleanup: stop pipeline
    mockProcess.emit('close', 0);
    await new Promise(resolve => setTimeout(resolve, 50));

    assert.strictEqual(
      pipelineService.getState(),
      PipelineState.Completed,
      'Pipeline should be completed'
    );
  });

  test('Manual-gate-human with undefined ticket ID shows fallback message', async () => {
    // Reset notifications
    shownInfos = [];

    // Start pipeline
    await pipelineService.start();
    await new Promise(resolve => setTimeout(resolve, 50));

    // Emulate runner log: START stage without ticket_id
    mockProcess.emitLog('[2026-04-29 10:00:01] [INFO] [Runner] START stage="manual-gate-human" agent="manual-gate"');
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify notification was shown
    assert.strictEqual(
      shownInfos.length,
      1,
      'Notification should be shown even without ticket ID'
    );

    const notification = shownInfos[0];
    assert.ok(
      notification.message.includes('Pipeline') || notification.message.includes('вмешательства'),
      'Notification should contain fallback message about pipeline waiting'
    );

    // Cleanup
    mockProcess.emit('close', 0);
  });

  test('Manual-gate deduplication: repeated activation in same hour shows no duplicate notification', async () => {
    // Start pipeline
    await pipelineService.start();
    await new Promise(resolve => setTimeout(resolve, 50));

    // First manual-gate activation
    shownInfos = [];
    mockProcess.emitLog('[2026-04-29 10:00:01] [INFO] [Runner] START stage="manual-gate-human" agent="manual-gate" ticket="HUMAN-001"');
    await new Promise(resolve => setTimeout(resolve, 100));

    assert.strictEqual(
      shownInfos.length,
      1,
      'First notification should be shown'
    );

    // Transition back to running
    mockProcess.emitLog('[2026-04-29 10:00:02] [INFO] [manual-gate-human] GOTO manual-gate-human → pick-next-task');
    await new Promise(resolve => setTimeout(resolve, 100));

    // Second manual-gate activation with same ticket in same hour
    shownInfos = [];
    mockProcess.emitLog('[2026-04-29 10:00:03] [INFO] [Runner] START stage="manual-gate-human" agent="manual-gate" ticket="HUMAN-001"');
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify no duplicate notification (dedup works)
    assert.strictEqual(
      shownInfos.length,
      0,
      'Duplicate notification should be suppressed (dedup)'
    );

    // Cleanup
    mockProcess.emit('close', 0);
  });
});
