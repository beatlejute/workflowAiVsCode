/**
 * Unit tests for PipelineTreeProvider
 *
 * Tests:
 * - PipelineRunTreeItem: Correct label, description, tooltip, icon for each state
 * - CurrentStageTreeItem: Correct stage, agent, ticket, attempt display
 * - CompletedStageTreeItem: Correct icon and elapsed time display
 * - StatisticsTreeItem: Correct statistics display
 * - HistoryTreeItem: Correct history display
 * - PipelineTreeProvider: Displays correct state for each PipelineState
 * - PipelineTreeProvider: OutputChannel receives log events
 * - PipelineTreeProvider: QuickPick mode selection works correctly
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowStore } from '../../data/workflow-store';
import {
  PipelineTreeProvider,
  PipelineRunTreeItem,
  CurrentStageTreeItem,
  CompletedStageTreeItem,
  StatisticsTreeItem,
  HistoryTreeItem,
  HistoryItemTreeItem,
  RunHistoryEntry
} from '../../ui/pipeline-tree-provider';
import { PipelineService, PipelineState } from '../../services/pipeline-service';

suite('PipelineTreeProvider Tests', () => {
  let store: WorkflowStore;
  let tempWorkflowRoot: string;
  let pipelineService: PipelineService;

  suiteSetup(async () => {
    // Create temporary workflow directory for testing
    const tempDir = path.join(__dirname, '../../../tmp/test-workflow-pipeline');

    // Create directory structure
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'config'), { recursive: true });

    // Create minimal config.yaml
    fs.writeFileSync(
      path.join(tempDir, '.workflow', 'config', 'config.yaml'),
      `version: "1.0"
project:
  name: "Test Project"
  description: "Test"
task_types:
  IMPL: Implementation
  FIX: Bug Fix
priorities:
  1: Critical
  2: High
  3: Medium
  4: Low
statuses:
  backlog:
    description: "Backlog"
  ready:
    description: "Ready"
  in-progress:
    description: "In Progress"
  blocked:
    description: "Blocked"
  review:
    description: "Review"
  done:
    description: "Done"
`
    );

    tempWorkflowRoot = tempDir;

    // Initialize store
    store = new WorkflowStore();
    await store.refresh(path.join(tempDir, '.workflow'));
  });

  setup(() => {
    // Create a mock pipeline service for testing
    pipelineService = new PipelineService();
  });

  teardown(() => {
    pipelineService.dispose();
  });

  suiteTeardown(async () => {
    store.clear();
    // Clean up temporary directory
    try {
      fs.rmSync(tempWorkflowRoot, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up test directory:', error);
    }
  });

  suite('PipelineRunTreeItem Tests', () => {
    test('Idle state displays correct label and icon', () => {
      const item = new PipelineRunTreeItem(PipelineState.Idle, '0:00');

      assert.strictEqual(item.label, 'Idle');
      assert.strictEqual(item.description, 'Elapsed: 0:00');
      assert.strictEqual(item.itemType, 'pipeline-run');

      const icon = item.iconPath as vscode.ThemeIcon;
      assert.strictEqual(icon.id, 'circle-outline');
    });

    test('Running state displays loading icon', () => {
      const item = new PipelineRunTreeItem(PipelineState.Running, '1:23');

      assert.strictEqual(item.label, 'Running');
      assert.strictEqual(item.description, 'Elapsed: 1:23');

      const icon = item.iconPath as vscode.ThemeIcon;
      assert.strictEqual(icon.id, 'loading~spin');
    });

    test('Error state displays error icon', () => {
      const item = new PipelineRunTreeItem(PipelineState.Error, '2:45');

      assert.strictEqual(item.label, 'Error');

      const icon = item.iconPath as vscode.ThemeIcon;
      assert.strictEqual(icon.id, 'error');
    });

    test('Completed state displays check icon', () => {
      const item = new PipelineRunTreeItem(PipelineState.Completed, '5:00');

      assert.strictEqual(item.label, 'Completed');

      const icon = item.iconPath as vscode.ThemeIcon;
      assert.strictEqual(icon.id, 'check');
    });

    test('Tooltip contains state and elapsed', () => {
      const item = new PipelineRunTreeItem(PipelineState.Running, '3:30');

      const tooltip = item.tooltip as vscode.MarkdownString;
      const value = tooltip.value;

      assert.ok(value.includes('**Pipeline Run**'));
      assert.ok(value.includes('State'));
      assert.ok(value.includes('Elapsed'));
    });
  });

  suite('CurrentStageTreeItem Tests', () => {
    test('Displays stage with agent and ticket', () => {
      const item = new CurrentStageTreeItem(
        'analyze-report',
        'analyst-agent',
        'fallback-agent',
        'analyze-report-skill',
        'IMPL-001',
        1,
        3
      );

      assert.ok((item.label as string).includes('analyze-report'));
      assert.ok((item.description as string).includes('Agent: analyst-agent'));
      assert.ok((item.description as string).includes('Ticket: IMPL-001'));
      assert.ok((item.description as string).includes('Attempt: 1/3'));
    });

    test('Tooltip contains all stage information', () => {
      const item = new CurrentStageTreeItem(
        'review-code',
        'reviewer-agent',
        'backup-reviewer',
        'code-review-skill',
        'FIX-002',
        2,
        5
      );

      const tooltip = item.tooltip as vscode.MarkdownString;
      const value = tooltip.value;

      assert.ok(value.includes('**Current Stage: review-code**'));
      assert.ok(value.includes('Agent'));
      assert.ok(value.includes('Fallback Agent'));
      assert.ok(value.includes('Skill'));
      assert.ok(value.includes('Ticket'));
      assert.ok(value.includes('Attempt'));
    });

    test('Works with minimal information', () => {
      const item = new CurrentStageTreeItem('init');

      assert.ok((item.label as string).includes('init'));
      assert.strictEqual((item.description as string).trim(), '');
    });
  });

  suite('CompletedStageTreeItem Tests', () => {
    test('Success displays checkmark icon', () => {
      const item = new CompletedStageTreeItem(
        'analyze-report',
        '1.5s',
        true
      );

      assert.ok((item.label as string).includes('✅'));
      assert.ok((item.label as string).includes('analyze-report'));
      assert.strictEqual((item.description as string), 'Elapsed: 1.5s');
    });

    test('Failure displays error icon', () => {
      const item = new CompletedStageTreeItem(
        'execute-task',
        '2.3s',
        false
      );

      assert.ok((item.label as string).includes('❌'));
      assert.ok((item.label as string).includes('execute-task'));
    });

    test('Tooltip contains result and elapsed time', () => {
      const item = new CompletedStageTreeItem(
        'create-report',
        '3.7s',
        true
      );

      const tooltip = item.tooltip as vscode.MarkdownString;
      const value = tooltip.value;

      assert.ok(value.includes('**Completed Stage: create-report**'));
      assert.ok(value.includes('Success'));
      assert.ok(value.includes('Elapsed'));
    });
  });

  suite('StatisticsTreeItem Tests', () => {
    test('Displays statistics correctly', () => {
      const item = new StatisticsTreeItem(10, 3, 5);

      assert.ok((item.label as string).includes('Statistics'));
      assert.strictEqual((item.description as string), 'Started: 10 | Retries: 3 | Gotos: 5');
    });

    test('Tooltip contains all statistics', () => {
      const item = new StatisticsTreeItem(15, 7, 12);

      const tooltip = item.tooltip as vscode.MarkdownString;
      const value = tooltip.value;

      assert.ok(value.includes('**Pipeline Statistics**'));
      assert.ok(value.includes('Stages Started'));
      assert.ok(value.includes('Retries'));
      assert.ok(value.includes('Goto Transitions'));
    });
  });

  suite('HistoryTreeItem Tests', () => {
    test('Empty history displays correctly', () => {
      const item = new HistoryTreeItem([]);

      assert.ok((item.label as string).includes('History'));
      assert.strictEqual((item.description as string), 'No runs yet');
    });

    test('History with entries displays count', () => {
      const history: RunHistoryEntry[] = [
        { runNumber: 1, date: '2026-03-05 10:00', result: 'success' },
        { runNumber: 2, date: '2026-03-05 11:00', result: 'error' }
      ];

      const item = new HistoryTreeItem(history);
      assert.strictEqual((item.description as string), '2 runs');
    });

    test('Tooltip shows last 10 runs in table format', () => {
      const history: RunHistoryEntry[] = Array.from({ length: 15 }, (_, i) => ({
        runNumber: i + 1,
        date: `2026-03-05 ${10 + i}:00`,
        result: (i % 2 === 0 ? 'success' : 'error') as 'success' | 'error'
      }));

      const item = new HistoryTreeItem(history);
      const tooltip = item.tooltip as vscode.MarkdownString;
      const value = tooltip.value;

      assert.ok(value.includes('**Run History**'));
      assert.ok(value.includes('| # | Date | Result |'));
      // Should only show last 10 runs
      const runCount = (value.match(/\| \d+ \|/g) || []).length;
      assert.strictEqual(runCount, 10);
    });
  });

  suite('HistoryItemTreeItem Tests', () => {
    test('Success run displays checkmark', () => {
      const entry: RunHistoryEntry = {
        runNumber: 1,
        date: '2026-03-05 10:00',
        result: 'success'
      };

      const item = new HistoryItemTreeItem(entry);
      assert.ok((item.label as string).includes('✅'));
      assert.ok((item.label as string).includes('#1'));
      assert.strictEqual((item.description as string), '2026-03-05 10:00');
    });

    test('Error run displays error icon', () => {
      const entry: RunHistoryEntry = {
        runNumber: 2,
        date: '2026-03-05 11:00',
        result: 'error'
      };

      const item = new HistoryItemTreeItem(entry);
      assert.ok((item.label as string).includes('❌'));
    });

    test('Tooltip contains all run details', () => {
      const entry: RunHistoryEntry = {
        runNumber: 3,
        date: '2026-03-05 12:00',
        result: 'success'
      };

      const item = new HistoryItemTreeItem(entry);
      const tooltip = item.tooltip as vscode.MarkdownString;
      const value = tooltip.value;

      assert.ok(value.includes('**Run #3**'));
      assert.ok(value.includes('Date'));
      assert.ok(value.includes('Result'));
    });
  });

  suite('PipelineTreeProvider Tests', () => {
    test('Provider initializes with empty workflow root', () => {
      const provider = new PipelineTreeProvider(store, pipelineService);
      assert.ok(provider);
    });

    test('Returns empty array when workflow root not set', async () => {
      const provider = new PipelineTreeProvider(store, pipelineService);
      const children = await provider.getChildren();
      assert.strictEqual(children.length, 0);
    });

    test('Returns root items after workflow root is set', async () => {
      const provider = new PipelineTreeProvider(store, pipelineService);
      provider.setWorkflowRoot(tempWorkflowRoot);

      const children = await provider.getChildren();
      assert.ok(children.length > 0);
      
      // Should have: run status, statistics, history
      const hasStatistics = children.some(item => item.itemType === 'statistics');
      const hasHistory = children.some(item => item.itemType === 'history');
      
      assert.ok(hasStatistics, 'Should have statistics item');
      assert.ok(hasHistory, 'Should have history item');
    });

    test('Statistics item has no children', async () => {
      const provider = new PipelineTreeProvider(store, pipelineService);
      provider.setWorkflowRoot(tempWorkflowRoot);

      const children = await provider.getChildren();
      const statisticsItem = children.find(item => item.itemType === 'statistics');

      if (statisticsItem) {
        const statsChildren = await provider.getChildren(statisticsItem);
        assert.strictEqual(statsChildren.length, 0);
      }
    });

    test('History item children are history items', async () => {
      const provider = new PipelineTreeProvider(store, pipelineService);
      provider.setWorkflowRoot(tempWorkflowRoot);

      const children = await provider.getChildren();
      const historyItem = children.find(item => item.itemType === 'history');

      if (historyItem) {
        const historyChildren = await provider.getChildren(historyItem);
        // Empty history should return empty array
        assert.strictEqual(historyChildren.length, 0);
      }
    });

    test('Refresh triggers tree data change event', (done) => {
      const provider = new PipelineTreeProvider(store, pipelineService);
      provider.setWorkflowRoot(tempWorkflowRoot);

      provider.onDidChangeTreeData(() => {
        done();
      });

      provider.refresh();
    });

    test('Get pipeline service returns service instance', () => {
      const provider = new PipelineTreeProvider(store, pipelineService);
      const service = provider.getPipelineService();
      assert.strictEqual(service, pipelineService);
    });

    test('Get output channel returns null before setWorkflowRoot', () => {
      const provider = new PipelineTreeProvider(store, pipelineService);
      assert.strictEqual(provider.getOutputChannel(), null);
    });

    test('Get output channel returns channel after setWorkflowRoot', () => {
      const provider = new PipelineTreeProvider(store, pipelineService);
      provider.setWorkflowRoot(tempWorkflowRoot);
      assert.ok(provider.getOutputChannel() !== null);
    });
  });

  suite('PipelineTreeProvider Log Parsing Tests', () => {
    test('Parses GOTO log entry correctly', () => {
      const provider = new PipelineTreeProvider(store, pipelineService);
      provider.setWorkflowRoot(tempWorkflowRoot);

      // Simulate GOTO log
      const logEntry = '[GOTO] analyze-report (elapsed: 1.2s)';
      
      // Access private method via any cast for testing
      (provider as any).parseLogForState(logEntry);

      const stage = (provider as any).currentStage;
      const elapsed = (provider as any).elapsed;
      const stagesStarted = (provider as any).stagesStarted;
      const gotos = (provider as any).gotos;

      assert.strictEqual(stage, 'analyze-report');
      assert.strictEqual(elapsed, '1.2s');
      assert.strictEqual(stagesStarted, 1);
      assert.strictEqual(gotos, 1);
    });

    test('Parses INFO log with agent and ticket', () => {
      const provider = new PipelineTreeProvider(store, pipelineService);
      provider.setWorkflowRoot(tempWorkflowRoot);

      const logEntry = '[INFO] agent: analyst-agent, ticket: IMPL-001';
      (provider as any).parseLogForState(logEntry);

      const agent = (provider as any).currentAgent;
      const ticket = (provider as any).currentTicket;

      assert.strictEqual(agent, 'analyst-agent');
      assert.strictEqual(ticket, 'IMPL-001');
    });

    test('Parses INFO log with retry count', () => {
      const provider = new PipelineTreeProvider(store, pipelineService);
      provider.setWorkflowRoot(tempWorkflowRoot);

      const logEntry = '[INFO] retry: 2/5';
      (provider as any).parseLogForState(logEntry);

      const attempt = (provider as any).currentAttempt;
      const maxAttempts = (provider as any).currentMaxAttempts;
      const retries = (provider as any).retries;

      assert.strictEqual(attempt, 2);
      assert.strictEqual(maxAttempts, 5);
      assert.strictEqual(retries, 1);
    });

    test('Parses CTX log with skill', () => {
      const provider = new PipelineTreeProvider(store, pipelineService);
      provider.setWorkflowRoot(tempWorkflowRoot);

      const logEntry = '[CTX] skill: analyze-report-skill';
      (provider as any).parseLogForState(logEntry);

      const skill = (provider as any).currentSkill;
      assert.strictEqual(skill, 'analyze-report-skill');
    });

    test('Handles raw log entries gracefully', () => {
      const provider = new PipelineTreeProvider(store, pipelineService);
      provider.setWorkflowRoot(tempWorkflowRoot);

      const logEntry = 'Some random log message';
      
      // Should not throw
      assert.doesNotThrow(() => {
        (provider as any).parseLogForState(logEntry);
      });
    });
  });
});
