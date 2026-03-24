import * as vscode from 'vscode';
import {
  TicketsTreeProvider,
  PlansTreeProvider,
  ReportsTreeProvider,
  SkillsTreeProvider,
  LogsTreeProvider
} from '../ui/sidebar-tree-provider';
import {
  createKanbanProviders
} from '../ui/kanban-tree-provider';
import { PipelineTreeProvider } from '../ui/pipeline-tree-provider';
import { PipelineService, PipelineState } from '../services/pipeline-service';
import { DiagnosticProvider } from '../ui/diagnostic-provider';
import { WorkflowDocumentLinkProvider } from '../ui/document-link-provider';
import { WorkflowCodeLensProvider } from '../ui/codelens-provider';
import { WorkflowCompletionProvider } from '../ui/completion-provider';
import { WorkflowHoverProvider } from '../ui/hover-provider';
import { StatusBar } from '../ui/status-bar';
import { NotificationsManager } from '../ui/notifications';
import { WorkflowStore } from '../data/workflow-store';
import { TicketService } from '../services/ticket-service';
import { FileWatcherService } from '../services/file-watcher-service';
import { DependencyService } from '../services/dependency-service';

export interface AllProviders {
  tickets: TicketsTreeProvider;
  plans: PlansTreeProvider;
  reports: ReportsTreeProvider;
  skills: SkillsTreeProvider;
  logs: LogsTreeProvider;
  pipeline: PipelineTreeProvider;
  kanban: ReturnType<typeof createKanbanProviders>;
}

export function createProviders(store: WorkflowStore, pipelineService: PipelineService): AllProviders {
  const ticketsProvider = new TicketsTreeProvider(store);
  const plansProvider = new PlansTreeProvider(store);
  const reportsProvider = new ReportsTreeProvider(store);
  const pipelineProvider = new PipelineTreeProvider(store, pipelineService);
  const skillsProvider = new SkillsTreeProvider(store);
  const logsProvider = new LogsTreeProvider(store);
  const kanbanProviders = createKanbanProviders(store);

  return {
    tickets: ticketsProvider,
    plans: plansProvider,
    reports: reportsProvider,
    skills: skillsProvider,
    logs: logsProvider,
    pipeline: pipelineProvider,
    kanban: kanbanProviders
  };
}

export function setupTreeViews(
  context: vscode.ExtensionContext,
  providers: AllProviders,
  pipelineService: PipelineService,
  store: WorkflowStore
): void {
  const { tickets, plans, reports, skills, logs, pipeline, kanban } = providers;

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('workflow-sidebar.tickets', tickets),
    vscode.window.registerTreeDataProvider('workflow-sidebar.plans', plans),
    vscode.window.registerTreeDataProvider('workflow-sidebar.reports', reports),
    vscode.window.registerTreeDataProvider('workflow-sidebar.skills', skills),
    vscode.window.registerTreeDataProvider('workflow-sidebar.logs', logs)
  );

  const pipelineTreeView = vscode.window.createTreeView('workflow-sidebar.pipeline', { treeDataProvider: pipeline });
  context.subscriptions.push(pipelineTreeView);

  const updatePipelineBadge = () => {
    const isRunning = pipelineService.getState() === PipelineState.Running;
    pipelineTreeView.badge = isRunning
      ? { value: pipeline.getCompletedStagesCount() + 1, tooltip: 'Pipeline is running' }
      : undefined;
    pipelineTreeView.description = isRunning ? 'Running' : '';
  };
  pipelineService.on('stateChange', updatePipelineBadge);
  pipelineService.on('log', updatePipelineBadge);
  updatePipelineBadge();

  const backlogTreeView = vscode.window.createTreeView('wf-kanban-backlog', { treeDataProvider: kanban.backlog });
  const readyTreeView = vscode.window.createTreeView('wf-kanban-ready', { treeDataProvider: kanban.ready });
  const inProgressTreeView = vscode.window.createTreeView('wf-kanban-in-progress', { treeDataProvider: kanban.inProgress });
  const blockedTreeView = vscode.window.createTreeView('wf-kanban-blocked', { treeDataProvider: kanban.blocked });
  const reviewTreeView = vscode.window.createTreeView('wf-kanban-review', { treeDataProvider: kanban.review });
  const doneTreeView = vscode.window.createTreeView('wf-kanban-done', { treeDataProvider: kanban.done });

  context.subscriptions.push(
    backlogTreeView,
    readyTreeView,
    inProgressTreeView,
    blockedTreeView,
    reviewTreeView,
    doneTreeView
  );

  const updateKanbanTitles = () => {
    const filterPlan = kanban.backlog.getPlanFilter();
    const filterSuffix = filterPlan ? ` — 🔍 ${filterPlan}` : '';

    backlogTreeView.title = `BACKLOG (${kanban.backlog.getCount()})${filterSuffix}`;
    readyTreeView.title = `READY (${kanban.ready.getCount()})${filterSuffix}`;
    inProgressTreeView.title = `IN PROGRESS (${kanban.inProgress.getCount()})${filterSuffix}`;
    blockedTreeView.title = `BLOCKED (${kanban.blocked.getCount()})${filterSuffix}`;
    reviewTreeView.title = `REVIEW (${kanban.review.getCount()})${filterSuffix}`;
    doneTreeView.title = `DONE (${kanban.done.getCount()})${filterSuffix}`;
  };

  const updateKanbanBadges = () => {
    backlogTreeView.badge = kanban.backlog.getBadge();
    readyTreeView.badge = kanban.ready.getBadge();
    inProgressTreeView.badge = kanban.inProgress.getBadge();
    blockedTreeView.badge = kanban.blocked.getBadge();
    reviewTreeView.badge = kanban.review.getBadge();
    doneTreeView.badge = kanban.done.getBadge();
  };

  updateKanbanTitles();
  updateKanbanBadges();

  store.onDidChange(() => {
    updateKanbanTitles();
    updateKanbanBadges();
    tickets.refresh();
    plans.refresh();
    reports.refresh();
    skills.refresh();
    logs.refresh();
    pipeline.refresh();
    kanban.backlog.refresh();
    kanban.ready.refresh();
    kanban.inProgress.refresh();
    kanban.blocked.refresh();
    kanban.review.refresh();
    kanban.done.refresh();
  });
}

export function registerLanguageProviders(
  context: vscode.ExtensionContext,
  store: WorkflowStore,
  workflowRoot: string | null
): void {
  const diagnosticProvider = new DiagnosticProvider(store);
  context.subscriptions.push(diagnosticProvider);

  const documentLinkProvider = new WorkflowDocumentLinkProvider(store);
  if (workflowRoot) {
    documentLinkProvider.setWorkflowRoot(workflowRoot);
  }
  const documentLinkDisposable = vscode.languages.registerDocumentLinkProvider(
    [
      { scheme: 'file', pattern: '**/.workflow/tickets/**/*.md' },
      { scheme: 'file', pattern: '**/.workflow/config/pipeline.yaml' }
    ],
    documentLinkProvider
  );
  context.subscriptions.push(documentLinkDisposable);

  if (workflowRoot) {
    const ticketService = new TicketService(store, workflowRoot);
    const dependencyService = new DependencyService(store);
    const codeLensProvider = new WorkflowCodeLensProvider(store, ticketService, dependencyService);
    codeLensProvider.setWorkflowRoot(workflowRoot);
    const codeLensDisposable = vscode.languages.registerCodeLensProvider(
      [
        { scheme: 'file', pattern: '**/.workflow/tickets/**/*.md' },
        { scheme: 'file', pattern: '**/.workflow/plans/**/*.md' },
        { scheme: 'file', pattern: '**/plans/*.md' },
        { scheme: 'file', pattern: '**/.workflow/config/pipeline.yaml' },
        { scheme: 'file', pattern: '**/.workflow/config/config.yaml' }
      ],
      codeLensProvider
    );
    context.subscriptions.push(codeLensDisposable);
  }

  if (workflowRoot) {
    const completionProvider = new WorkflowCompletionProvider(store);
    completionProvider.setWorkflowRoot(workflowRoot);
    const completionDisposable = vscode.languages.registerCompletionItemProvider(
      [
        { scheme: 'file', pattern: '**/.workflow/tickets/**/*.md' },
        { scheme: 'file', pattern: '**/.workflow/config/pipeline.yaml' }
      ],
      completionProvider,
      '-',
      ' ',
      ':'
    );
    context.subscriptions.push(completionDisposable);
  }

  if (workflowRoot) {
    const hoverProvider = new WorkflowHoverProvider(store);
    hoverProvider.setWorkflowRoot(workflowRoot);
    const hoverDisposable = vscode.languages.registerHoverProvider(
      [
        { scheme: 'file', pattern: '**/.workflow/tickets/**/*.md' },
        { scheme: 'file', pattern: '**/.workflow/config/pipeline.yaml' },
        { scheme: 'file', pattern: '**/.workflow/plans/**/*.md' },
        { scheme: 'file', pattern: '**/.workflow/reports/**/*.md' }
      ],
      hoverProvider
    );
    context.subscriptions.push(hoverDisposable);
  }
}

export function setupWorkflowRoot(
  providers: AllProviders,
  pipelineService: PipelineService,
  workflowRoot: string | null,
  context: vscode.ExtensionContext,
  store: WorkflowStore
): void {
  const { tickets, plans, reports, skills, logs, pipeline, kanban } = providers;

  const notificationsManager = new NotificationsManager(store, pipelineService);
  if (workflowRoot) {
    notificationsManager.setWorkflowRoot(workflowRoot);
  }
  notificationsManager.initialize();
  context.subscriptions.push(notificationsManager);

  const statusBar = new StatusBar(pipelineService, store);
  context.subscriptions.push(statusBar);

  if (workflowRoot) {
    pipelineService.setWorkflowRoot(workflowRoot);
    tickets.setWorkflowRoot(workflowRoot);
    plans.setWorkflowRoot(workflowRoot);
    reports.setWorkflowRoot(workflowRoot);
    pipeline.setWorkflowRoot(workflowRoot);
    pipeline.setContext(context);
    pipeline.loadHistoryFromStorage();
    skills.setWorkflowRoot(workflowRoot);
    logs.setWorkflowRoot(workflowRoot);
    kanban.backlog.setWorkflowRoot(workflowRoot);
    kanban.ready.setWorkflowRoot(workflowRoot);
    kanban.inProgress.setWorkflowRoot(workflowRoot);
    kanban.blocked.setWorkflowRoot(workflowRoot);
    kanban.review.setWorkflowRoot(workflowRoot);
    kanban.done.setWorkflowRoot(workflowRoot);

    const config = vscode.workspace.getConfiguration('workflow');
    const incrementalRefresh = config.get<boolean>('settings.incrementalRefresh', true);
    const fileWatcher = new FileWatcherService(store, workflowRoot, incrementalRefresh);
    context.subscriptions.push(fileWatcher);
  }

  pipelineService.on('stateChange', async () => {
    const running = pipelineService.getState() === PipelineState.Running;
    await vscode.commands.executeCommand('setContext', 'workflow.pipelineRunning', running);
  });
}
