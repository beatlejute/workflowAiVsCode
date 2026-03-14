/**
 * Unit tests for commands/index.ts
 *
 * Tests all exported command functions directly:
 * - executeOpenPipelineConfig
 * - executeOpenConfig
 * - executeFocusTicketsView
 * - executeFocusKanban
 * - executeRefreshAll
 * - executeCopyTicketId
 * - executeFilterTicketsByPlan
 * - executeClearTicketFilter
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import {
  executeOpenPipelineConfig,
  executeOpenConfig,
  executeFocusTicketsView,
  executeFocusKanban,
  executeRefreshAll,
  executeCopyTicketId,
  executeFilterTicketsByPlan,
  executeClearTicketFilter
} from '../../commands/index';
import { WorkflowStore } from '../../data/workflow-store';
import * as vscode from 'vscode';

suite('commands/index Tests', () => {
  let store: WorkflowStore;
  let tempWorkflowRoot: string;

  // Track calls to VSCode APIs via mock
  let shownErrors: string[];
  let shownInfos: string[];
  let executedCommands: string[];
  let clipboardText: string;
  let quickPickItems: vscode.QuickPickItem[];
  let quickPickResult: vscode.QuickPickItem | undefined;
  let activeTextEditor: vscode.TextEditor | undefined;

  const createMockKanbanProviders = (planFilter?: string | null) => {
    const makeProvider = () => ({
      setPlanFilter: (_f: string | null) => {},
      getPlanFilter: () => planFilter ?? null,
      setSortMode: () => {},
      getSortAscending: () => true,
      setSortAscending: () => {},
      refresh: () => {},
      getBadge: () => undefined,
      getCount: () => 0
    });
    return {
      backlog: makeProvider(),
      ready: makeProvider(),
      inProgress: makeProvider(),
      blocked: makeProvider(),
      review: makeProvider(),
      done: makeProvider()
    };
  };

  const createMockTicketsProvider = (planFilter?: string | null) => ({
    setPlanFilter: (_f: string | null) => {},
    getPlanFilter: () => planFilter ?? null,
    setSortMode: () => {},
    refresh: () => {}
  });

  suiteSetup(async () => {
    tempWorkflowRoot = path.join(__dirname, '../../../../../tmp/test-commands-index');
    fs.mkdirSync(tempWorkflowRoot, { recursive: true });
    fs.mkdirSync(path.join(tempWorkflowRoot, '.workflow', 'tickets', 'backlog'), { recursive: true });
    fs.mkdirSync(path.join(tempWorkflowRoot, '.workflow', 'tickets', 'ready'), { recursive: true });
    fs.mkdirSync(path.join(tempWorkflowRoot, '.workflow', 'tickets', 'done'), { recursive: true });
    fs.mkdirSync(path.join(tempWorkflowRoot, '.workflow', 'plans', 'current'), { recursive: true });
    fs.mkdirSync(path.join(tempWorkflowRoot, '.workflow', 'plans', 'archive'), { recursive: true });
    fs.mkdirSync(path.join(tempWorkflowRoot, '.workflow', 'reports'), { recursive: true });
    fs.mkdirSync(path.join(tempWorkflowRoot, '.workflow', 'config'), { recursive: true });

    fs.writeFileSync(
      path.join(tempWorkflowRoot, '.workflow', 'config', 'config.yaml'),
      `version: "1.0"\nproject:\n  name: "Test"\ntask_types:\n  IMPL:\n    description: "Implementation"\n    prefix: "IMPL"\npriorities:\n  3: "Medium"\nstatuses:\n  backlog:\n    description: "Backlog"\n  ready:\n    description: "Ready"\n  done:\n    description: "Done"\npaths:\n  tickets: ".workflow/tickets"\n  plans: ".workflow/plans"\n  reports: ".workflow/reports"\n  archive: ".workflow/plans/archive"\n`
    );

    // Write plan for filter tests
    fs.writeFileSync(
      path.join(tempWorkflowRoot, '.workflow', 'plans', 'current', 'PLAN-001.md'),
      `---\nid: PLAN-001\ntitle: Test Plan\nstatus: active\n---\n\n## Description\nTest plan\n`
    );

    store = new WorkflowStore();
    await store.refresh(path.join(tempWorkflowRoot, '.workflow'));
  });

  suiteTeardown(() => {
    try { fs.rmSync(tempWorkflowRoot, { recursive: true, force: true }); } catch {}
  });

  setup(() => {
    shownErrors = [];
    shownInfos = [];
    executedCommands = [];
    clipboardText = '';
    quickPickItems = [];
    quickPickResult = undefined;
    activeTextEditor = undefined;

    // Patch vscode mock for tests
    vscode.window._showError = vscode.window.showErrorMessage;
    vscode.window._showInfo = vscode.window.showInformationMessage;
    vscode.window._quickPick = vscode.window.showQuickPick;
    vscode.window._activeEditor = vscode.window.activeTextEditor;
    vscode.commands._exec = vscode.commands.executeCommand;
    vscode.env._clipboard = vscode.env.clipboard;

    vscode.window.showErrorMessage = async (msg: string) => { shownErrors.push(msg); return undefined; };
    vscode.window.showInformationMessage = async (msg: string) => { shownInfos.push(msg); return undefined; };
    vscode.window.showQuickPick = async (items: readonly vscode.QuickPickItem[], _opts?: vscode.QuickPickOptions) => { quickPickItems = Array.isArray(items) ? items : []; return quickPickResult; };
    Object.defineProperty(vscode.window, 'activeTextEditor', { get: () => activeTextEditor, configurable: true });
    vscode.commands.executeCommand = async (_cmd: string, ..._args: unknown[]) => { executedCommands.push(_cmd); return undefined; };
    vscode.env.clipboard = { writeText: async (text: string) => { clipboardText = text; }, readText: async () => '' };
  });

  teardown(() => {
    if (vscode.window._showError) { vscode.window.showErrorMessage = vscode.window._showError; }
    if (vscode.window._showInfo) { vscode.window.showInformationMessage = vscode.window._showInfo; }
    if (vscode.window._quickPick) { vscode.window.showQuickPick = vscode.window._quickPick; }
    if (vscode.commands._exec) { vscode.commands.executeCommand = vscode.commands._exec; }
    if (vscode.env._clipboard) { vscode.env.clipboard = vscode.env._clipboard; }
    try { Object.defineProperty(vscode.window, 'activeTextEditor', { get: () => undefined, configurable: true }); } catch {}
  });

  suite('executeOpenPipelineConfig', () => {
    test('shows error when workflowRoot is null', async () => {
      await executeOpenPipelineConfig(null);
      assert.strictEqual(shownErrors.length, 1);
    });

    test('executes open command when workflowRoot is provided', async () => {
      await executeOpenPipelineConfig('/some/workflow/root');
      assert.ok(executedCommands.includes('vscode.open'));
    });

    test('handles executeCommand error gracefully', async () => {
      vscode.commands.executeCommand = async (cmd: string) => {
        executedCommands.push(cmd);
        if (cmd === 'vscode.open') throw new Error('Cannot open');
        return undefined;
      };
      await executeOpenPipelineConfig('/some/workflow/root');
      assert.strictEqual(shownErrors.length, 1);
      assert.ok(shownErrors[0].includes('Cannot open'));
    });
  });

  suite('executeOpenConfig', () => {
    test('shows error when workflowRoot is null', async () => {
      await executeOpenConfig(null);
      assert.strictEqual(shownErrors.length, 1);
    });

    test('executes open command when workflowRoot is provided', async () => {
      await executeOpenConfig('/some/workflow/root');
      assert.ok(executedCommands.includes('vscode.open'));
    });

    test('handles executeCommand error gracefully', async () => {
      vscode.commands.executeCommand = async (cmd: string) => {
        executedCommands.push(cmd);
        if (cmd === 'vscode.open') throw new Error('Open failed');
        return undefined;
      };
      await executeOpenConfig('/some/root');
      assert.strictEqual(shownErrors.length, 1);
      assert.ok(shownErrors[0].includes('Open failed'));
    });
  });

  suite('executeFocusTicketsView', () => {
    test('executes focus commands', async () => {
      await executeFocusTicketsView();
      assert.ok(executedCommands.includes('workbench.view.extension.workflow-sidebar'));
      assert.ok(executedCommands.includes('workbench.action.focusSideBar'));
    });
  });

  suite('executeFocusKanban', () => {
    test('executes kanban focus command', async () => {
      await executeFocusKanban();
      assert.ok(executedCommands.some(c => c.includes('wf-kanban-backlog')));
    });
  });

  suite('executeRefreshAll', () => {
    test('calls refresh callbacks without workflowRoot', async () => {
      let callbackCalled = false;
      await executeRefreshAll(null, store, [() => { callbackCalled = true; }]);
      assert.ok(callbackCalled);
      assert.ok(shownInfos.length > 0);
    });

    test('calls store.refresh and callbacks with workflowRoot', async () => {
      const workflowDir = path.join(tempWorkflowRoot, '.workflow');
      let callbackCalled = false;
      await executeRefreshAll(workflowDir, store, [() => { callbackCalled = true; }]);
      assert.ok(callbackCalled);
      assert.ok(shownInfos.length > 0);
    });

    test('calls multiple callbacks', async () => {
      let count = 0;
      const callbacks = [() => count++, () => count++, () => count++];
      await executeRefreshAll(null, store, callbacks);
      assert.strictEqual(count, 3);
    });
  });

  suite('executeCopyTicketId', () => {
    test('shows error when no ticketId and no active editor', async () => {
      await executeCopyTicketId(undefined);
      assert.strictEqual(shownErrors.length, 1);
    });

    test('copies provided ticketId to clipboard', async () => {
      await executeCopyTicketId('IMPL-042');
      assert.strictEqual(clipboardText, 'IMPL-042');
      assert.ok(shownInfos.length > 0);
    });

    test('extracts ticketId from active editor fileName', async () => {
      activeTextEditor = {
        document: {
          fileName: '/some/path/.workflow/tickets/ready/IMPL-099.md'
        }
      };
      await executeCopyTicketId(undefined);
      assert.strictEqual(clipboardText, 'IMPL-099');
    });

    test('shows error when editor has non-matching fileName', async () => {
      activeTextEditor = {
        document: { fileName: '/no/match/file.ts' }
      };
      await executeCopyTicketId(undefined);
      assert.strictEqual(shownErrors.length, 1);
    });
  });

  suite('executeFilterTicketsByPlan', () => {
    test('shows info when no plans available', async () => {
      const emptyStore = new WorkflowStore();
      const kanban = createMockKanbanProviders();
      const tickets = createMockTicketsProvider();
      await executeFilterTicketsByPlan(emptyStore, tickets, kanban);
      assert.ok(shownInfos.length > 0);
    });

    test('returns without action when quickPick is cancelled', async () => {
      quickPickResult = undefined;
      const kanban = createMockKanbanProviders();
      const tickets = createMockTicketsProvider();
      await executeFilterTicketsByPlan(store, tickets, kanban);
      // No info shown, no error - just cancelled
      assert.strictEqual(shownErrors.length, 0);
    });

    test('applies filter when plan is selected', async () => {
      quickPickResult = { label: 'PLAN-001', description: 'Test Plan', planId: 'PLAN-001', isCurrent: true };
      const filters: (string | null)[] = [];
      const kanban = createMockKanbanProviders();
      const tickets = {
        setPlanFilter: (f: string | null) => filters.push(f),
        getPlanFilter: () => null,
        refresh: () => {}
      };
      await executeFilterTicketsByPlan(store, tickets, kanban);
      assert.ok(filters.includes('PLAN-001'));
      assert.ok(shownInfos.length > 0);
    });

    test('clears filter when null planId selected', async () => {
      quickPickResult = { label: 'Clear Filter', description: 'Show all', planId: null, isCurrent: false };
      const filters: (string | null)[] = [];
      const kanban = createMockKanbanProviders('PLAN-001');
      const tickets = {
        setPlanFilter: (f: string | null) => filters.push(f),
        getPlanFilter: () => 'PLAN-001',
        refresh: () => {}
      };
      await executeFilterTicketsByPlan(store, tickets, kanban);
      assert.ok(filters.includes(null));
    });

    test('includes clear filter option when filter is already active', async () => {
      quickPickResult = undefined;
      const kanban = createMockKanbanProviders('PLAN-001');
      const tickets = createMockTicketsProvider('PLAN-001');
      await executeFilterTicketsByPlan(store, tickets, kanban);
      // Quick pick items should include "Clear Filter"
      const hasClear = quickPickItems.some(item => item.planId === null);
      assert.ok(hasClear, 'Should include clear filter option when filter is active');
    });
  });

  suite('executeClearTicketFilter', () => {
    test('clears filter in all providers', async () => {
      const cleared: boolean[] = [];
      const makeProvider = () => ({
        setPlanFilter: (f: string | null) => cleared.push(f === null),
        getPlanFilter: () => 'PLAN-001',
        refresh: () => {}
      });
      const kanban = {
        backlog: makeProvider(),
        ready: makeProvider(),
        inProgress: makeProvider(),
        blocked: makeProvider(),
        review: makeProvider(),
        done: makeProvider()
      };
      const tickets = {
        setPlanFilter: (f: string | null) => cleared.push(f === null),
        getPlanFilter: () => 'PLAN-001',
        refresh: () => {}
      };

      await executeClearTicketFilter(tickets, kanban);
      // tickets + 6 kanban providers = 7 total
      assert.strictEqual(cleared.length, 7);
      assert.ok(cleared.every(v => v === true));
      assert.ok(shownInfos.length > 0);
    });

    test('executes setContext command to clear filter flag', async () => {
      const kanban = createMockKanbanProviders();
      const tickets = createMockTicketsProvider();
      await executeClearTicketFilter(tickets, kanban);
      assert.ok(executedCommands.includes('setContext'));
    });
  });
});
