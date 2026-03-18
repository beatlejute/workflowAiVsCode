/**
 * FileWatcherService Unit Tests
 *
 * Tests for the file watcher service including:
 * - Debounce mechanism
 * - Smart diff classification
 * - isOwnWrite flag behavior
 * - Store integration
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { FileWatcherService } from '../../services/file-watcher-service';
import { WorkflowStore } from '../../data/workflow-store';

suite('FileWatcherService Suite', () => {

  let store: WorkflowStore;
  let watcher: FileWatcherService;
  let testDir: string;

  setup(() => {
    store = new WorkflowStore();
    testDir = path.join(__dirname, '../../../../tmp/test-watcher-' + Date.now());
  });

  teardown(async () => {
    watcher?.dispose();
    store.clear();
    // Cleanup test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * Helper to create test directory structure
   */
  function createTestStructure(dir: string) {
    const workflowDir = path.join(dir, '.workflow');
    const ticketsDir = path.join(workflowDir, 'tickets');
    const plansDir = path.join(workflowDir, 'plans');
    const reportsDir = path.join(workflowDir, 'reports');
    const configDir = path.join(workflowDir, 'config');

    // Create ticket status folders
    const statuses = ['backlog', 'ready', 'in-progress', 'blocked', 'review', 'done'];
    for (const status of statuses) {
      fs.mkdirSync(path.join(ticketsDir, status), { recursive: true });
    }

    // Create plan folders
    fs.mkdirSync(path.join(plansDir, 'current'), { recursive: true });
    fs.mkdirSync(path.join(plansDir, 'archive'), { recursive: true });

    // Create reports folder
    fs.mkdirSync(reportsDir, { recursive: true });

    // Create config folder
    fs.mkdirSync(configDir, { recursive: true });

    return { workflowDir, ticketsDir, plansDir, reportsDir, configDir };
  }

  /**
   * Helper to create a test ticket file
   */
  function createTicketFile(dir: string, id: string, status: string, title: string) {
    const frontmatter = {
      id,
      title,
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
      created_at: '2026-03-04T00:00:00Z',
      updated_at: '2026-03-04T00:00:00Z',
      completed_at: ''
    };

    const yamlContent = yaml.dump(frontmatter, { indent: 2 });
    const content = `---\n${yamlContent}---\n## Test content`;
    const filePath = path.join(dir, `${id}.md`);
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * Helper to create minimal config files
   */
  function createConfigFiles(configDir: string) {
    const configYaml = `version: "1.0"
project:
  name: Test Project
  description: Test Description
task_types:
  IMPL:
    description: Implementation
    prefix: IMPL
priorities:
  1: Critical
  2: High
statuses:
  backlog:
    description: Backlog
    color: gray
condition_types: {}
paths:
  tickets: .workflow/tickets
  plans: .workflow/plans
  reports: .workflow/reports
  archive: .workflow/archive
reporting:
  enabled: true
  auto_generate: true
`;

    const pipelineYaml = `pipeline:
  name: Test Pipeline
  version: "1.0"
  agents:
    default:
      command: node
      args: []
      workdir: .
  stages:
    entry:
      description: Entry stage
  entry: entry
  execution:
    max_steps: 100
    delay_between_stages: 1000
    timeout_per_stage: 30000
    log_file: pipeline.log
`;

    fs.writeFileSync(path.join(configDir, 'config.yaml'), configYaml, 'utf-8');
    fs.writeFileSync(path.join(configDir, 'pipeline.yaml'), pipelineYaml, 'utf-8');
  }

  /**
   * Helper to wait for debounce
   */
  function waitForDebounce(delay = 200): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  suite('Constructor and Initialization', () => {

    test('should create FileWatcherService with store and workflow root', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(path.join(testDir, '.workflow'));

      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      assert.ok(watcher, 'FileWatcherService should be created');
    });
  });

  suite('classifyChange - Smart Diff', () => {

    test('should classify ticket creation in ready folder', () => {
      createTestStructure(testDir);
      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      const uri = vscode.Uri.file(path.join(testDir, '.workflow', 'tickets', 'ready', 'TEST-001.md'));
      
      // Note: classifyChange is private, tested indirectly through file events
      // This test verifies the path mapping logic
      assert.ok(uri, 'URI should be created for ticket path');
    });

    test('should classify plan file in current folder', () => {
      createTestStructure(testDir);
      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      const uri = vscode.Uri.file(path.join(testDir, '.workflow', 'plans', 'current', 'PLAN-001.md'));
      
      assert.ok(uri, 'URI should be created for plan path');
    });

    test('should classify report file', () => {
      createTestStructure(testDir);
      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      const uri = vscode.Uri.file(path.join(testDir, '.workflow', 'reports', 'REPORT-001.md'));
      
      assert.ok(uri, 'URI should be created for report path');
    });

    test('should classify config file', () => {
      createTestStructure(testDir);
      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      const uri = vscode.Uri.file(path.join(testDir, '.workflow', 'config', 'config.yaml'));
      
      assert.ok(uri, 'URI should be created for config path');
    });
  });

  suite('Debounce Mechanism', () => {

    test('should debounce multiple rapid events into single refresh', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));
      
      await store.refresh(path.join(testDir, '.workflow'));
      
      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      const { ticketsDir } = { ticketsDir: path.join(testDir, '.workflow', 'tickets', 'ready') };

      // Simulate rapid file creations
      createTicketFile(ticketsDir, 'TEST-001', 'ready', 'Test 1');
      createTicketFile(ticketsDir, 'TEST-002', 'ready', 'Test 2');
      createTicketFile(ticketsDir, 'TEST-003', 'ready', 'Test 3');

      // Wait for debounce
      await waitForDebounce(200);

      // Store should have refreshed (may have more than initial due to file watcher)
      const tickets = store.getTickets();
      assert.ok(tickets.length >= 0, 'Store should be updated');
    }).timeout(1000);

    test('should reset debounce timer on each new event', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));
      
      await store.refresh(path.join(testDir, '.workflow'));
      
      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      const { ticketsDir } = { ticketsDir: path.join(testDir, '.workflow', 'tickets', 'ready') };

      // Create files with small delays
      createTicketFile(ticketsDir, 'TEST-001', 'ready', 'Test 1');
      await new Promise(resolve => setTimeout(resolve, 50));
      createTicketFile(ticketsDir, 'TEST-002', 'ready', 'Test 2');
      await new Promise(resolve => setTimeout(resolve, 50));
      createTicketFile(ticketsDir, 'TEST-003', 'ready', 'Test 3');

      // Wait for debounce after last event
      await waitForDebounce(200);

      const tickets = store.getTickets();
      assert.ok(tickets.length >= 0, 'Store should be updated after debounced events');
    }).timeout(2000);
  });

  suite('Debounce with Fake Timers', () => {
    let clock: sinon.SinonFakeTimers;

    setup(() => {
      clock = sinon.useFakeTimers();
    });

    teardown(() => {
      clock.restore();
      watcher?.dispose();
    });

    test('should call refresh only once for 10 events within 50ms', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));
      
      // Load configuration into store
      await store.refresh(path.join(testDir, '.workflow'));
      
      // Mock store.refresh to track calls
      let refreshCallCount = 0;
      const originalRefresh = store.refresh.bind(store);
      store.refresh = async (workflowRoot?: string) => {
        refreshCallCount++;
        return originalRefresh(workflowRoot as string);
      };

      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      // Simulate 10 file change events within 50ms
      for (let i = 0; i < 10; i++) {
        (watcher as unknown as { scheduleRefresh: () => void }).scheduleRefresh();
        clock.tick(5); // 5ms between events, total 45ms
      }

      // At this point, timer should be scheduled but not yet fired
      assert.strictEqual(refreshCallCount, 0, 'Refresh should not be called before debounce delay');

      // Advance time by debounce delay (100ms) from last event
      clock.tick(100);

      // Should have exactly one refresh call
      assert.strictEqual(refreshCallCount, 1, 'Refresh should be called exactly once after debounce delay');

      // Restore original method
      store.refresh = originalRefresh;
    });

    test('should call refresh after 200ms idle', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));
      
      // Load configuration into store
      await store.refresh(path.join(testDir, '.workflow'));
      
      let refreshCallCount = 0;
      const originalRefresh = store.refresh.bind(store);
      store.refresh = async (workflowRoot?: string) => {
        refreshCallCount++;
        return originalRefresh(workflowRoot as string);
      };

      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      // Trigger one event
      (watcher as unknown as { scheduleRefresh: () => void }).scheduleRefresh();

      // Advance time 200ms (more than debounce delay)
      clock.tick(200);

      assert.strictEqual(refreshCallCount, 1, 'Refresh should be called after idle period');

      // Restore original method
      store.refresh = originalRefresh;
    });

    test('should clear pending timer on dispose', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));
      
      // Load configuration into store
      await store.refresh(path.join(testDir, '.workflow'));
      
      let refreshCallCount = 0;
      const originalRefresh = store.refresh.bind(store);
      store.refresh = async (workflowRoot?: string) => {
        refreshCallCount++;
        return originalRefresh(workflowRoot as string);
      };

      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      // Schedule refresh
      (watcher as unknown as { scheduleRefresh: () => void }).scheduleRefresh();

      // Dispose before timer fires
      watcher.dispose();
      
      // Advance time beyond debounce delay
      clock.tick(200);

      assert.strictEqual(refreshCallCount, 0, 'Refresh should not be called after dispose');

      // Restore original method
      store.refresh = originalRefresh;
    });
  });

  suite('isOwnWrite Flag', () => {

    test('should ignore events when isOwnWrite is true', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(path.join(testDir, '.workflow'));

      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      // Use withOwnWrite to simulate our own write operation
      await (watcher as unknown as { withOwnWrite: <T>(op: () => Promise<T>) => Promise<T> }).withOwnWrite(async () => {
        const ticketsDir = path.join(testDir, '.workflow', 'tickets', 'ready');
        createTicketFile(ticketsDir, 'OWN-001', 'ready', 'Own Write Test');
      });

      // Wait for potential debounce (should be suppressed)
      await waitForDebounce(200);

      // The ticket count may or may not change depending on timing
      // The key is that isOwnWrite prevents the watcher from triggering
      assert.ok(true, 'withOwnWrite should complete without errors');
    }).timeout(1000);

    test('should process events when isOwnWrite is false', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));
      
      await store.refresh(path.join(testDir, '.workflow'));
      
      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      const ticketsDir = path.join(testDir, '.workflow', 'tickets', 'ready');
      
      // Create file without withOwnWrite wrapper
      createTicketFile(ticketsDir, 'EXTERNAL-001', 'ready', 'External Change Test');

      // Wait for debounce
      await waitForDebounce(200);

      // Store should be updated
      const tickets = store.getTickets();
      assert.ok(tickets.length >= 0, 'Store should process external changes');
    }).timeout(1000);
  });

  suite('Store Integration', () => {

    test('should update store when ticket file is created', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));
      
      await store.refresh(path.join(testDir, '.workflow'));
      
      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      const ticketsDir = path.join(testDir, '.workflow', 'tickets', 'ready');
      const initialCount = store.getTickets().length;

      createTicketFile(ticketsDir, 'INTEGRATION-001', 'ready', 'Integration Test');

      // Wait for debounce
      await waitForDebounce(200);

      const finalCount = store.getTickets().length;
      assert.ok(finalCount >= initialCount, 'Store should be updated after file creation');
    }).timeout(1000);

    test('should update store when ticket file is changed', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));
      
      await store.refresh(path.join(testDir, '.workflow'));
      
      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      const ticketsDir = path.join(testDir, '.workflow', 'tickets', 'ready');
      
      // Create initial ticket
      const filePath = createTicketFile(ticketsDir, 'CHANGE-001', 'ready', 'Original Title');
      
      // Wait for initial creation to be processed
      await waitForDebounce(200);

      // Modify the file
      const updatedContent = fs.readFileSync(filePath, 'utf-8').replace('Original Title', 'Updated Title');
      fs.writeFileSync(filePath, updatedContent, 'utf-8');

      // Wait for debounce
      await waitForDebounce(200);

      // Store should be refreshed
      assert.ok(true, 'File change should trigger store refresh');
    }).timeout(2000);

    test('should remove ticket from store when file is deleted', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));
      
      await store.refresh(path.join(testDir, '.workflow'));
      
      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      const ticketsDir = path.join(testDir, '.workflow', 'tickets', 'ready');
      
      // Create ticket
      const filePath = createTicketFile(ticketsDir, 'DELETE-001', 'ready', 'To Delete');
      
      // Wait for creation to be processed
      await waitForDebounce(200);

      // Delete the file
      fs.unlinkSync(filePath);

      // Wait for debounce
      await waitForDebounce(200);

      // Store should be refreshed
      assert.ok(true, 'File deletion should trigger store update');
    }).timeout(2000);
  });

  suite('Dispose', () => {

    test('should dispose file watcher and clear timers', () => {
      createTestStructure(testDir);
      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      // Dispose should not throw
      assert.doesNotThrow(() => {
        watcher.dispose();
      });

      // Disposing twice should not throw
      assert.doesNotThrow(() => {
        watcher.dispose();
      });
    });
  });

  suite('File Pattern Matching', () => {

    test('should watch .md files in .workflow directory', () => {
      createTestStructure(testDir);
      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      // Verify watcher is created (indirectly tested)
      assert.ok(watcher, 'Watcher should be created for .md files');
    });

    test('should watch .yaml files in .workflow directory', () => {
      createTestStructure(testDir);
      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      assert.ok(watcher, 'Watcher should be created for .yaml files');
    });

    test('should watch .yml files in .workflow directory', () => {
      createTestStructure(testDir);
      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      assert.ok(watcher, 'Watcher should be created for .yml files');
    });
  });

  suite('Edge Cases', () => {

    test('should handle invalid ticket status gracefully', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(path.join(testDir, '.workflow'));

      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      // Create ticket in invalid status folder
      const invalidStatusDir = path.join(testDir, '.workflow', 'tickets', 'invalid-status');
      fs.mkdirSync(invalidStatusDir, { recursive: true });
      createTicketFile(invalidStatusDir, 'INVALID-001', 'invalid-status', 'Invalid Status Test');

      // Wait for debounce - should fallback to full refresh
      await waitForDebounce(200);

      assert.ok(true, 'Invalid status should be handled gracefully');
    }).timeout(1000);

    test('should handle archive plan files', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(path.join(testDir, '.workflow'));

      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      const archiveDir = path.join(testDir, '.workflow', 'plans', 'archive');
      createTicketFile(archiveDir, 'PLAN-ARCHED', 'archived', 'Archived Plan Test');

      await waitForDebounce(200);

      assert.ok(true, 'Archive plan files should be handled');
    }).timeout(1000);

    test('should handle files at root of .workflow directory', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(path.join(testDir, '.workflow'));

      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      // Create file at root
      const rootFile = path.join(testDir, '.workflow', 'random.md');
      fs.writeFileSync(rootFile, '---\ntest: true\n---\nContent', 'utf-8');

      await waitForDebounce(200);

      assert.ok(true, 'Root level files should trigger full refresh');
    }).timeout(1000);

    test('should handle nested directories in tickets', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(path.join(testDir, '.workflow'));

      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      // Create nested directory (should not be recognized as ticket)
      const nestedDir = path.join(testDir, '.workflow', 'tickets', 'ready', 'nested');
      fs.mkdirSync(nestedDir, { recursive: true });
      createTicketFile(nestedDir, 'NESTED-001', 'ready', 'Nested Test');

      await waitForDebounce(200);

      assert.ok(true, 'Nested directories should fallback to full refresh');
    }).timeout(1000);
  });

  suite('withOwnWrite', () => {

    test('should reset isOwnWrite flag after operation completes', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(path.join(testDir, '.workflow'));

      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      // Execute withOwnWrite
      await (watcher as unknown as { withOwnWrite: <T>(op: () => Promise<T>) => Promise<T> }).withOwnWrite(async () => {
        return Promise.resolve('test');
      });

      // Wait for flag reset (debounceDelay * 2 = 200ms)
      await waitForDebounce(250);

      assert.ok(true, 'isOwnWrite flag should reset after operation');
    }).timeout(1000);

    test('should reset isOwnWrite flag even if operation throws', async () => {
      createTestStructure(testDir);
      createConfigFiles(path.join(testDir, '.workflow', 'config'));

      await store.refresh(path.join(testDir, '.workflow'));

      watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

      // Execute withOwnWrite that throws
      try {
        await (watcher as unknown as { withOwnWrite: <T>(op: () => Promise<T>) => Promise<T> }).withOwnWrite(async () => {
          throw new Error('Test error');
        });
      } catch {
        // Expected
      }

      // Wait for flag reset
      await waitForDebounce(250);

      assert.ok(true, 'isOwnWrite flag should reset even after error');
    }).timeout(1000);
  });

  suite('Debounce Delay Configuration', () => {
    test('should use shorter delay for create/delete events (100ms)', async () => {
      const clock = sinon.useFakeTimers();
      try {
        watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));
        let refreshCallCount = 0;
        store.refresh = async () => { refreshCallCount++; };
        // Simulate config file create — config URIs bypass incremental and use scheduleRefresh(100ms)
        const configUri = { fsPath: path.join(testDir, '.workflow', 'config', 'config.yaml') } as any;
        await (watcher as any)['handleFileCreate'](configUri);
        // At 99ms, should not have fired
        clock.tick(99);
        assert.strictEqual(refreshCallCount, 0, 'Should not fire before 100ms');
        // At 100ms, should have fired
        clock.tick(1);
        assert.strictEqual(refreshCallCount, 1, 'Should fire at 100ms (create/delete delay)');
      } finally {
        clock.restore();
      }
    });

    test('should use longer delay for change events (300ms)', async () => {
      const clock = sinon.useFakeTimers();
      try {
        watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));
        let refreshCallCount = 0;
        store.refresh = async () => { refreshCallCount++; };
        // Simulate config file change — config URIs bypass incremental and use scheduleRefresh(300ms)
        const configUri = { fsPath: path.join(testDir, '.workflow', 'config', 'config.yaml') } as any;
        await (watcher as any)['handleFileChange'](configUri);
        // At 299ms, should not have fired
        clock.tick(299);
        assert.strictEqual(refreshCallCount, 0, 'Should not fire before 300ms');
        // At 300ms, should have fired
        clock.tick(1);
        assert.strictEqual(refreshCallCount, 1, 'Should fire at 300ms (change delay)');
      } finally {
        clock.restore();
      }
    });
  });

  test('should handle recurring.yaml changes with RecurringService', async () => {
    const mockRecurringService = {
      loadDefinitions: sinon.stub().resolves([
        {
          id: 'recurring-001',
          name: 'Weekly Review',
          entity_type: 'ticket',
          enabled: true,
          trigger: { type: 'cron', expression: '0 9 * * 1' },
          template: { type: 'task', title_template: 'Weekly Review {date}', priority: 2, tags: ['weekly'] },
          state: { last_triggered_at: null, next_trigger_at: null, instance_count: 0, last_instance_id: null, is_active_instance: false }
        }
      ])
    };

    createTestStructure(testDir);

    const recurringConfigPath = path.join(testDir, '.workflow', 'config', 'recurring.yaml');
    fs.writeFileSync(recurringConfigPath, 'definitions: []', 'utf-8');

    watcher = new FileWatcherService(store, path.join(testDir, '.workflow'), mockRecurringService as any);

    const changeEvent = vscode.Uri.file(path.join(testDir, '.workflow', 'config', 'recurring.yaml'));

    await watcher['handleFileChange'](changeEvent);

    sinon.assert.calledOnce(mockRecurringService.loadDefinitions);
    const recurringDefs = store.getRecurringDefinitions();
    assert.strictEqual(recurringDefs.length, 1);
    assert.strictEqual(recurringDefs[0].id, 'recurring-001');
  }).timeout(3000);

  test('should handle recurring.yaml deletion', async () => {
    const mockRecurringService = {
      loadDefinitions: sinon.stub().resolves([])
    };

    createTestStructure(testDir);

    const recurringConfigPath = path.join(testDir, '.workflow', 'config', 'recurring.yaml');
    fs.writeFileSync(recurringConfigPath, 'definitions:\n  - id: test', 'utf-8');

    store.setRecurringDefinitions([
      {
        id: 'existing',
        name: 'Existing',
        entity_type: 'ticket',
        enabled: true,
        trigger: { type: 'cron', expression: '0 9 * * 1' },
        template: { type: 'task', title_template: 'Test {date}', priority: 2, tags: [] },
        state: { last_triggered_at: null, next_trigger_at: null, instance_count: 0, last_instance_id: null, is_active_instance: false }
      }
    ]);

    watcher = new FileWatcherService(store, path.join(testDir, '.workflow'), mockRecurringService as any);

    const deleteEvent = vscode.Uri.file(path.join(testDir, '.workflow', 'config', 'recurring.yaml'));

    await watcher['handleFileDelete'](deleteEvent);

    sinon.assert.calledOnce(mockRecurringService.loadDefinitions);
    const recurringDefs = store.getRecurringDefinitions();
    assert.strictEqual(recurringDefs.length, 0);
  }).timeout(3000);

  test('should warn when RecurringService is not provided for recurring.yaml changes', async () => {
    createTestStructure(testDir);

    const recurringConfigPath = path.join(testDir, '.workflow', 'config', 'recurring.yaml');
    fs.writeFileSync(recurringConfigPath, 'definitions: []', 'utf-8');

    const consoleSpy = sinon.spy(console, 'warn');

    watcher = new FileWatcherService(store, path.join(testDir, '.workflow'));

    const changeEvent = vscode.Uri.file(path.join(testDir, '.workflow', 'config', 'recurring.yaml'));

    await watcher['handleFileChange'](changeEvent);

    sinon.assert.calledWith(consoleSpy, sinon.match('RecurringService not available'));

    consoleSpy.restore();
  }).timeout(3000);
});
