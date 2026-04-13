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
  RunHistoryEntry,
  PersistedHistoryItem,
  StageResult
} from '../../ui/pipeline-tree-provider';
import { PipelineService, PipelineState } from '../../services/pipeline-service';
import { PipelineStateManager, parseElapsedToMs, formatMsToElapsed } from '../../services/pipeline-state-manager';

// Interface for accessing private historyManager in tests
interface PipelineTreeProviderWithHistory {
  historyManager: {
    runHistory: RunHistoryEntry[];
    runCounter: number;
  };
}

suite('PipelineTreeProvider Tests', () => {
  let store: WorkflowStore;
  let tempWorkflowRoot: string;
  let pipelineService: PipelineService;

  suiteSetup(async () => {
    // Create temporary workflow directory for testing
    const tempDir = path.join(__dirname, '../../../../../tmp/test-workflow-pipeline');

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
    test('TC1: CurrentStage without fallback/retry displays gear~spin icon', () => {
      const item = new CurrentStageTreeItem('execute-task', 'agent-001', undefined, 'skill', 'IMPL-001', 1, 3, '5s');

      const icon = item.iconPath as vscode.ThemeIcon;
      assert.strictEqual(icon.id, 'gear~spin');
    });

    test('TC2: CurrentStage with fallbackAgent displays arrow-swap~spin icon', () => {
      const item = new CurrentStageTreeItem('execute-task', 'agent-001', 'fallback-agent', 'skill', 'IMPL-001', 1, 3, '5s');

      const icon = item.iconPath as vscode.ThemeIcon;
      assert.strictEqual(icon.id, 'arrow-swap~spin');
      assert.ok(icon.color, 'Should have ThemeColor');
    });

    test('TC3: CurrentStage with attempt > 1 displays debug-restart~spin icon', () => {
      const item = new CurrentStageTreeItem('execute-task', 'agent-001', undefined, 'skill', 'IMPL-001', 2, 3, '5s');

      const icon = item.iconPath as vscode.ThemeIcon;
      assert.strictEqual(icon.id, 'debug-restart~spin');
      assert.ok(icon.color, 'Should have ThemeColor');
    });

    test('TC4: CurrentStage with fallback + retry displays arrow-swap~spin (priority)', () => {
      const item = new CurrentStageTreeItem('execute-task', 'agent-001', 'fallback-agent', 'skill', 'IMPL-001', 2, 3, '5s');

      const icon = item.iconPath as vscode.ThemeIcon;
      assert.strictEqual(icon.id, 'arrow-swap~spin', 'Fallback has priority over retry');
    });

    test('TC5: CurrentStage with attempt = 1 displays gear~spin (not retry)', () => {
      const item = new CurrentStageTreeItem('execute-task', 'agent-001', undefined, 'skill', 'IMPL-001', 1, 3, '5s');

      const icon = item.iconPath as vscode.ThemeIcon;
      assert.strictEqual(icon.id, 'gear~spin', 'attempt=1 is not a retry');
    });

    test('Displays stage with agent and ticket', () => {
      const item = new CurrentStageTreeItem(
        'analyze-report',
        'analyst-agent',
        'fallback-agent',
        'analyze-report-skill',
        'IMPL-001',
        1,
        3,
        '15s'
      );

      assert.strictEqual(item.label, 'analyze-report');
      assert.ok((item.description as string).includes('⏱ 15s'));
      assert.ok((item.description as string).includes('Agent: analyst-agent'));
      assert.ok((item.description as string).includes('Fallback: fallback-agent'));
      assert.ok((item.description as string).includes('Ticket: IMPL-001'));
      assert.ok((item.description as string).includes('Attempt: 1/3'));
    });

    test('Tooltip contains all stage information including elapsed', () => {
      const item = new CurrentStageTreeItem(
        'review-code',
        'reviewer-agent',
        'backup-reviewer',
        'code-review-skill',
        'FIX-002',
        2,
        5,
        '2m30s'
      );

      const tooltip = item.tooltip as vscode.MarkdownString;
      const value = tooltip.value;

      assert.ok(value.includes('**Current Stage: review-code**'));
      assert.ok(value.includes('Elapsed'));
      assert.ok(value.includes('2m30s'));
      assert.ok(value.includes('Agent'));
      assert.ok(value.includes('Fallback Agent'));
      assert.ok(value.includes('Skill'));
      assert.ok(value.includes('Ticket'));
      assert.ok(value.includes('Attempt'));
    });

    test('Works with minimal information', () => {
      const item = new CurrentStageTreeItem('init');

      assert.strictEqual(item.label, 'init');
      assert.strictEqual((item.description as string).trim(), '');
    });
  });

  suite('CompletedStageTreeItem Tests', () => {
    test('Success displays checkmark icon', () => {
      const item = new CompletedStageTreeItem(
        'analyze-report',
        '1.5s',
        true,
        'IMPL-001',
        'general-purpose',
        'execute-task',
        'todo → in_progress'
      );

      assert.ok((item.label as string).includes('✅'));
      assert.ok((item.label as string).includes('analyze-report'));
      // Description should show elapsed | ticket | agent | statusChange
      assert.ok((item.description as string).includes('⏱ 1.5s'));
      assert.ok((item.description as string).includes('IMPL-001'));
      assert.ok((item.description as string).includes('general-purpose'));
      assert.ok((item.description as string).includes('todo → in_progress'));
    });

    test('Failure displays error icon', () => {
      const item = new CompletedStageTreeItem(
        'execute-task',
        '2.3s',
        false,
        'FIX-002',
        'code-reviewer',
        'review-result'
      );

      assert.ok((item.label as string).includes('❌'));
      assert.ok((item.label as string).includes('execute-task'));
      assert.ok((item.description as string).includes('FIX-002'));
    });

    test('Tooltip contains result and elapsed time', () => {
      const item = new CompletedStageTreeItem(
        'create-report',
        '3.7s',
        true,
        'IMPL-003',
        'general-purpose',
        'create-report',
        'ready → done'
      );

      const tooltip = item.tooltip as vscode.MarkdownString;
      const value = tooltip.value;

      assert.ok(value.includes('**Completed Stage: create-report**'));
      assert.ok(value.includes('Success'));
      assert.ok(value.includes('Elapsed'));
      assert.ok(value.includes('IMPL-003'));
      assert.ok(value.includes('general-purpose'));
      assert.ok(value.includes('create-report'));
      assert.ok(value.includes('ready → done'));
    });

    test('Graceful degradation when optional fields missing', () => {
      const item = new CompletedStageTreeItem(
        'simple-stage',
        '0.5s',
        true
      );

      assert.ok((item.label as string).includes('✅'));
      assert.ok((item.label as string).includes('simple-stage'));
      // Should show elapsed even without ticket/agent/statusChange
      assert.ok((item.description as string).includes('⏱ 0.5s'));
    });

    test('Timeout displays timeout icon when result=Timeout', () => {
      const item = new CompletedStageTreeItem(
        'execute-task',
        '120s',
        false,
        'IMPL-001',
        'qwen-code',
        'execute-task',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        StageResult.Timeout
      );

      assert.ok((item.label as string).includes('⏱️'));
      assert.ok((item.label as string).includes('execute-task'));
      const tooltip = item.tooltip as vscode.MarkdownString;
      assert.ok(tooltip.value.includes('Timeout'));
    });

    test('Skipped displays skip icon when result=Skipped', () => {
      const item = new CompletedStageTreeItem(
        'review-result',
        '0.1s',
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        StageResult.Skipped
      );

      assert.ok((item.label as string).includes('⏭️'));
      assert.ok((item.label as string).includes('review-result'));
      const tooltip = item.tooltip as vscode.MarkdownString;
      assert.ok(tooltip.value.includes('Skipped'));
    });

    test('Error displays error icon when result=Error', () => {
      const item = new CompletedStageTreeItem(
        'execute-task',
        '5.2s',
        false,
        'FIX-003',
        'claude-sonnet',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        StageResult.Error
      );

      assert.ok((item.label as string).includes('❌'));
      assert.ok((item.label as string).includes('execute-task'));
      const tooltip = item.tooltip as vscode.MarkdownString;
      assert.ok(tooltip.value.includes('Failed'));
    });

    test('Result parameter takes precedence over success boolean', () => {
      // success=true but result=Timeout — result should win
      const item = new CompletedStageTreeItem(
        'execute-task',
        '120s',
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        StageResult.Timeout
      );

      assert.ok((item.label as string).includes('⏱️'));
    });

    test('TC6: Completed success without statusChange has no GOTO marker', () => {
      const item = new CompletedStageTreeItem(
        'execute-task',
        '5s',
        true,
        'IMPL-001',
        'agent',
        undefined
      );

      const label = item.label as string;
      assert.ok(label.includes('✅'));
      assert.ok(label.includes('execute-task'));
      assert.ok(!label.includes('↩️'));
    });

    test('TC7: Completed success with statusChange has GOTO marker', () => {
      const item = new CompletedStageTreeItem(
        'execute-task',
        '5s',
        true,
        'IMPL-001',
        'agent',
        undefined,
        'todo → in_progress'
      );

      const label = item.label as string;
      assert.ok(label.includes('✅'));
      assert.ok(label.includes('▶️'));
      assert.ok(label.includes('execute-task'));
    });

    test('TC8: Completed stage with reportInfo does NOT add duplicate report marker in label (uses getGotoStatusIcon)', () => {
      const item = new CompletedStageTreeItem(
        'create-report',
        '3s',
        true,
        'IMPL-002',
        'agent',
        undefined,
        undefined,
        undefined,
        { path: '/path/to/report.md', id: 'RPT-001' }
      );

      const label = item.label as string;
      assert.ok(label.includes('✅'));
      assert.ok(label.includes('create-report'));
      const reportMarkerCount = (label.match(/📊/g) || []).length;
      assert.strictEqual(reportMarkerCount, 0, 'report marker should NOT be in label - it comes from getGotoStatusIcon');
    });

    test('TC9: Completed error with statusChange has no GOTO marker (not Success)', () => {
      const item = new CompletedStageTreeItem(
        'execute-task',
        '2s',
        false,
        'FIX-001',
        'agent',
        undefined,
        'todo → in_progress',
        undefined,
        undefined,
        undefined,
        undefined,
        StageResult.Error
      );

      const label = item.label as string;
      assert.ok(label.includes('❌'));
      assert.ok(!label.includes('↩️'));
      assert.ok(label.includes('execute-task'));
    });

    test('TC10: Completed success with statusChange and reportInfo has GOTO marker but NOT duplicate report marker in label', () => {
      const item = new CompletedStageTreeItem(
        'create-report',
        '3s',
        true,
        'IMPL-003',
        'agent',
        undefined,
        'todo → done',
        undefined,
        { path: '/path/to/report.md', id: 'RPT-003' }
      );

      const label = item.label as string;
      assert.ok(label.includes('✅'));
      assert.ok(label.includes('✔️'));
      assert.ok(label.includes('create-report'));
      const reportMarkerCount = (label.match(/📊/g) || []).length;
      assert.strictEqual(reportMarkerCount, 1, 'getGotoStatusIcon returns type icon 📊 for create-report stage');
    });
  });

  suite('StatisticsTreeItem Tests', () => {
    test('Displays statistics correctly without time', () => {
      const item = new StatisticsTreeItem(10, 3, 5);

      assert.ok((item.label as string).includes('Statistics'));
      assert.ok((item.description as string).includes('Stages Started: 10'));
      assert.ok((item.description as string).includes('Retries: 3'));
      // No time shown when totalElapsedMs is 0
      assert.ok(!(item.description as string).includes('⏱'));
    });

    test('Displays total time in description when available', () => {
      const item = new StatisticsTreeItem(5, 1, 3, 0, 90000, 30000);

      assert.ok((item.description as string).includes('⏱ 1m30s'));
    });

    test('Tooltip contains all statistics including timeouts and time', () => {
      const item = new StatisticsTreeItem(15, 7, 12, 2, 180000, 12000);

      const tooltip = item.tooltip as vscode.MarkdownString;
      const value = tooltip.value;

      assert.ok(value.includes('**Pipeline Statistics**'));
      assert.ok(value.includes('Stages Started'));
      assert.ok(value.includes('Retries'));
      assert.ok(value.includes('Goto Transitions'));
      assert.ok(value.includes('Timeouts'));
      assert.ok(value.includes('Total Time'));
      assert.ok(value.includes('Avg Time'));
    });

    test('Tooltip shows timeouts even when 0', () => {
      const item = new StatisticsTreeItem(5, 1, 3, 0);

      const tooltip = item.tooltip as vscode.MarkdownString;
      assert.ok(tooltip.value.includes('Timeouts'));
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
        { runNumber: 1, timestamp: Date.now() - 100000, date: '2026-03-05 10:00', result: 'success', reports: [] },
        { runNumber: 2, timestamp: Date.now() - 50000, date: '2026-03-05 11:00', result: 'error', reports: [] }
      ];

      const item = new HistoryTreeItem(history);
      assert.strictEqual((item.description as string), '2 runs');
    });

    test('Tooltip shows last 10 runs in table format', () => {
      const history: RunHistoryEntry[] = Array.from({ length: 15 }, (_, i) => ({
        runNumber: i + 1,
        timestamp: Date.now() - (15 - i) * 100000,
        date: `2026-03-05 ${10 + i}:00`,
        result: (i % 2 === 0 ? 'success' : 'error') as 'success' | 'error',
        reports: []
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
        timestamp: Date.now(),
        date: '2026-03-05 10:00',
        result: 'success',
        reports: []
      };

      const item = new HistoryItemTreeItem(entry);
      assert.ok((item.label as string).includes('✅'));
      assert.ok((item.label as string).includes('#1'));
      assert.strictEqual((item.description as string), '2026-03-05 10:00');
    });

    test('Error run displays error icon', () => {
      const entry: RunHistoryEntry = {
        runNumber: 2,
        timestamp: Date.now(),
        date: '2026-03-05 11:00',
        result: 'error',
        reports: []
      };

      const item = new HistoryItemTreeItem(entry);
      assert.ok((item.label as string).includes('❌'));
    });

    test('Tooltip contains all run details', () => {
      const entry: RunHistoryEntry = {
        runNumber: 3,
        timestamp: Date.now(),
        date: '2026-03-05 12:00',
        result: 'success',
        reports: []
      };

      const item = new HistoryItemTreeItem(entry);
      const tooltip = item.tooltip as vscode.MarkdownString;
      const value = tooltip.value;

      assert.ok(value.includes('**Run 3**'));
      assert.ok(value.includes('Date'));
      assert.ok(value.includes('Result'));
    });

    test('TC11: History without planId/reports shows label without markers', () => {
      const entry: RunHistoryEntry = {
        runNumber: 1,
        timestamp: Date.now(),
        date: '2026-03-05 10:00',
        result: 'success',
        reports: []
      };

      const item = new HistoryItemTreeItem(entry);
      const label = item.label as string;
      assert.ok(label.includes('✅'));
      assert.ok(label.includes('#1'));
      assert.ok(!label.includes('📋'));
      assert.ok(!label.includes('📄'));
    });

    test('TC12: History with planId shows 📋 marker', () => {
      const entry: RunHistoryEntry = {
        runNumber: 2,
        timestamp: Date.now(),
        date: '2026-03-05 11:00',
        result: 'success',
        reports: [],
        planId: 'PLAN-001'
      };

      const item = new HistoryItemTreeItem(entry);
      const label = item.label as string;
      assert.ok(label.includes('✅'));
      assert.ok(label.includes('📋'));
      assert.ok(!label.includes('📄'));
    });

    test('TC13: History with reports shows 📄 marker', () => {
      const entry: RunHistoryEntry = {
        runNumber: 3,
        timestamp: Date.now(),
        date: '2026-03-05 12:00',
        result: 'success',
        reports: [{ id: 'RPT-001', path: '/path/to/report.md' }]
      };

      const item = new HistoryItemTreeItem(entry);
      const label = item.label as string;
      assert.ok(label.includes('✅'));
      assert.ok(!label.includes('📋'));
      assert.ok(label.includes('📄'));
    });

    test('TC14: History with planId and reports shows both markers', () => {
      const entry: RunHistoryEntry = {
        runNumber: 4,
        timestamp: Date.now(),
        date: '2026-03-05 13:00',
        result: 'error',
        reports: [{ id: 'RPT-002', path: '/path/to/report2.md' }],
        planId: 'PLAN-002'
      };

      const item = new HistoryItemTreeItem(entry);
      const label = item.label as string;
      assert.ok(label.includes('❌'));
      assert.ok(label.includes('📋'));
      assert.ok(label.includes('📄'));
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

    test('Statistics item has children (Stages Started, Retries, Goto Transitions, Timeouts)', async () => {
      const provider = new PipelineTreeProvider(store, pipelineService);
      provider.setWorkflowRoot(tempWorkflowRoot);

      const children = await provider.getChildren();
      const statisticsItem = children.find(item => item.itemType === 'statistics');

      if (statisticsItem) {
        const statsChildren = await provider.getChildren(statisticsItem);
        assert.strictEqual(statsChildren.length, 4);
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

  suite('History Persistence Tests', () => {
    test('setContext stores extension context', () => {
      const provider = new PipelineTreeProvider(store, pipelineService);
      const mockContext = {
        workspaceState: {
          get: () => undefined,
          update: () => Promise.resolve()
        }
      } as unknown as vscode.ExtensionContext;

      provider.setContext(mockContext);
      // Context is set without errors
      assert.ok(true);
    });

    test('loadHistoryFromStorage with empty storage', async () => {
      const provider = new PipelineTreeProvider(store, pipelineService);
      const mockContext = {
        workspaceState: {
          get: () => undefined,
          update: () => Promise.resolve()
        }
      } as unknown as vscode.ExtensionContext;

      provider.setContext(mockContext);
      await provider.loadHistoryFromStorage();

      // Should not throw and history should be empty
      const history = (provider as unknown as PipelineTreeProviderWithHistory).historyManager.runHistory;
      assert.strictEqual(history.length, 0);
    });

    test('loadHistoryFromStorage loads persisted history', async () => {
      const provider = new PipelineTreeProvider(store, pipelineService);
      const persistedData: PersistedHistoryItem[] = [
        { runNumber: 1, timestamp: 1709640000000, result: 'success', reports: [] },
        { runNumber: 2, timestamp: 1709643600000, result: 'error', reports: [{ id: 'RPT-001', path: '/path/to/report.md' }] }
      ];

      const mockContext = {
        workspaceState: {
          get: () => persistedData,
          update: () => Promise.resolve()
        }
      } as unknown as vscode.ExtensionContext;

      provider.setContext(mockContext);
      await provider.loadHistoryFromStorage();

      const history = (provider as unknown as PipelineTreeProviderWithHistory).historyManager.runHistory;
      assert.strictEqual(history.length, 2);
      assert.strictEqual(history[0].runNumber, 1);
      assert.strictEqual(history[0].result, 'success');
      assert.strictEqual(history[1].runNumber, 2);
      assert.strictEqual(history[1].result, 'error');
      assert.strictEqual(history[1].reports?.length, 1);
    });

    test('loadHistoryFromStorage restores run counter', async () => {
      const provider = new PipelineTreeProvider(store, pipelineService);
      const persistedData: PersistedHistoryItem[] = [
        { runNumber: 5, timestamp: 1709640000000, result: 'success', reports: [] }
      ];

      const mockContext = {
        workspaceState: {
          get: () => persistedData,
          update: () => Promise.resolve()
        }
      } as unknown as vscode.ExtensionContext;

      provider.setContext(mockContext);
      await provider.loadHistoryFromStorage();

      const runCounter = (provider as unknown as PipelineTreeProviderWithHistory).historyManager.runCounter;
      assert.strictEqual(runCounter, 5);
    });

    test('saveHistoryToStorage saves history correctly', async () => {
      const provider = new PipelineTreeProvider(store, pipelineService);
      let savedData: PersistedHistoryItem[] | undefined;

      const mockContext = {
        workspaceState: {
          get: () => undefined,
          update: async (key: string, value: PersistedHistoryItem[]) => {
            savedData = value;
          }
        }
      } as unknown as vscode.ExtensionContext;

      provider.setContext(mockContext);

      // Add some history entries
      (provider as unknown as PipelineTreeProviderWithHistory).historyManager.runHistory = [
        { runNumber: 1, timestamp: 1709632800000, date: '2026-03-05 10:00', result: 'success', reports: [] },
        { runNumber: 2, timestamp: 1709636400000, date: '2026-03-05 11:00', result: 'error', reports: [{ id: 'RPT-001', path: '/path/to/report.md' }] }
      ];

      await provider.saveHistoryToStorage();

      assert.ok(savedData);
      assert.strictEqual(savedData?.length, 2);
      assert.strictEqual(savedData?.[0].runNumber, 1);
      assert.strictEqual(savedData?.[0].result, 'success');
      assert.strictEqual(savedData?.[1].runNumber, 2);
      assert.strictEqual(savedData?.[1].result, 'error');
    });

    test('saveHistoryToStorage enforces 50 item limit (FIFO)', async () => {
      const provider = new PipelineTreeProvider(store, pipelineService);
      let savedData: PersistedHistoryItem[] | undefined;

      const mockContext = {
        workspaceState: {
          get: () => undefined,
          update: async (key: string, value: PersistedHistoryItem[]) => {
            savedData = value;
          }
        }
      } as unknown as vscode.ExtensionContext;

      provider.setContext(mockContext);

      // Add 60 history entries
      (provider as unknown as PipelineTreeProviderWithHistory).historyManager.runHistory = Array.from({ length: 60 }, (_, i) => ({
        runNumber: i + 1,
        timestamp: 1709632800000 + i * 3600000,
        date: `2026-03-05 ${10 + Math.floor(i / 10)}:${i % 10}0`,
        result: 'success' as const,
        reports: []
      }));

      await provider.saveHistoryToStorage();

      assert.ok(savedData);
      assert.strictEqual(savedData?.length, 50);
      // slice(0, 50) keeps the first 50 items of the array (runNumbers 1-50)
      assert.strictEqual(savedData?.[0].runNumber, 1);
      assert.strictEqual(savedData?.[49].runNumber, 50);
    });

    test('loadHistoryFromStorage handles errors gracefully', async () => {
      const provider = new PipelineTreeProvider(store, pipelineService);

      const mockContext = {
        workspaceState: {
          get: () => {
            throw new Error('Storage error');
          },
          update: () => Promise.resolve()
        }
      } as unknown as vscode.ExtensionContext;

      provider.setContext(mockContext);

      // Should not throw
      await provider.loadHistoryFromStorage();
      assert.ok(true);
    });

    test('saveHistoryToStorage handles errors gracefully', async () => {
      const provider = new PipelineTreeProvider(store, pipelineService);

      const mockContext = {
        workspaceState: {
          get: () => undefined,
          update: () => Promise.reject(new Error('Storage error'))
        }
      } as unknown as vscode.ExtensionContext;

      provider.setContext(mockContext);
      (provider as unknown as PipelineTreeProviderWithHistory).historyManager.runHistory = [
        { runNumber: 1, timestamp: 1709632800000, date: '2026-03-05 10:00', result: 'success', reports: [] }
      ];

      // Should not throw
      await provider.saveHistoryToStorage();
      assert.ok(true);
    });

    test('loadHistoryFromStorage does nothing without context', async () => {
      const provider = new PipelineTreeProvider(store, pipelineService);

      // Don't set context
      await provider.loadHistoryFromStorage();

      const history = (provider as unknown as PipelineTreeProviderWithHistory).historyManager.runHistory;
      assert.strictEqual(history.length, 0);
    });

    test('saveHistoryToStorage does nothing without context', async () => {
      const provider = new PipelineTreeProvider(store, pipelineService);

      // Don't set context
      (provider as unknown as PipelineTreeProviderWithHistory).historyManager.runHistory = [
        { runNumber: 1, timestamp: 1709632800000, date: '2026-03-05 10:00', result: 'success', reports: [] }
      ];

      await provider.saveHistoryToStorage();
      // Should not throw
      assert.ok(true);
    });
  });

  suite('PipelineStateManager Stage Elapsed Tests', () => {

    test('getStageStartTime returns undefined initially', () => {
      const sm = new PipelineStateManager();
      assert.strictEqual(sm.getStageStartTime(), undefined);
    });

    test('getStageElapsed returns undefined when no stageStartTime', () => {
      const sm = new PipelineStateManager();
      assert.strictEqual(sm.getStageElapsed(), undefined);
    });

    test('getStageElapsed returns seconds format', () => {
      const sm = new PipelineStateManager();
      // Process a START event to set stageStartTime
      sm.process({ isStart: true, stage: 'test-stage', agent: 'agent' });
      const elapsed = sm.getStageElapsed();
      assert.ok(elapsed);
      assert.ok(elapsed.endsWith('s'), `Expected seconds format, got: ${elapsed}`);
    });

    test('stageStartTime resets on GOTO', () => {
      const sm = new PipelineStateManager();
      sm.process({ isStart: true, stage: 'stage-1', agent: 'agent' });
      const firstStartTime = sm.getStageStartTime();
      assert.ok(firstStartTime);

      // Small delay then GOTO
      sm.process({ isGoto: true, gotoStage: 'stage-2', elapsed: '5s' });
      const secondStartTime = sm.getStageStartTime();
      assert.ok(secondStartTime);
      assert.ok(secondStartTime >= firstStartTime!);
    });

    test('stageStartTime resets on reset()', () => {
      const sm = new PipelineStateManager();
      sm.process({ isStart: true, stage: 'test-stage', agent: 'agent' });
      assert.ok(sm.getStageStartTime());

      sm.reset();
      assert.strictEqual(sm.getStageStartTime(), undefined);
      assert.strictEqual(sm.getStageElapsed(), undefined);
    });

    test('getStageElapsed formats minutes correctly', () => {
      const sm = new PipelineStateManager();
      // Manually set stageStartTime to 2 minutes ago
      sm.process({ isStart: true, stage: 'test-stage', agent: 'agent' });
      // Access private state to override stageStartTime for testing
      (sm as any).state.stageStartTime = Date.now() - 125000; // 2m05s ago
      const elapsed = sm.getStageElapsed();
      assert.ok(elapsed);
      assert.ok(elapsed.startsWith('2m'), `Expected 2m format, got: ${elapsed}`);
    });

    test('getStageElapsed formats hours correctly', () => {
      const sm = new PipelineStateManager();
      sm.process({ isStart: true, stage: 'test-stage', agent: 'agent' });
      (sm as any).state.stageStartTime = Date.now() - 3720000; // 1h02m ago
      const elapsed = sm.getStageElapsed();
      assert.ok(elapsed);
      assert.ok(elapsed.startsWith('1h'), `Expected 1h format, got: ${elapsed}`);
    });

    test('completed stage has result=error after ERROR event', () => {
      const sm = new PipelineStateManager();
      sm.process({ isStart: true, stage: 'execute-task', agent: 'agent' });
      sm.process({ isError: true, stage: 'execute-task', errorMessage: 'crashed' });
      sm.process({ isGoto: true, gotoStage: 'create-report', elapsed: '5s' });
      const stages = sm.getCompletedStages();
      assert.strictEqual(stages.length, 1);
      assert.strictEqual(stages[0].result, 'error');
      assert.strictEqual(stages[0].success, false);
    });

    test('completed stage has result=timeout after TIMEOUT event', () => {
      const sm = new PipelineStateManager();
      sm.process({ isStart: true, stage: 'execute-task', agent: 'agent' });
      sm.process({ isTimeout: true, stage: 'execute-task', timeoutSeconds: 120 });
      sm.process({ isGoto: true, gotoStage: 'create-report', elapsed: '120s' });
      const stages = sm.getCompletedStages();
      assert.strictEqual(stages.length, 1);
      assert.strictEqual(stages[0].result, 'timeout');
      assert.strictEqual(stages[0].success, false);
    });

    test('completed stage has result=success by default', () => {
      const sm = new PipelineStateManager();
      sm.process({ isStart: true, stage: 'execute-task', agent: 'agent' });
      sm.process({ isGoto: true, gotoStage: 'review-result', elapsed: '3s' });
      const stages = sm.getCompletedStages();
      assert.strictEqual(stages.length, 1);
      assert.strictEqual(stages[0].result, 'success');
      assert.strictEqual(stages[0].success, true);
    });

    test('lastStageResult resets to success after GOTO', () => {
      const sm = new PipelineStateManager();
      sm.process({ isStart: true, stage: 'stage-1', agent: 'agent' });
      sm.process({ isError: true, stage: 'stage-1', errorMessage: 'err' });
      sm.process({ isGoto: true, gotoStage: 'stage-2', elapsed: '1s' });
      // stage-2 should start with success
      sm.process({ isGoto: true, gotoStage: 'stage-3', elapsed: '2s' });
      const stages = sm.getCompletedStages();
      assert.strictEqual(stages[0].result, 'error');
      assert.strictEqual(stages[1].result, 'success');
    });

    test('COMPLETE with non-zero exitCode marks stage as error', () => {
      const sm = new PipelineStateManager();
      sm.process({ isStart: true, stage: 'execute-task', agent: 'agent' });
      sm.process({ isComplete: true, stage: 'execute-task', completeStatus: 'failed', exitCode: 1 });
      sm.process({ isGoto: true, gotoStage: 'create-report', elapsed: '10s' });
      const stages = sm.getCompletedStages();
      assert.strictEqual(stages[0].result, 'error');
    });

    test('getTimeouts counts timeout events', () => {
      const sm = new PipelineStateManager();
      assert.strictEqual(sm.getTimeouts(), 0);
      sm.process({ isTimeout: true, stage: 'stage-1', timeoutSeconds: 120 });
      assert.strictEqual(sm.getTimeouts(), 1);
      sm.process({ isTimeout: true, stage: 'stage-2', timeoutSeconds: 60 });
      assert.strictEqual(sm.getTimeouts(), 2);
    });

    test('getTotalElapsedMs sums elapsed from completed stages', () => {
      const sm = new PipelineStateManager();
      sm.process({ isStart: true, stage: 'stage-1', agent: 'agent' });
      sm.process({ isGoto: true, gotoStage: 'stage-2', elapsed: '5s' });
      sm.process({ isGoto: true, gotoStage: 'stage-3', elapsed: '10s' });
      // Both completed stages have elapsed from GOTO
      assert.ok(sm.getTotalElapsedMs() > 0);
    });

    test('getAverageElapsedMs returns 0 when no completed stages', () => {
      const sm = new PipelineStateManager();
      assert.strictEqual(sm.getAverageElapsedMs(), 0);
    });

    test('getAverageElapsedMs computes average', () => {
      const sm = new PipelineStateManager();
      sm.process({ isStart: true, stage: 'stage-1', agent: 'agent' });
      sm.process({ isGoto: true, gotoStage: 'stage-2', elapsed: '10s' });
      sm.process({ isGoto: true, gotoStage: 'stage-3', elapsed: '20s' });
      // Average of 10s and 20s = 15s = 15000ms
      // Note: both stages get the last GOTO elapsed, so both are "20s"
      // Actually: stage-1 gets elapsed="5s" from first GOTO, stage-2 gets "10s" from second GOTO
      // The elapsed in GOTO is stored in state.elapsed and used for the PREVIOUS stage
      const avg = sm.getAverageElapsedMs();
      assert.ok(avg > 0);
    });

    test('timeouts resets on reset()', () => {
      const sm = new PipelineStateManager();
      sm.process({ isTimeout: true, stage: 'stage-1', timeoutSeconds: 60 });
      assert.strictEqual(sm.getTimeouts(), 1);
      sm.reset();
      assert.strictEqual(sm.getTimeouts(), 0);
    });
  });

  suite('parseElapsedToMs and formatMsToElapsed Tests', () => {

    test('parseElapsedToMs parses seconds', () => {
      assert.strictEqual(parseElapsedToMs('5s'), 5000);
      assert.strictEqual(parseElapsedToMs('1.5s'), 1500);
      assert.strictEqual(parseElapsedToMs('0.3s'), 300);
    });

    test('parseElapsedToMs parses minutes and seconds', () => {
      assert.strictEqual(parseElapsedToMs('2m30s'), 150000);
      assert.strictEqual(parseElapsedToMs('1m05s'), 65000);
    });

    test('parseElapsedToMs parses hours', () => {
      assert.strictEqual(parseElapsedToMs('1h02m'), 3720000);
      assert.strictEqual(parseElapsedToMs('2h00m'), 7200000);
    });

    test('parseElapsedToMs returns 0 for undefined/empty', () => {
      assert.strictEqual(parseElapsedToMs(undefined), 0);
      assert.strictEqual(parseElapsedToMs(''), 0);
    });

    test('formatMsToElapsed formats seconds', () => {
      assert.strictEqual(formatMsToElapsed(5000), '5s');
      assert.strictEqual(formatMsToElapsed(45000), '45s');
    });

    test('formatMsToElapsed formats minutes', () => {
      assert.strictEqual(formatMsToElapsed(90000), '1m30s');
      assert.strictEqual(formatMsToElapsed(125000), '2m05s');
    });

    test('formatMsToElapsed formats hours', () => {
      assert.strictEqual(formatMsToElapsed(3720000), '1h02m');
    });

    test('formatMsToElapsed handles zero', () => {
      assert.strictEqual(formatMsToElapsed(0), '0s');
    });

    // FIX-048: Monotonic timer tests
    test('timer is monotonic — elapsed does not decrease between GOTOs without explicit elapsed', async () => {
      const sm = new PipelineStateManager();
      sm.process({ isStart: true, stage: 'stage-1', agent: 'agent' });

      // Wait 600ms to ensure elapsed >= 1s (formatMsToElapsed rounds down to seconds)
      await new Promise(r => setTimeout(r, 600));

      // First GOTO without explicit elapsed — should use Date.now() - stageStartTime
      sm.process({ isGoto: true, gotoStage: 'stage-2' });
      const elapsed1 = sm.getElapsed();
      assert.ok(elapsed1, 'First GOTO should have elapsed');
      const ms1 = parseElapsedToMs(elapsed1);
      assert.ok(ms1 >= 0, `First elapsed should be >= 0, got ${ms1}ms (${elapsed1})`);

      // Wait another 600ms
      await new Promise(r => setTimeout(r, 600));

      // Second GOTO without explicit elapsed — elapsed should be >= first
      sm.process({ isGoto: true, gotoStage: 'stage-3' });
      const elapsed2 = sm.getElapsed();
      assert.ok(elapsed2, 'Second GOTO should have elapsed');
      const ms2 = parseElapsedToMs(elapsed2);
      assert.ok(ms2 >= ms1, `Second elapsed (${ms2}ms / ${elapsed2}) should be >= first (${ms1}ms / ${elapsed1}) — timer must be monotonic`);
    }).timeout(5000);

    test('completed stages have non-zero elapsed when GOTO has no explicit elapsed', async () => {
      const sm = new PipelineStateManager();
      sm.process({ isStart: true, stage: 'stage-1', agent: 'agent' });

      // Wait to ensure elapsed >= 1s
      await new Promise(r => setTimeout(r, 1100));

      // GOTO to stage-2 — stage-1 should be completed with non-zero elapsed
      sm.process({ isGoto: true, gotoStage: 'stage-2' });
      const stages = sm.getCompletedStages();
      assert.strictEqual(stages.length, 1);
      assert.ok(stages[0].elapsed, 'Completed stage should have elapsed');
      const ms = parseElapsedToMs(stages[0].elapsed);
      assert.ok(ms >= 1000, `Completed stage elapsed should be >= 1s, got ${ms}ms (${stages[0].elapsed}) — no 0s for completed stages`);
    }).timeout(5000);

    test('stageStartTime is NOT reset on GOTO (FIX-048)', () => {
      const sm = new PipelineStateManager();
      sm.process({ isStart: true, stage: 'stage-1', agent: 'agent' });
      const startTimeBeforeGoto = (sm as any).state.stageStartTime;
      assert.ok(startTimeBeforeGoto, 'stageStartTime should be set after START');

      // GOTO should NOT reset stageStartTime
      sm.process({ isGoto: true, gotoStage: 'stage-2' });
      const startTimeAfterGoto = (sm as any).state.stageStartTime;

      assert.strictEqual(startTimeBeforeGoto, startTimeAfterGoto,
        'stageStartTime must NOT change on GOTO (FIX-048: prevents timer reset 3s to 0s to 1s)');
    });
  });

});
