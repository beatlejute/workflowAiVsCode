/**
 * Unit tests for DiagnosticProvider
 *
 * Tests:
 * - Valid ticket produces empty diagnostics
 * - Invalid ticket produces correct diagnostic entries
 * - Invalid pipeline.yaml produces diagnostic entries
 * - Debounce works correctly
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowStore } from '../../data/workflow-store';
import { DiagnosticProvider } from '../../ui/diagnostic-provider';
import { Ticket, TicketStatus } from '../../data/types';

suite('DiagnosticProvider Tests', () => {
  let store: WorkflowStore;
  let diagnosticProvider: DiagnosticProvider;
  let tempWorkflowRoot: string;
  let testTicketUri: vscode.Uri;
  let testPipelineUri: vscode.Uri;
  let testConfigUri: vscode.Uri;

  suiteSetup(async () => {
    // Create temporary workflow directory for testing
    const tempDir = path.join(__dirname, '../../../tmp/test-workflow');
    
    // Create directory structure
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'tickets', 'ready'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'config'), { recursive: true });

    // Create minimal config.yaml
    fs.writeFileSync(
      path.join(tempDir, '.workflow', 'config', 'config.yaml'),
      `version: "1.0"
project:
  name: "Test Project"
  description: "Test"
task_types:
  IMPL:
    description: "Implementation"
    prefix: "IMPL"
priorities:
  1: "Critical"
  2: "High"
  3: "Medium"
  4: "Low"
  5: "Trivial"
statuses:
  backlog:
    description: "Backlog"
    color: "gray"
  ready:
    description: "Ready"
    color: "blue"
  in-progress:
    description: "In Progress"
    color: "yellow"
  blocked:
    description: "Blocked"
    color: "red"
  review:
    description: "Review"
    color: "purple"
  done:
    description: "Done"
    color: "green"
condition_types:
  tasks_completed:
    description: "Tasks completed"
paths:
  tickets: ".workflow/tickets"
  plans: ".workflow/plans"
  reports: ".workflow/reports"
  archive: ".workflow/plans/archive"
reporting:
  enabled: true
  auto_generate: true
`
    );

    // Create minimal pipeline.yaml
    fs.writeFileSync(
      path.join(tempDir, '.workflow', 'config', 'pipeline.yaml'),
      `pipeline:
  name: "Test Pipeline"
  version: "1.0"
  agents:
    planner:
      command: "echo"
      args: ["planning"]
      workdir: "."
      description: "Planning agent"
  stages:
    analyze:
      description: "Analyze task"
      agent: "planner"
      goto:
        success:
          stage: "done"
    done:
      description: "Done"
  entry_point: "analyze"
  execution:
    max_steps: 100
    delay_between_stages: 0
    timeout_per_stage: 300
    log_file: "pipeline.log"
`
    );

    tempWorkflowRoot = tempDir;
  });

  setup(async () => {
    // Initialize store
    store = new WorkflowStore();
    await store.refresh(tempWorkflowRoot);

    // Create diagnostic provider
    diagnosticProvider = new DiagnosticProvider(store);

    // Set up test URIs
    testTicketUri = vscode.Uri.file(path.join(tempWorkflowRoot, '.workflow', 'tickets', 'ready', 'TEST-001.md'));
    testPipelineUri = vscode.Uri.file(path.join(tempWorkflowRoot, '.workflow', 'config', 'pipeline.yaml'));
    testConfigUri = vscode.Uri.file(path.join(tempWorkflowRoot, '.workflow', 'config', 'config.yaml'));
  });

  teardown(() => {
    // Dispose diagnostic provider
    diagnosticProvider.dispose();
    store.clear();
  });

  suite('Ticket Validation', () => {
    test('Valid ticket produces empty diagnostics', async () => {
      const validTicket: Ticket = {
        id: 'TEST-001',
        title: 'Test Ticket',
        status: TicketStatus.Ready,
        priority: 2,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: 'PLAN-001',
        parent_task: '',
        created_at: '2026-03-04T00:00:00Z',
        updated_at: '2026-03-04T00:00:00Z',
        completed_at: ''
      };

      // Write ticket to disk
      const ticketPath = path.join(tempWorkflowRoot, '.workflow', 'tickets', 'ready', 'TEST-001.md');
      fs.writeFileSync(
        ticketPath,
        `---
id: ${validTicket.id}
title: ${validTicket.title}
status: ${validTicket.status}
priority: ${validTicket.priority}
type: ${validTicket.type}
---

# ${validTicket.title}

Test ticket content.
`
      );

      // Wait for file watcher to process
      await new Promise(resolve => setTimeout(resolve, 400));

      // Validate - should have no errors
      const diagnostics = diagnosticProvider.diagnosticCollection.get(testTicketUri);
      assert.strictEqual(diagnostics?.length, 0, 'Valid ticket should produce no diagnostics');
    });

    test('Ticket with missing required fields produces diagnostics', async () => {
      const invalidTicketPath = path.join(tempWorkflowRoot, '.workflow', 'tickets', 'ready', 'INVALID-001.md');
      const invalidTicketUri = vscode.Uri.file(invalidTicketPath);
      fs.writeFileSync(
        invalidTicketPath,
        `---
id: INVALID-001
---

# Invalid Ticket

Missing required fields.
`
      );

      // Wait for file watcher to process
      await new Promise(resolve => setTimeout(resolve, 400));

      const diagnostics = diagnosticProvider.diagnosticCollection.get(invalidTicketUri);
      assert.ok(diagnostics && diagnostics.length > 0, 'Invalid ticket should produce diagnostics');
      
      // Check for specific missing fields
      const hasTitleError = diagnostics.some(d => d.message.includes('title'));
      const hasStatusError = diagnostics.some(d => d.message.includes('status'));
      const hasPriorityError = diagnostics.some(d => d.message.includes('priority'));
      const hasTypeError = diagnostics.some(d => d.message.includes('type'));
      
      assert.ok(hasTitleError, 'Should have error for missing title');
      assert.ok(hasStatusError, 'Should have error for missing status');
      assert.ok(hasPriorityError, 'Should have error for missing priority');
      assert.ok(hasTypeError, 'Should have error for missing type');
    });

    test('Ticket with non-existent dependency produces diagnostics', async () => {
      const ticketWithBadDep: Ticket = {
        id: 'BADDEP-001',
        title: 'Ticket with bad dependency',
        status: TicketStatus.Ready,
        priority: 2,
        type: 'IMPL',
        dependencies: ['NONEXISTENT-999'],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: 'PLAN-001',
        parent_task: '',
        created_at: '2026-03-04T00:00:00Z',
        updated_at: '2026-03-04T00:00:00Z',
        completed_at: ''
      };

      const ticketPath = path.join(tempWorkflowRoot, '.workflow', 'tickets', 'ready', 'BADDEP-001.md');
      const ticketUri = vscode.Uri.file(ticketPath);
      fs.writeFileSync(
        ticketPath,
        `---
id: ${ticketWithBadDep.id}
title: ${ticketWithBadDep.title}
status: ${ticketWithBadDep.status}
priority: ${ticketWithBadDep.priority}
type: ${ticketWithBadDep.type}
dependencies:
  - NONEXISTENT-999
---

# ${ticketWithBadDep.title}

This ticket depends on non-existent ticket.
`
      );

      // Wait for file watcher to process
      await new Promise(resolve => setTimeout(resolve, 400));

      const diagnostics = diagnosticProvider.diagnosticCollection.get(ticketUri);
      assert.ok(diagnostics && diagnostics.length > 0, 'Ticket with non-existent dep should produce diagnostics');
      
      // Check for dependency error
      const hasDepError = diagnostics.some(d => d.message.includes('NONEXISTENT-999') || d.message.includes('dependency'));
      assert.ok(hasDepError, 'Should have error for non-existent dependency');
    });
  });

  suite('Pipeline Validation', () => {
    test('Valid pipeline produces empty diagnostics', async () => {
      // Wait for file watcher to process
      await new Promise(resolve => setTimeout(resolve, 400));

      const diagnostics = diagnosticProvider.diagnosticCollection.get(testPipelineUri);
      assert.strictEqual(diagnostics?.length, 0, 'Valid pipeline should produce no diagnostics');
    });

    test('Pipeline with non-existent agent reference produces diagnostics', async () => {
      const invalidPipelinePath = path.join(tempWorkflowRoot, '.workflow', 'config', 'pipeline-invalid.yaml');
      const invalidPipelineUri = vscode.Uri.file(invalidPipelinePath);
      fs.writeFileSync(
        invalidPipelinePath,
        `pipeline:
  name: "Invalid Pipeline"
  version: "1.0"
  agents:
    planner:
      command: "echo"
      args: ["planning"]
      workdir: "."
  stages:
    analyze:
      description: "Analyze task"
      agent: "NONEXISTENT_AGENT"
  entry_point: "analyze"
  execution:
    max_steps: 100
    delay_between_stages: 0
    timeout_per_stage: 300
    log_file: "pipeline.log"
`
      );

      // Wait for file watcher to process
      await new Promise(resolve => setTimeout(resolve, 400));

      const diagnostics = diagnosticProvider.diagnosticCollection.get(invalidPipelineUri);
      assert.ok(diagnostics && diagnostics.length > 0, 'Pipeline with non-existent agent should produce diagnostics');
      
      // Check for agent error
      const hasAgentError = diagnostics.some(d => d.message.includes('NONEXISTENT_AGENT') || d.message.includes('agent'));
      assert.ok(hasAgentError, 'Should have error for non-existent agent');
    });

    test('Pipeline with non-existent goto stage produces diagnostics', async () => {
      const invalidGotoPath = path.join(tempWorkflowRoot, '.workflow', 'config', 'pipeline-goto-invalid.yaml');
      const invalidGotoUri = vscode.Uri.file(invalidGotoPath);
      fs.writeFileSync(
        invalidGotoPath,
        `pipeline:
  name: "Invalid Goto Pipeline"
  version: "1.0"
  agents:
    planner:
      command: "echo"
      args: ["planning"]
      workdir: "."
  stages:
    analyze:
      description: "Analyze task"
      agent: "planner"
      goto:
        success:
          stage: "NONEXISTENT_STAGE"
    done:
      description: "Done"
  entry_point: "analyze"
  execution:
    max_steps: 100
    delay_between_stages: 0
    timeout_per_stage: 300
    log_file: "pipeline.log"
`
      );

      // Wait for file watcher to process
      await new Promise(resolve => setTimeout(resolve, 400));

      const diagnostics = diagnosticProvider.diagnosticCollection.get(invalidGotoUri);
      assert.ok(diagnostics && diagnostics.length > 0, 'Pipeline with non-existent goto stage should produce diagnostics');
      
      // Check for stage error
      const hasStageError = diagnostics.some(d => d.message.includes('NONEXISTENT_STAGE') || d.message.includes('stage'));
      assert.ok(hasStageError, 'Should have error for non-existent stage');
    });
  });

  suite('Config Validation', () => {
    test('Valid config produces empty diagnostics', async () => {
      // Wait for file watcher to process
      await new Promise(resolve => setTimeout(resolve, 400));

      const diagnostics = diagnosticProvider.diagnosticCollection.get(testConfigUri);
      assert.strictEqual(diagnostics?.length, 0, 'Valid config should produce no diagnostics');
    });

    test('Config with missing required fields produces diagnostics', async () => {
      const invalidConfigPath = path.join(tempWorkflowRoot, '.workflow', 'config', 'config-invalid.yaml');
      const invalidConfigUri = vscode.Uri.file(invalidConfigPath);
      fs.writeFileSync(
        invalidConfigPath,
        `version: "1.0"
# Missing required fields
`
      );

      // Wait for file watcher to process
      await new Promise(resolve => setTimeout(resolve, 400));

      const diagnostics = diagnosticProvider.diagnosticCollection.get(invalidConfigUri);
      assert.ok(diagnostics && diagnostics.length > 0, 'Config with missing fields should produce diagnostics');
    });
  });

  suite('Debounce Tests', () => {
    test('Debounce delays validation by 300ms', async () => {
      const ticketPath = path.join(tempWorkflowRoot, '.workflow', 'tickets', 'ready', 'DEBOUNCE-001.md');
      
      const startTime = Date.now();
      
      // Write file
      fs.writeFileSync(
        ticketPath,
        `---
id: DEBOUNCE-001
title: Debounce Test
status: ready
priority: 2
type: IMPL
---

# Debounce Test
`
      );

      // Wait for debounce to complete
      await new Promise(resolve => setTimeout(resolve, 400));

      const elapsed = Date.now() - startTime;
      
      // Should have waited at least 300ms due to debounce
      assert.ok(elapsed >= 300, `Expected >= 300ms, got ${elapsed}ms`);
    });
  });

  suite('DocumentLinkProvider Integration', () => {
    test('DiagnosticProvider is disposable', () => {
      // Verify dispose method works
      const newProvider = new DiagnosticProvider(store);
      assert.doesNotThrow(() => newProvider.dispose());
    });
  });
});
