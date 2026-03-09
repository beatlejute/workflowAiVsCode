import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { WorkflowStore } from './data/workflow-store';
import {
  TicketsTreeProvider,
  PlansTreeProvider,
  ReportsTreeProvider,
  SkillsTreeProvider,
  LogsTreeProvider
} from './ui/sidebar-tree-provider';
import {
  createKanbanProviders,
  KanbanSortMode
} from './ui/kanban-tree-provider';
import { PipelineTreeProvider } from './ui/pipeline-tree-provider';
import { PipelineService, PipelineState } from './services/pipeline-service';
import { DiagnosticProvider } from './ui/diagnostic-provider';
import { WorkflowDocumentLinkProvider } from './ui/document-link-provider';
import { WorkflowCodeLensProvider } from './ui/codelens-provider';
import { WorkflowCompletionProvider } from './ui/completion-provider';
import { WorkflowHoverProvider } from './ui/hover-provider';
import { StatusBar } from './ui/status-bar';
import { NotificationsManager } from './ui/notifications';
import { TicketService } from './services/ticket-service';
import { FileWatcherService } from './services/file-watcher-service';
import { DependencyService } from './services/dependency-service';
import { TicketStatus } from './data/types';
import { executeNewTicket } from './commands/new-ticket';
import { executeNewPlan } from './commands/new-plan';
import { PlanService } from './services/plan-service';
import { executeShowDependencies } from './commands/show-dependencies';
import { executeShowStatistics } from './commands/show-statistics';
import {
  executeOpenPipelineConfig,
  executeOpenConfig,
  executeFocusTicketsView,
  executeFocusKanban,
  executeRefreshAll,
  executeCopyTicketId,
  executeFilterTicketsByPlan,
  executeClearTicketFilter
} from './commands/index';
import { onLocaleChanged, t } from './i18n';
import { initializeErrorHandler, getErrorHandler } from './error-handler';

const execAsync = promisify(exec);

/**
 * Extract ticket ID from a command argument.
 * When invoked from tree view context menus, VS Code passes the tree item object.
 * When invoked programmatically, a plain string is passed.
 */
function resolveTicketId(arg: unknown): string | undefined {
  if (typeof arg === 'string') {
    return arg;
  }
  if (arg && typeof arg === 'object') {
    // TicketTreeItem has .ticket.id, KanbanTicketTreeItem has .ticket.id
    const item = arg as Record<string, unknown>;
    if (item.ticket && typeof item.ticket === 'object') {
      const ticket = item.ticket as Record<string, unknown>;
      if (typeof ticket.id === 'string') {
        return ticket.id;
      }
    }
    // CompletedStageTreeItem has .ticket as string
    if (typeof item.ticket === 'string') {
      return item.ticket;
    }
    // SidebarTreeItem has .id directly
    if (typeof item.id === 'string') {
      return item.id;
    }
  }
  return undefined;
}

/**
 * Check if workflow CLI is installed on the system.
 * Uses platform-specific commands: 'which' on Unix, 'where' on Windows.
 * Falls back to configured cliPath if available.
 */
export async function checkCliInstalled(errorHandler?: ReturnType<typeof getErrorHandler>): Promise<boolean> {
  try {
    const platform = process.platform;
    const config = vscode.workspace.getConfiguration('workflow');
    const customCliPath = config.get<string>('cliPath', '');

    // Check custom path first if configured
    if (customCliPath) {
      try {
        await execAsync(`"${customCliPath}" --version`);
        return true;
      } catch {
        // Fall through to standard detection
      }
    }

    // Platform-specific detection with fallback to workflow-ai
    if (platform === 'win32') {
      try {
        await execAsync('where workflow');
        return true;
      } catch {
        // fallthrough to workflow-ai
      }
      await execAsync('where workflow-ai');
    } else {
      try {
        await execAsync('which workflow');
        return true;
      } catch {
        // fallthrough to workflow-ai
      }
      await execAsync('which workflow-ai');
    }
    return true;
  } catch (error) {
    if (errorHandler) {
      errorHandler.debug('CLI installation check failed', { error: error instanceof Error ? error.message : String(error) });
    }
    return false;
  }
}

/**
 * Check if .workflow/ directory exists with required config files.
 * Verifies presence of config.yaml and pipeline.yaml.
 */
export function checkWorkflowDir(errorHandler?: ReturnType<typeof getErrorHandler>): boolean {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return false;
  }

  const workflowDir = path.join(workspaceRoot, '.workflow');
  const configPath = path.join(workflowDir, 'config', 'config.yaml');
  const pipelinePath = path.join(workflowDir, 'config', 'pipeline.yaml');

  try {
    const dirExists = fs.existsSync(workflowDir);
    const configExists = fs.existsSync(configPath);
    const pipelineExists = fs.existsSync(pipelinePath);

    return dirExists && configExists && pipelineExists;
  } catch (error) {
    if (errorHandler) {
      errorHandler.debug('Workflow directory check failed', { error: error instanceof Error ? error.message : String(error) });
    }
    return false;
  }
}

/**
 * Set context key for VS Code UI conditional rendering.
 */
async function setContextKey(key: string, value: boolean): Promise<void> {
  await vscode.commands.executeCommand('setContext', key, value);
}

/**
 * Update all context keys based on current state.
 */
export async function updateContextKeys(
  pipelineService?: PipelineService,
  errorHandler?: ReturnType<typeof getErrorHandler>
): Promise<void> {
  const cliInstalled = await checkCliInstalled(errorHandler);
  const workflowFound = checkWorkflowDir(errorHandler);
  const pipelineRunning = pipelineService?.getState() === PipelineState.Running;

  await setContextKey('workflow.cliInstalled', cliInstalled);
  await setContextKey('workflow.workflowFound', workflowFound);
  await setContextKey('workflow.pipelineRunning', pipelineRunning);
  await setContextKey('workflow.sortAscending', false); // Default to descending
  // workflow.ticketFilterActive is set by filter/clear commands
}

/**
 * Install workflow-ai CLI globally.
 */
async function installCli(errorHandler?: ReturnType<typeof getErrorHandler>): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Installing workflow-ai CLI...',
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 0 });
      try {
        await execAsync('npm install -g workflow-ai');
        progress.report({ increment: 100 });
        await updateContextKeys(undefined, errorHandler);
        vscode.window.showInformationMessage(t('workflow-ai CLI installed successfully!'));
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Install CLI', {
            userMessage: t('Failed to install workflow-ai CLI. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to install workflow-ai CLI: {0}', message));
        }
      }
    }
  );
}

/**
 * Initialize workflow in the current workspace.
 * Tries 'workflow init' first, falls back to 'workflow-ai init' if binary not found.
 */
async function initWorkflow(errorHandler?: ReturnType<typeof getErrorHandler>): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: t('Initializing Workflow...'),
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 0 });
      try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
          const open = t('Open Folder');
          const result = await vscode.window.showWarningMessage(
            t('Please open a folder first to initialize Workflow.'),
            open
          );
          if (result === open) {
            await vscode.commands.executeCommand('vscode.openFolder');
          }
          return;
        }

        // Try 'workflow init' first, fallback to 'workflow-ai init' if binary not found
        try {
          await execAsync('workflow init', { cwd: workspaceRoot });
        } catch (err: any) {
          if (err.code === 'ENOENT') {
            // Binary 'workflow' not found, try 'workflow-ai'
            await execAsync('workflow-ai init', { cwd: workspaceRoot });
          } else {
            // Re-throw other errors
            throw err;
          }
        }

        progress.report({ increment: 100 });
        await updateContextKeys(undefined, errorHandler);
        vscode.window.showInformationMessage(t('Workflow initialized successfully!'));
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Initialize Workflow', {
            userMessage: t('Failed to initialize workflow. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to initialize workflow: {0}', message));
        }
      }
    }
  );
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const startTime = Date.now();
  console.log('Workflow AI extension is activating...');

  // Initialize centralized error handler
  const errorHandler = initializeErrorHandler();
  context.subscriptions.push(errorHandler);

  // Helper function to safely register commands (handles duplicate registration during testing)
  const registerCommandSafe = (command: string, callback: (...args: any[]) => any) => {
    try {
      return vscode.commands.registerCommand(command, callback);
    } catch (err) {
      // Command already registered, return a no-op disposable
      console.warn(`Command ${command} already registered, skipping`);
      return { dispose: () => {} };
    }
  };

  // Initialize context keys on activation
  await updateContextKeys();

  // Initialize WorkflowStore
  const store = new WorkflowStore();
  context.subscriptions.push({
    dispose: () => store.clear()
  });

  // Find workflow root
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  let workflowRoot: string | null = null;
  
  if (workspaceRoot && checkWorkflowDir()) {
    workflowRoot = path.join(workspaceRoot, '.workflow');
    // Refresh store with workflow data
    await store.refresh(workflowRoot).catch(err => {
      console.error('Failed to refresh workflow store:', err);
    });
  }

  // Create tree providers
  const ticketsProvider = new TicketsTreeProvider(store);
  const plansProvider = new PlansTreeProvider(store);
  const reportsProvider = new ReportsTreeProvider(store);
  const pipelineService = new PipelineService();
  
  // Listen for pipeline state changes and update context keys
  pipelineService.on('stateChange', async () => {
    await updateContextKeys(pipelineService);
  });
  
  // Update context keys with pipeline state after service creation
  await updateContextKeys(pipelineService);
  
  const pipelineProvider = new PipelineTreeProvider(store, pipelineService);
  const skillsProvider = new SkillsTreeProvider(store);
  const logsProvider = new LogsTreeProvider(store);
  const kanbanProviders = createKanbanProviders(store);

  // Set extension context for persistence
  pipelineProvider.setContext(context);

  // Create StatusBar
  const statusBar = new StatusBar(pipelineService, store);

  // Create NotificationsManager
  const notificationsManager = new NotificationsManager(store, pipelineService);
  if (workflowRoot) {
    notificationsManager.setWorkflowRoot(workflowRoot);
  }
  notificationsManager.initialize();

  // Set workflow root if available
  if (workflowRoot) {
    pipelineService.setWorkflowRoot(workflowRoot);
    ticketsProvider.setWorkflowRoot(workflowRoot);
    plansProvider.setWorkflowRoot(workflowRoot);
    reportsProvider.setWorkflowRoot(workflowRoot);
    pipelineProvider.setWorkflowRoot(workflowRoot);
    await pipelineProvider.loadHistoryFromStorage();
    skillsProvider.setWorkflowRoot(workflowRoot);
    logsProvider.setWorkflowRoot(workflowRoot);
    kanbanProviders.backlog.setWorkflowRoot(workflowRoot);
    kanbanProviders.ready.setWorkflowRoot(workflowRoot);
    kanbanProviders.inProgress.setWorkflowRoot(workflowRoot);
    kanbanProviders.blocked.setWorkflowRoot(workflowRoot);
    kanbanProviders.review.setWorkflowRoot(workflowRoot);
    kanbanProviders.done.setWorkflowRoot(workflowRoot);
  }

  // Register tree views
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('workflow-sidebar.tickets', ticketsProvider),
    vscode.window.registerTreeDataProvider('workflow-sidebar.plans', plansProvider),
    vscode.window.registerTreeDataProvider('workflow-sidebar.reports', reportsProvider),
    vscode.window.registerTreeDataProvider('workflow-sidebar.skills', skillsProvider),
    vscode.window.registerTreeDataProvider('workflow-sidebar.logs', logsProvider),
    vscode.window.registerTreeDataProvider('workflow-sidebar.pipeline', pipelineProvider),
    statusBar,
    skillsProvider,
    logsProvider
  );

  // Register Kanban views using createTreeView for title/badge support
  const backlogTreeView = vscode.window.createTreeView('wf-kanban-backlog', { treeDataProvider: kanbanProviders.backlog });
  const readyTreeView = vscode.window.createTreeView('wf-kanban-ready', { treeDataProvider: kanbanProviders.ready });
  const inProgressTreeView = vscode.window.createTreeView('wf-kanban-in-progress', { treeDataProvider: kanbanProviders.inProgress });
  const blockedTreeView = vscode.window.createTreeView('wf-kanban-blocked', { treeDataProvider: kanbanProviders.blocked });
  const reviewTreeView = vscode.window.createTreeView('wf-kanban-review', { treeDataProvider: kanbanProviders.review });
  const doneTreeView = vscode.window.createTreeView('wf-kanban-done', { treeDataProvider: kanbanProviders.done });

  context.subscriptions.push(
    backlogTreeView,
    readyTreeView,
    inProgressTreeView,
    blockedTreeView,
    reviewTreeView,
    doneTreeView
  );

  // Update Kanban view titles with ticket counts
  const updateKanbanTitles = () => {
    // Get current plan filter from any kanban provider (they're all synced)
    const filterPlan = kanbanProviders.backlog.getPlanFilter();
    const plan = filterPlan ? store.getPlanById(filterPlan) : undefined;
    const planTitle = plan ? `: ${plan.title}` : '';
    const filterPrefix = filterPlan ? `🔍 ${filterPlan}${planTitle} — ` : '';

    backlogTreeView.title = `${filterPrefix}BACKLOG (${kanbanProviders.backlog.getCount()})`;
    readyTreeView.title = `${filterPrefix}READY (${kanbanProviders.ready.getCount()})`;
    inProgressTreeView.title = `${filterPrefix}IN PROGRESS (${kanbanProviders.inProgress.getCount()})`;
    blockedTreeView.title = `${filterPrefix}BLOCKED (${kanbanProviders.blocked.getCount()})`;
    reviewTreeView.title = `${filterPrefix}REVIEW (${kanbanProviders.review.getCount()})`;
    doneTreeView.title = `${filterPrefix}DONE (${kanbanProviders.done.getCount()})`;
  };

  // Update Kanban view badges with ticket counts
  const updateKanbanBadges = () => {
    backlogTreeView.badge = kanbanProviders.backlog.getBadge();
    readyTreeView.badge = kanbanProviders.ready.getBadge();
    inProgressTreeView.badge = kanbanProviders.inProgress.getBadge();
    blockedTreeView.badge = kanbanProviders.blocked.getBadge();
    reviewTreeView.badge = kanbanProviders.review.getBadge();
    doneTreeView.badge = kanbanProviders.done.getBadge();
  };

  // Initial title update
  updateKanbanTitles();
  updateKanbanBadges();

  // Subscribe to store changes to update titles and refresh all tree providers
  store.onDidChange(() => {
    updateKanbanTitles();
    updateKanbanBadges();
    ticketsProvider.refresh();
    plansProvider.refresh();
    reportsProvider.refresh();
    skillsProvider.refresh();
    logsProvider.refresh();
    pipelineProvider.refresh();
    kanbanProviders.backlog.refresh();
    kanbanProviders.ready.refresh();
    kanbanProviders.inProgress.refresh();
    kanbanProviders.blocked.refresh();
    kanbanProviders.review.refresh();
    kanbanProviders.done.refresh();
  });

  // Start file watcher for automatic refresh on external changes
  if (workflowRoot) {
    const fileWatcher = new FileWatcherService(store, workflowRoot);
    context.subscriptions.push(fileWatcher);
  }

  // Register diagnostic provider for real-time validation
  const diagnosticProvider = new DiagnosticProvider(store);
  context.subscriptions.push(diagnosticProvider);

  // Register document link provider for clickable links in tickets and pipeline.yaml
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

  // Register CodeLens provider for ticket .md files and pipeline.yaml
  if (workflowRoot) {
    const ticketService = new TicketService(store, workflowRoot);
    const dependencyService = new DependencyService(store);
    const codeLensProvider = new WorkflowCodeLensProvider(
      store,
      ticketService,
      dependencyService
    );
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

  // Register CompletionItemProvider for .md and pipeline.yaml files
  if (workflowRoot) {
    const completionProvider = new WorkflowCompletionProvider(store);
    completionProvider.setWorkflowRoot(workflowRoot);
    const completionDisposable = vscode.languages.registerCompletionItemProvider(
      [
        { scheme: 'file', pattern: '**/.workflow/tickets/**/*.md' },
        { scheme: 'file', pattern: '**/.workflow/config/pipeline.yaml' }
      ],
      completionProvider,
      '-', // Trigger character for list items
      ' ', // Trigger character for general completion
      ':'  // Trigger character for YAML fields
    );
    context.subscriptions.push(completionDisposable);
  }

  // Register HoverProvider for .md and .yaml files
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

  // Create services for commands
  let ticketService: TicketService | undefined;
  let dependencyService: DependencyService | undefined;
  let planService: PlanService | undefined;

  if (workflowRoot) {
    ticketService = new TicketService(store, workflowRoot);
    dependencyService = new DependencyService(store);
    planService = new PlanService(store, workflowRoot);
  }

  // Register commands
  const installCliCmd = registerCommandSafe('workflow.installCli', () => installCli(errorHandler));
  const initCmd = registerCommandSafe('workflow.init', () => initWorkflow(errorHandler));

  /**
   * Focus pipeline stage command - opens pipeline.yaml and focuses on a stage
   */
  registerCommandSafe(
    'workflow.focusPipelineStage',
    async (stageId: string) => {
      if (!workflowRoot) {
        vscode.window.showErrorMessage(t('Workflow root not available'));
        return;
      }

      const pipelinePath = path.join(workflowRoot, 'config', 'pipeline.yaml');

      try {
        const doc = await vscode.workspace.openTextDocument(pipelinePath);
        const editor = await vscode.window.showTextDocument(doc);

        // Find the stage in the document
        const content = doc.getText();
        const escapedStageId = stageId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const stageRegex = new RegExp(`^\\s{4}${escapedStageId}:\\s*$`, 'm');
        const match = stageRegex.exec(content);

        if (match) {
          const textBeforeMatch = content.substring(0, match.index);
          const lineNumber = (textBeforeMatch.match(/\n/g) || []).length;
          const position = new vscode.Position(lineNumber, 0);

          editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenter
          );
          editor.selection = new vscode.Selection(position, position);
        }
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Focus Pipeline Stage', {
            userMessage: t('Failed to focus on pipeline stage. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to focus on stage: {0}', message));
        }
      }
    }
  );

  /**
   * Open ticket command - opens ticket file in editor
   */
  const openTicketCmd = registerCommandSafe(
    'workflow.openTicket',
    async (arg: unknown) => {
      let ticketId = resolveTicketId(arg);
      if (!ticketId) {
        // Try to get from active editor or selection
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          ticketId = path.basename(editor.document.fileName, '.md');
        }
      }

      if (!ticketId || !workflowRoot) {
        vscode.window.showErrorMessage(t('No ticket ID provided or workflow not available'));
        return;
      }

      const ticket = store.getTicketById(ticketId);
      if (!ticket) {
        vscode.window.showErrorMessage(t('Ticket {0} not found', ticketId));
        return;
      }

      const ticketPath = path.join(
        workflowRoot,
        'tickets',
        ticket.status,
        `${ticketId}.md`
      );

      try {
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(ticketPath));
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Open Ticket', {
            userMessage: t('Failed to open ticket. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to open ticket: {0}', message));
        }
      }
    }
  );

  /**
   * Move ticket command - opens QuickPick to select target status
   */
  const moveTicketCmd = registerCommandSafe(
    'workflow.moveTicket',
    async (arg: unknown) => {
      const ticketId = resolveTicketId(arg);
      if (!ticketService || !ticketId) {
        vscode.window.showErrorMessage(t('Ticket service not available or no ticket ID provided'));
        return;
      }

      const ticket = ticketService.getById(ticketId);
      if (!ticket) {
        vscode.window.showErrorMessage(t('Ticket {0} not found', ticketId));
        return;
      }

      // Get valid transitions
      const validTransitions = ticketService.getValidTransitions(ticket.status);
      if (validTransitions.length === 0) {
        vscode.window.showInformationMessage(t('No valid transitions from {0}', ticket.status));
        return;
      }

      // Show QuickPick for target status
      const targetStatus = await vscode.window.showQuickPick(
        validTransitions.map(status => ({
          label: status,
          description: t('Move to {0}', status)
        })),
        {
          placeHolder: t('Select target status for {0}', ticketId),
          title: t('Move {0}', ticketId)
        }
      );

      if (!targetStatus) {
        return; // User cancelled
      }

      try {
        await ticketService.move(ticketId, targetStatus.label as TicketStatus);
        vscode.window.showInformationMessage(t('Moved {0} to {1}', ticketId, targetStatus.label));
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Move Ticket', {
            userMessage: t('Failed to move ticket. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to move ticket: {0}', message));
        }
      }
    }
  );

  /**
   * Move ticket from menu command - same as moveTicket but for context menu
   */
  const moveTicketFromMenuCmd = registerCommandSafe(
    'workflow.moveTicketFromMenu',
    async (arg: unknown) => {
      const ticketId = resolveTicketId(arg);
      // Reuse the moveTicket command logic
      await vscode.commands.executeCommand('workflow.moveTicket', ticketId);
    }
  );

  /**
   * Move ticket next command - moves ticket to next valid status in workflow
   * Uses TicketService.getValidTransitions() to determine next status
   */
  const moveTicketNextCmd = registerCommandSafe(
    'workflow.moveTicketNext',
    async (arg: unknown) => {
      const ticketId = resolveTicketId(arg);
      if (!ticketService || !ticketId) {
        vscode.window.showErrorMessage(t('Ticket service not available or no ticket ID provided'));
        return;
      }

      const ticket = ticketService.getById(ticketId);
      if (!ticket) {
        vscode.window.showErrorMessage(t('Ticket {0} not found', ticketId));
        return;
      }

      // Get valid transitions and pick the first one (primary next status)
      const validTransitions = ticketService.getValidTransitions(ticket.status);
      if (validTransitions.length === 0) {
        vscode.window.showInformationMessage(t('No valid transitions from {0}', ticket.status));
        return;
      }

      // Use first valid transition as "next" status
      const nextStatus = validTransitions[0];

      try {
        await ticketService.move(ticketId, nextStatus);
        vscode.window.showInformationMessage(t('Moved {0} to {1}', ticketId, nextStatus));
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Move Ticket Next', {
            userMessage: t('Failed to move ticket. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to move ticket: {0}', message));
        }
      }
    }
  );

  /**
   * Edit ticket command - opens ticket file for editing
   */
  const editTicketCmd = registerCommandSafe(
    'workflow.editTicket',
    async (arg: unknown) => {
      let ticketId = resolveTicketId(arg);
      if (!ticketId) {
        // Try to get from active editor or selection
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          ticketId = path.basename(editor.document.fileName, '.md');
        }
      }

      if (!ticketId || !workflowRoot) {
        vscode.window.showErrorMessage(t('No ticket ID provided or workflow not available'));
        return;
      }

      const ticket = store.getTicketById(ticketId);
      if (!ticket) {
        vscode.window.showErrorMessage(t('Ticket {0} not found', ticketId));
        return;
      }

      const ticketPath = path.join(
        workflowRoot,
        'tickets',
        ticket.status,
        `${ticketId}.md`
      );

      try {
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(ticketPath));
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Edit Ticket', {
            userMessage: t('Failed to open ticket. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to open ticket: {0}', message));
        }
      }
    }
  );

  /**
   * Show dependencies command - shows dependencies in a view
   */
  const showDependenciesCmd = registerCommandSafe(
    'workflow.showDependencies',
    async (arg: unknown) => {
      try {
        const ticketId = resolveTicketId(arg);
        if (!dependencyService || !ticketId) {
          vscode.window.showErrorMessage(t('Dependency service not available or no ticket ID provided'));
          return;
        }

        const ticket = store.getTicketById(ticketId);
        if (!ticket) {
          vscode.window.showErrorMessage(t('Ticket {0} not found', ticketId));
          return;
        }

        const dependencies = dependencyService.getDependencies(ticketId);
        const dependents = dependencyService.getDependents(ticketId);

        // Build quick info message
        const depList = dependencies.length > 0
          ? dependencies.map(d => `- ${d.id}: ${d.title} (${d.status})`).join('\n')
          : t('No dependencies');

        const blocksList = dependents.length > 0
          ? dependents.map(d => `- ${d.id}: ${d.title} (${d.status})`).join('\n')
          : t('No tickets blocked by this one');

        const info = `**${ticketId}: ${ticket.title}**\n\n**Dependencies (Deps):**\n${depList}\n\n**Blocks:**\n${blocksList}`;

        await vscode.window.showInformationMessage(info, { modal: false });
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Show Dependencies', {
            userMessage: t('Failed to show dependencies. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to show dependencies: {0}', message));
        }
      }
    }
  );

  /**
   * Show ticket dependencies command - alias for context menu
   */
  const showTicketDependenciesCmd = registerCommandSafe(
    'workflow.showTicketDependencies',
    async (arg: unknown) => {
      const ticketId = resolveTicketId(arg);
      await vscode.commands.executeCommand('workflow.showDependencies', ticketId);
    }
  );

  /**
   * Refresh tickets command - refreshes the tickets tree view
   */
  const refreshTicketsCmd = registerCommandSafe(
    'workflow.refreshTickets',
    async () => {
      try {
        ticketsProvider.refresh();
        // Also refresh the store
        if (workflowRoot) {
          await store.refresh(workflowRoot);
        }
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Refresh Tickets', {
            userMessage: t('Failed to refresh tickets. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to refresh tickets: {0}', message));
        }
      }
    }
  );

  /**
   * Sort Kanban by priority command
   */
  const setAllKanbanSortMode = (mode: KanbanSortMode) => {
    kanbanProviders.backlog.setSortMode(mode);
    kanbanProviders.ready.setSortMode(mode);
    kanbanProviders.inProgress.setSortMode(mode);
    kanbanProviders.blocked.setSortMode(mode);
    kanbanProviders.review.setSortMode(mode);
    kanbanProviders.done.setSortMode(mode);
  };

  const sortKanbanByPriorityCmd = registerCommandSafe(
    'workflow.sortKanbanByPriority',
    async () => {
      try {
        setAllKanbanSortMode('priority');
        vscode.window.showInformationMessage(t('Kanban boards sorted by priority'));
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Sort Kanban By Priority', {
            userMessage: t('Failed to sort kanban. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to sort kanban: {0}', message));
        }
      }
    }
  );

  /**
   * Sort Kanban by ID command
   */
  const sortKanbanByIdCmd = registerCommandSafe(
    'workflow.sortKanbanById',
    async () => {
      try {
        setAllKanbanSortMode('id');
        vscode.window.showInformationMessage(t('Kanban boards sorted by ID'));
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Sort Kanban By ID', {
            userMessage: t('Failed to sort kanban. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to sort kanban: {0}', message));
        }
      }
    }
  );

  /**
   * Sort Kanban by title command
   */
  const sortKanbanByTitleCmd = registerCommandSafe(
    'workflow.sortKanbanByTitle',
    async () => {
      try {
        setAllKanbanSortMode('title');
        vscode.window.showInformationMessage(t('Kanban boards sorted by title'));
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Sort Kanban By Title', {
            userMessage: t('Failed to sort kanban. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to sort kanban: {0}', message));
        }
      }
    }
  );

  /**
   * Sort Kanban by date command
   */
  const sortKanbanByDateCmd = registerCommandSafe(
    'workflow.sortKanbanByDate',
    async () => {
      try {
        setAllKanbanSortMode('date');
        vscode.window.showInformationMessage(t('Kanban boards sorted by date'));
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Sort Kanban By Date', {
            userMessage: t('Failed to sort kanban. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to sort kanban: {0}', message));
        }
      }
    }
  );

  /**
   * Toggle sort direction (ascending/descending) command
   */
  const toggleSortDirectionCmd = registerCommandSafe(
    'workflow.toggleSortDirection',
    async () => {
      try {
        // Get current direction from first kanban provider (they all share the same state)
        const current = kanbanProviders.backlog.getSortAscending();
        const ascending = !current;

        // Set direction for all kanban providers
        kanbanProviders.backlog.setSortAscending(ascending);
        kanbanProviders.ready.setSortAscending(ascending);
        kanbanProviders.inProgress.setSortAscending(ascending);
        kanbanProviders.blocked.setSortAscending(ascending);
        kanbanProviders.review.setSortAscending(ascending);
        kanbanProviders.done.setSortAscending(ascending);

        // Update context key for UI
        await setContextKey('workflow.sortAscending', ascending);

        const direction = ascending ? t('ascending') : t('descending');
        vscode.window.showInformationMessage(t('Sort direction set to {0}', direction));
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Toggle Sort Direction', {
            userMessage: t('Failed to toggle sort direction. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to toggle sort direction: {0}', message));
        }
      }
    }
  );

  /**
   * Sort Tickets Sidebar by priority command
   */
  const setAllTicketsSortMode = (mode: import('./ui/sidebar-tree-provider').SidebarSortMode) => {
    ticketsProvider.setSortMode(mode);
  };

  const sortTicketsByPriorityCmd = registerCommandSafe(
    'workflow.sortTicketsByPriority',
    async () => {
      try {
        setAllTicketsSortMode('priority');
        vscode.window.showInformationMessage(t('Tickets sidebar sorted by priority'));
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Sort Tickets By Priority', {
            userMessage: t('Failed to sort tickets. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to sort tickets: {0}', message));
        }
      }
    }
  );

  /**
   * Sort Tickets Sidebar by ID command
   */
  const sortTicketsByIdCmd = registerCommandSafe(
    'workflow.sortTicketsById',
    async () => {
      try {
        setAllTicketsSortMode('id');
        vscode.window.showInformationMessage(t('Tickets sidebar sorted by ID'));
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Sort Tickets By ID', {
            userMessage: t('Failed to sort tickets. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to sort tickets: {0}', message));
        }
      }
    }
  );

  /**
   * Sort Tickets Sidebar by title command
   */
  const sortTicketsByTitleCmd = registerCommandSafe(
    'workflow.sortTicketsByTitle',
    async () => {
      try {
        setAllTicketsSortMode('title');
        vscode.window.showInformationMessage(t('Tickets sidebar sorted by title'));
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Sort Tickets By Title', {
            userMessage: t('Failed to sort tickets. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to sort tickets: {0}', message));
        }
      }
    }
  );

  /**
   * Sort Tickets Sidebar by date command
   */
  const sortTicketsByDateCmd = registerCommandSafe(
    'workflow.sortTicketsByDate',
    async () => {
      try {
        setAllTicketsSortMode('date');
        vscode.window.showInformationMessage(t('Tickets sidebar sorted by date'));
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Sort Tickets By Date', {
            userMessage: t('Failed to sort tickets. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to sort tickets: {0}', message));
        }
      }
    }
  );

  /**
   * Go to review section command - navigates to review section in document
   */
  const gotoReviewSectionCmd = registerCommandSafe(
    'workflow.gotoReviewSection',
    async () => {
      try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showErrorMessage(t('No active editor'));
          return;
        }

        const document = editor.document;
        const content = document.getText();

        // Find review section
        const reviewMatch = content.match(/^## Review/m);
        if (!reviewMatch || reviewMatch.index === undefined) {
          vscode.window.showInformationMessage(t('No Review section found in this document'));
          return;
        }

        const position = document.positionAt(reviewMatch.index);
        await editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        editor.selection = new vscode.Selection(position, position);
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Go To Review Section', {
            userMessage: t('Failed to go to review section. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to go to review section: {0}', message));
        }
      }
    }
  );

  /**
   * Start pipeline command - opens QuickPick for mode selection
   */
  const startPipelineCmd = registerCommandSafe(
    'workflow.runPipeline',
    async () => {
      try {
        await pipelineProvider.startPipeline();
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Start Pipeline', {
            userMessage: t('Failed to start pipeline. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to start pipeline: {0}', message));
        }
      }
    }
  );

  /**
   * Stop pipeline command
   */
  const stopPipelineCmd = registerCommandSafe(
    'workflow.stopPipeline',
    async () => {
      try {
        pipelineProvider.stopPipeline();
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Stop Pipeline', {
            userMessage: t('Failed to stop pipeline. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to stop pipeline: {0}', message));
        }
      }
    }
  );

  /**
   * Show pipeline output command
   */
  const showPipelineOutputCmd = registerCommandSafe(
    'workflow.showPipelineOutput',
    async () => {
      try {
        pipelineProvider.showOutput();
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Show Pipeline Output', {
            userMessage: t('Failed to show pipeline output. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to show pipeline output: {0}', message));
        }
      }
    }
  );

  /**
   * Clear pipeline history command
   */
  const clearPipelineHistoryCmd = registerCommandSafe(
    'workflow.clearPipelineHistory',
    async () => {
      try {
        pipelineProvider.clearHistory();
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Clear Pipeline History', {
            userMessage: t('Failed to clear pipeline history. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to clear pipeline history: {0}', message));
        }
      }
    }
  );

  /**
   * Status bar click command - opens Command Palette with WF: prefix
   */
  const statusBarClickCmd = registerCommandSafe(
    'workflow.statusBarClick',
    async () => {
      try {
        await vscode.commands.executeCommand('workbench.action.quickOpen', '>WF:');
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Status Bar Click', {
            userMessage: t('Failed to open command palette. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to open command palette: {0}', message));
        }
      }
    }
  );

  /**
   * workflow.newTicket command - creates new ticket via QuickPick + InputBox
   */
  const newTicketCmd = registerCommandSafe(
    'workflow.newTicket',
    async () => {
      try {
        if (!ticketService) {
          vscode.window.showErrorMessage(t('Ticket service not available'));
          return;
        }
        await executeNewTicket(ticketService);
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'New Ticket', {
            userMessage: t('Failed to create new ticket. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to create new ticket: {0}', message));
        }
      }
    }
  );

  /**
   * workflow.newPlan command - creates new plan via InputBox → PlanService.create()
   */
  const newPlanCmd = registerCommandSafe(
    'workflow.newPlan',
    async () => {
      try {
        if (!planService) {
          vscode.window.showErrorMessage(t('Workflow not found'));
          return;
        }
        await executeNewPlan(planService);
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'New Plan', {
            userMessage: t('Failed to create plan. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to create plan: {0}', message));
        }
      }
    }
  );

  /**
   * Helper function to resolve plan ID from command argument
   */
  function resolvePlanId(arg: unknown): string | undefined {
    if (typeof arg === 'string') {
      return arg;
    }
    if (arg && typeof arg === 'object') {
      const item = arg as Record<string, unknown>;
      // PlanTreeItem has .plan.id
      if (item.plan && typeof item.plan === 'object') {
        const plan = item.plan as Record<string, unknown>;
        if (typeof plan.id === 'string') {
          return plan.id;
        }
      }
      // HistoryItemTreeItem has .entry.planId
      if (item.entry && typeof item.entry === 'object') {
        const entry = item.entry as Record<string, unknown>;
        if (typeof entry.planId === 'string') {
          return entry.planId;
        }
      }
      // SidebarTreeItem has .id
      if (typeof item.id === 'string') {
        return item.id;
      }
    }
    return undefined;
  }

  /**
   * Helper function to resolve log file path from command argument
   */
  function resolveLogFile(arg: unknown): string | undefined {
    if (typeof arg === 'string') {
      return arg;
    }
    if (arg && typeof arg === 'object') {
      const item = arg as Record<string, unknown>;
      // HistoryItemTreeItem has .entry.logFile
      if (item.entry && typeof item.entry === 'object') {
        const entry = item.entry as Record<string, unknown>;
        if (typeof entry.logFile === 'string') {
          return entry.logFile;
        }
      }
      // Direct .logFile property
      if (typeof item.logFile === 'string') {
        return item.logFile;
      }
    }
    return undefined;
  }

  /**
   * Helper function to resolve report path from command argument
   */
  function resolveReportPath(arg: unknown): string | undefined {
    if (typeof arg === 'string') {
      return arg;
    }
    if (arg && typeof arg === 'object') {
      const item = arg as Record<string, unknown>;
      // HistoryReportTreeItem has .reportPath
      if (typeof item.reportPath === 'string') {
        return item.reportPath;
      }
      // CompletedStageTreeItem has .reportPath
      if (typeof item.reportPath === 'string') {
        return item.reportPath;
      }
      // HistoryItemTreeItem has .entry.reports[0].path
      if (item.entry && typeof item.entry === 'object') {
        const entry = item.entry as Record<string, unknown>;
        if (entry.reports && Array.isArray(entry.reports) && entry.reports.length > 0) {
          const report = entry.reports[0] as Record<string, unknown>;
          if (typeof report.path === 'string') {
            return report.path;
          }
        }
      }
    }
    return undefined;
  }

  /**
   * workflow.decomposePlan command - launches decomposition agent for a plan
   */
  const decomposePlanCmd = registerCommandSafe(
    'workflow.decomposePlan',
    async (arg?: unknown) => {
      try {
        let planId = resolvePlanId(arg);

        // If no plan ID from argument, show QuickPick to select a plan
        if (!planId) {
          if (!workflowRoot) {
            vscode.window.showErrorMessage(t('Workflow root not available'));
            return;
          }
          const plans = store.getPlans().filter(p => p.folder === 'current');
          if (plans.length === 0) {
            vscode.window.showInformationMessage(t('No current plans available'));
            return;
          }
          plans.sort((a, b) => a.id.localeCompare(b.id));
          const picked = await vscode.window.showQuickPick(
            plans.map(p => ({ label: p.id, description: p.title, planId: p.id })),
            { placeHolder: t('Select plan to decompose') }
          );
          if (!picked) {
            return;
          }
          planId = picked.planId;
        }

        if (!workflowRoot) {
          vscode.window.showErrorMessage(t('Workflow root not available'));
          return;
        }

        const planPath = path.join(workflowRoot, 'plans', 'current', `${planId}.md`);

        // Check if plan exists in current folder, if not check archive
        let actualPlanPath = planPath;
        if (!fs.existsSync(planPath)) {
          actualPlanPath = path.join(workflowRoot, 'plans', 'archive', `${planId}.md`);
        }

        if (!fs.existsSync(actualPlanPath)) {
          vscode.window.showErrorMessage(t('Plan {0} not found', planId));
          return;
        }

        // Read pipeline.yaml to get default agent config
        const pipelinePath = path.join(workflowRoot, 'config', 'pipeline.yaml');
        if (!fs.existsSync(pipelinePath)) {
          vscode.window.showErrorMessage(t('Pipeline config not found: {0}', pipelinePath));
          return;
        }
        const pipelineContent = fs.readFileSync(pipelinePath, 'utf-8');
        const pipelineData = yaml.load(pipelineContent) as { pipeline?: { default_agent?: string; agents?: Record<string, { command: string; args: string[]; workdir?: string }> } };
        const defaultAgentId = pipelineData?.pipeline?.default_agent;
        const agent = defaultAgentId ? pipelineData?.pipeline?.agents?.[defaultAgentId] : undefined;
        if (!agent) {
          vscode.window.showErrorMessage(t('Default agent not configured in pipeline.yaml'));
          return;
        }

        // Build prompt: skill name + context
        const prompt = `decompose-plan Context: plan_id=${planId}`;

        // Build agent CLI command
        const agentArgs = agent.args.map((a: string) => `"${a}"`).join(' ');
        const agentCommand = `${agent.command} ${agentArgs} "${prompt}"`;

        // Remove CLAUDECODE env var to allow nested CLI calls
        const terminalEnv: Record<string, string | null> = { CLAUDECODE: null };

        // Launch agent in terminal with progress indication
        const terminal = vscode.window.createTerminal({
          name: `Decompose ${planId}`,
          cwd: workspaceRoot,
          env: terminalEnv
        });
        terminal.show();
        terminal.sendText(agentCommand);

        // Show spinner on plan tree item while decomposing
        plansProvider.setDecomposing(planId);

        const cleanupDecomposing = () => {
          plansProvider.clearDecomposing(planId!);
        };

        // Show progress notification while terminal is active
        vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: t('Decomposing plan {0}...', planId),
            cancellable: false
          },
          () => new Promise<void>(resolve => {
            let resolved = false;
            const done = () => {
              if (resolved) { return; }
              resolved = true;
              shellDisposable.dispose();
              closeDisposable.dispose();
              cleanupDecomposing();
              resolve();
            };

            // Fires when the command in the terminal finishes (process exit / Ctrl+C)
            const shellDisposable = vscode.window.onDidEndTerminalShellExecution(e => {
              if (e.terminal === terminal) { done(); }
            });

            // Fallback: fires when the terminal tab is closed
            const closeDisposable = vscode.window.onDidCloseTerminal(t => {
              if (t === terminal) { done(); }
            });
          })
        );
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Decompose Plan', {
            userMessage: t('Failed to decompose plan. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to decompose plan: {0}', message));
        }
      }
    }
  );

  /**
   * workflow.createPlanFromFile command - creates workflow plan from a plan file in workspace root
   */
  const createPlanFromFileCmd = registerCommandSafe(
    'workflow.createPlanFromFile',
    async (arg?: unknown) => {
      try {
        // Get document URI from argument
        let documentUri: vscode.Uri | undefined;
        
        if (arg instanceof vscode.Uri) {
          documentUri = arg;
        } else if (arg && typeof arg === 'object') {
          const item = arg as Record<string, unknown>;
          if (item.uri && item.uri instanceof vscode.Uri) {
            documentUri = item.uri;
          }
        }

        if (!documentUri) {
          vscode.window.showErrorMessage(t('Document not available'));
          return;
        }

        if (!workflowRoot) {
          vscode.window.showErrorMessage(t('Workflow root not available'));
          return;
        }

        const sourcePath = documentUri.fsPath;
        const sourceFileName = path.basename(sourcePath);

        // Read pipeline.yaml to get default agent config
        const pipelinePath = path.join(workflowRoot, 'config', 'pipeline.yaml');
        if (!fs.existsSync(pipelinePath)) {
          vscode.window.showErrorMessage(t('Pipeline config not found: {0}', pipelinePath));
          return;
        }
        const pipelineContent = fs.readFileSync(pipelinePath, 'utf-8');
        const pipelineData = yaml.load(pipelineContent) as { pipeline?: { default_agent?: string; agents?: Record<string, { command: string; args: string[]; workdir?: string }> } };
        const defaultAgentId = pipelineData?.pipeline?.default_agent;
        const agent = defaultAgentId ? pipelineData?.pipeline?.agents?.[defaultAgentId] : undefined;
        if (!agent) {
          vscode.window.showErrorMessage(t('Default agent not configured in pipeline.yaml'));
          return;
        }

        // Build prompt: create-plan skill + context (source file path)
        const prompt = `create-plan Context: source_file=${sourcePath}`;

        // Build agent CLI command
        const agentArgs = agent.args.map((a: string) => `"${a}"`).join(' ');
        const agentCommand = `${agent.command} ${agentArgs} "${prompt}"`;

        // Remove CLAUDECODE env var to allow nested CLI calls
        const terminalEnv: Record<string, string | null> = { CLAUDECODE: null };

        // Launch agent in terminal with progress indication
        const terminal = vscode.window.createTerminal({
          name: `Create Plan from ${sourceFileName}`,
          cwd: workspaceRoot,
          env: terminalEnv
        });
        terminal.show();
        terminal.sendText(agentCommand);

        // Show progress notification while terminal is active
        vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: t('Creating plan from {0}...', sourceFileName),
            cancellable: false
          },
          () => new Promise<void>(resolve => {
            const disposable = vscode.window.onDidCloseTerminal(closedTerminal => {
              if (closedTerminal === terminal) {
                disposable.dispose();
                resolve();
              }
            });
          })
        );
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Create Plan from File', {
            userMessage: t('Failed to create plan. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to create plan: {0}', message));
        }
      }
    }
  );

  /**
   * workflow.runPipelineForPlan command - runs pipeline with --plan flag
   */
  const runPipelineForPlanCmd = registerCommandSafe(
    'workflow.runPipelineForPlan',
    async (arg?: unknown) => {
      const planId = resolvePlanId(arg);
      if (!planId || !workflowRoot) {
        vscode.window.showErrorMessage(t('Plan ID not available or workflow not found'));
        return;
      }

      const planPath = path.join(workflowRoot, 'plans', 'current', `${planId}.md`);
      
      if (!fs.existsSync(planPath)) {
        vscode.window.showErrorMessage(t('Plan {0} not found in current plans', planId));
        return;
      }

      try {
        await pipelineProvider.startPipeline(planId);
        vscode.window.showInformationMessage(t('Pipeline started for plan {0}', planId));
      } catch (error) {
        // Check if it's a cancellation
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message.includes('cancel') || message.includes('abort')) {
          vscode.window.showInformationMessage(t('Pipeline cancelled'));
        } else {
          if (errorHandler) {
            errorHandler.handleError(error, 'Run Pipeline For Plan', {
              userMessage: t('Pipeline failed for plan {0}. Check Output channel for details.', planId)
            });
          } else {
            vscode.window.showErrorMessage(t('Pipeline failed for plan {0}: {1}', planId, message));
          }
        }
      }
    }
  );

  /**
   * workflow.archivePlan command - moves plan from current to archive
   */
  const archivePlanCmd = registerCommandSafe(
    'workflow.archivePlan',
    async (arg?: unknown) => {
      const planId = resolvePlanId(arg);
      if (!planId || !workflowRoot) {
        vscode.window.showErrorMessage(t('Plan ID not available or workflow not found'));
        return;
      }

      const sourcePath = path.join(workflowRoot, 'plans', 'current', `${planId}.md`);
      const targetPath = path.join(workflowRoot, 'plans', 'archive', `${planId}.md`);

      if (!fs.existsSync(sourcePath)) {
        vscode.window.showErrorMessage(t('Plan {0} not found in current plans', planId));
        return;
      }

      try {
        // Ensure archive directory exists
        const archiveDir = path.join(workflowRoot, 'plans', 'archive');
        if (!fs.existsSync(archiveDir)) {
          fs.mkdirSync(archiveDir, { recursive: true });
        }

        // Move file
        fs.renameSync(sourcePath, targetPath);

        // Refresh store to update UI
        await store.refresh(workflowRoot);

        vscode.window.showInformationMessage(t('Plan {0} archived', planId));
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Archive Plan', {
            userMessage: t('Failed to archive plan {0}. Check Output channel for details.', planId)
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to archive plan {0}: {1}', planId, message));
        }
      }
    }
  );

  /**
   * workflow.unarchivePlan command - moves plan from archive to current
   */
  const unarchivePlanCmd = registerCommandSafe(
    'workflow.unarchivePlan',
    async (arg?: unknown) => {
      const planId = resolvePlanId(arg);
      if (!planId || !workflowRoot) {
        vscode.window.showErrorMessage(t('Plan ID not available or workflow not found'));
        return;
      }

      const sourcePath = path.join(workflowRoot, 'plans', 'archive', `${planId}.md`);
      const targetPath = path.join(workflowRoot, 'plans', 'current', `${planId}.md`);

      if (!fs.existsSync(sourcePath)) {
        vscode.window.showErrorMessage(t('Plan {0} not found in archive', planId));
        return;
      }

      try {
        // Ensure current directory exists
        const currentDir = path.join(workflowRoot, 'plans', 'current');
        if (!fs.existsSync(currentDir)) {
          fs.mkdirSync(currentDir, { recursive: true });
        }

        // Move file
        fs.renameSync(sourcePath, targetPath);

        // Refresh store to update UI
        await store.refresh(workflowRoot);

        vscode.window.showInformationMessage(t('Plan {0} unarchived', planId));
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Unarchive Plan', {
            userMessage: t('Failed to unarchive plan {0}. Check Output channel for details.', planId)
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to unarchive plan {0}: {1}', planId, message));
        }
      }
    }
  );

  /**
   * workflow.showDependencies command - shows ticket dependencies
   */
  const showDependenciesCmdNew = registerCommandSafe(
    'workflow.showDependencies',
    async (arg?: unknown) => {
      try {
        const ticketId = resolveTicketId(arg);
        if (!dependencyService) {
          vscode.window.showErrorMessage(t('Dependency service not available'));
          return;
        }
        await executeShowDependencies(store, dependencyService, ticketId);
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Show Dependencies', {
            userMessage: t('Failed to show dependencies. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to show dependencies: {0}', message));
        }
      }
    }
  );

  /**
   * workflow.showStatistics command - shows workflow statistics
   */
  const showStatisticsCmd = registerCommandSafe(
    'workflow.showStatistics',
    async () => {
      try {
        await executeShowStatistics(store);
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Show Statistics', {
            userMessage: t('Failed to show statistics. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to show statistics: {0}', message));
        }
      }
    }
  );

  /**
   * workflow.openPipelineConfig command - opens pipeline.yaml
   */
  const openPipelineConfigCmd = registerCommandSafe(
    'workflow.openPipelineConfig',
    async () => {
      try {
        await executeOpenPipelineConfig(workflowRoot);
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Open Pipeline Config', {
            userMessage: t('Failed to open pipeline config. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to open pipeline config: {0}', message));
        }
      }
    }
  );

  /**
   * workflow.openConfig command - opens config.yaml
   */
  const openConfigCmd = registerCommandSafe(
    'workflow.openConfig',
    async () => {
      try {
        await executeOpenConfig(workflowRoot);
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Open Config', {
            userMessage: t('Failed to open config. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to open config: {0}', message));
        }
      }
    }
  );

  /**
   * workflow.focusTicketsView command - focuses tickets sidebar
   */
  const focusTicketsViewCmd = registerCommandSafe(
    'workflow.focusTicketsView',
    async () => {
      try {
        await executeFocusTicketsView();
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Focus Tickets View', {
            userMessage: t('Failed to focus tickets view. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to focus tickets view: {0}', message));
        }
      }
    }
  );

  /**
   * workflow.focusKanban command - focuses kanban panel
   */
  const focusKanbanCmd = registerCommandSafe(
    'workflow.focusKanban',
    async () => {
      try {
        await executeFocusKanban();
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Focus Kanban', {
            userMessage: t('Failed to focus kanban. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to focus kanban: {0}', message));
        }
      }
    }
  );

  /**
   * workflow.refreshAll command - refreshes all data
   */
  const refreshAllCmd = registerCommandSafe(
    'workflow.refreshAll',
    async () => {
      try {
        const refreshCallbacks = [
          () => ticketsProvider.refresh(),
          () => plansProvider.refresh(),
          () => reportsProvider.refresh(),
          () => pipelineProvider.refresh(),
          () => kanbanProviders.backlog.refresh(),
          () => kanbanProviders.ready.refresh(),
          () => kanbanProviders.inProgress.refresh(),
          () => kanbanProviders.blocked.refresh(),
          () => kanbanProviders.review.refresh(),
          () => kanbanProviders.done.refresh()
        ];
        await executeRefreshAll(workflowRoot, store, refreshCallbacks);
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Refresh All', {
            userMessage: t('Failed to refresh all. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to refresh all: {0}', message));
        }
      }
    }
  );

  /**
   * workflow.copyTicketId command - copies ticket ID to clipboard
   */
  const copyTicketIdCmd = registerCommandSafe(
    'workflow.copyTicketId',
    async (arg?: unknown) => {
      try {
        const ticketId = resolveTicketId(arg);
        await executeCopyTicketId(ticketId);
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Copy Ticket ID', {
            userMessage: t('Failed to copy ticket ID. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to copy ticket ID: {0}', message));
        }
      }
    }
  );

  /**
   * workflow.filterTicketsByPlan command - filter tickets by plan
   */
  registerCommandSafe(
    'workflow.filterTicketsByPlan',
    async () => {
      if (!workflowRoot) {
        vscode.window.showErrorMessage(t('Workflow root not available'));
        return;
      }
      try {
        await executeFilterTicketsByPlan(store, ticketsProvider, kanbanProviders);
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Filter Tickets By Plan', {
            userMessage: t('Failed to filter tickets. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to filter tickets: {0}', message));
        }
      }
    }
  );

  /**
   * workflow.clearTicketFilter command - clear ticket filter
   */
  const clearTicketFilterCmd = registerCommandSafe(
    'workflow.clearTicketFilter',
    async () => {
      if (!workflowRoot) {
        vscode.window.showErrorMessage(t('Workflow root not available'));
        return;
      }
      try {
        await executeClearTicketFilter(ticketsProvider, kanbanProviders);
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Clear Ticket Filter', {
            userMessage: t('Failed to clear filter. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to clear filter: {0}', message));
        }
      }
    }
  );

  /**
   * workflow.openHistoryLog command - opens log file from entry.logFile
   */
  const openHistoryLogCmd = registerCommandSafe(
    'workflow.openHistoryLog',
    async (arg?: unknown) => {
      const logFile = resolveLogFile(arg);
      if (!logFile) {
        vscode.window.showErrorMessage(t('No log file provided'));
        return;
      }
      try {
        const doc = await vscode.workspace.openTextDocument(logFile);
        await vscode.window.showTextDocument(doc);
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Open History Log', {
            userMessage: t('Failed to open log file. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to open log file: {0}', message));
        }
      }
    }
  );

  /**
   * workflow.openHistoryPlan command - opens plan from entry.planId
   */
  const openHistoryPlanCmd = registerCommandSafe(
    'workflow.openHistoryPlan',
    async (arg?: unknown) => {
      const planId = resolvePlanId(arg);
      if (!planId || !workflowRoot) {
        vscode.window.showErrorMessage(t('Plan ID not available or workflow not found'));
        return;
      }
      // Check both plans/current/ and plans/archive/ directories
      const currentPath = path.join(workflowRoot, 'plans', 'current', `${planId}.md`);
      const archivePath = path.join(workflowRoot, 'plans', 'archive', `${planId}.md`);
      let planPath: string;
      if (fs.existsSync(currentPath)) {
        planPath = currentPath;
      } else if (fs.existsSync(archivePath)) {
        planPath = archivePath;
      } else {
        vscode.window.showErrorMessage(t('Plan {0} not found', planId));
        return;
      }
      try {
        const doc = await vscode.workspace.openTextDocument(planPath);
        await vscode.window.showTextDocument(doc);
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Open History Plan', {
            userMessage: t('Failed to open plan. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to open plan: {0}', message));
        }
      }
    }
  );

  /**
   * workflow.openStageTicket command - opens ticket from item.ticket
   */
  const openStageTicketCmd = registerCommandSafe(
    'workflow.openStageTicket',
    async (arg?: unknown) => {
      const ticketId = resolveTicketId(arg);
      if (!ticketId || !workflowRoot) {
        vscode.window.showErrorMessage(t('Ticket ID not available or workflow not found'));
        return;
      }
      const ticket = store.getTicketById(ticketId);
      if (!ticket) {
        vscode.window.showErrorMessage(t('Ticket {0} not found', ticketId));
        return;
      }
      const ticketPath = path.join(
        workflowRoot,
        'tickets',
        ticket.status,
        `${ticketId}.md`
      );
      try {
        const doc = await vscode.workspace.openTextDocument(ticketPath);
        await vscode.window.showTextDocument(doc);
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Open Stage Ticket', {
            userMessage: t('Failed to open ticket. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to open ticket: {0}', message));
        }
      }
    }
  );

  /**
   * workflow.openStageLog command - opens log file with navigation to step section
   */
  const openStageLogCmd = registerCommandSafe(
    'workflow.openStageLog',
    async (arg?: unknown) => {
      const logFile = resolveLogFile(arg);
      if (!logFile) {
        vscode.window.showErrorMessage(t('No log file provided'));
        return;
      }
      try {
        const doc = await vscode.workspace.openTextDocument(logFile);
        const editor = await vscode.window.showTextDocument(doc);
        // Find stage section boundaries in the log file
        if (arg && typeof arg === 'object') {
          const item = arg as Record<string, unknown>;
          const stageName = typeof item.stage === 'string' ? item.stage : undefined;
          if (stageName) {
            const content = fs.readFileSync(logFile, 'utf-8');
            const lines = content.split('\n');
            const escapedStage = stageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const startPattern = new RegExp(`START stage="${escapedStage}"`);
            const nextStepPattern = /\[PipelineRunner\] Step \d+/;
            const nextStartPattern = /START stage="/;

            // Find the Nth occurrence matching the stageIndex
            const stageIndex = typeof item.logLineHint === 'number' ? item.logLineHint : 0;
            let occurrence = 0;
            let startLine = -1;
            let endLine = lines.length - 1;

            for (let i = 0; i < lines.length; i++) {
              if (startPattern.test(lines[i])) {
                if (occurrence === stageIndex) {
                  startLine = i;
                  break;
                }
                occurrence++;
              }
            }

            // Find end of section: next "Step N" or next START for a different stage
            if (startLine >= 0) {
              for (let i = startLine + 1; i < lines.length; i++) {
                if (nextStepPattern.test(lines[i]) || (nextStartPattern.test(lines[i]) && !startPattern.test(lines[i]))) {
                  endLine = i - 1;
                  break;
                }
              }

              // Select the entire stage section
              const from = new vscode.Position(startLine, 0);
              const to = new vscode.Position(endLine, lines[endLine].length);
              editor.selection = new vscode.Selection(from, to);
              editor.revealRange(new vscode.Range(from, to), vscode.TextEditorRevealType.InCenter);
            }
          }
        }
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Open Stage Log', {
            userMessage: t('Failed to open log file. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to open log file: {0}', message));
        }
      }
    }
  );

  /**
   * workflow.openStageReport command - opens report from item.reportPath
   */
  const openStageReportCmd = registerCommandSafe(
    'workflow.openStageReport',
    async (arg?: unknown) => {
      const reportPath = resolveReportPath(arg);
      if (!reportPath) {
        vscode.window.showErrorMessage(t('No report path provided'));
        return;
      }
      try {
        const doc = await vscode.workspace.openTextDocument(reportPath);
        await vscode.window.showTextDocument(doc);
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Open Stage Report', {
            userMessage: t('Failed to open report. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to open report: {0}', message));
        }
      }
    }
  );

  context.subscriptions.push(
    installCliCmd,
    initCmd,
    openTicketCmd,
    moveTicketCmd,
    moveTicketFromMenuCmd,
    moveTicketNextCmd,
    editTicketCmd,
    showDependenciesCmd,
    showTicketDependenciesCmd,
    refreshTicketsCmd,
    sortKanbanByPriorityCmd,
    sortKanbanByIdCmd,
    sortKanbanByTitleCmd,
    sortKanbanByDateCmd,
    toggleSortDirectionCmd,
    sortTicketsByPriorityCmd,
    sortTicketsByIdCmd,
    sortTicketsByTitleCmd,
    sortTicketsByDateCmd,
    gotoReviewSectionCmd,
    startPipelineCmd,
    stopPipelineCmd,
    showPipelineOutputCmd,
    clearPipelineHistoryCmd,
    statusBarClickCmd,
    newTicketCmd,
    newPlanCmd,
    showDependenciesCmdNew,
    showStatisticsCmd,
    openPipelineConfigCmd,
    openConfigCmd,
    focusTicketsViewCmd,
    focusKanbanCmd,
    refreshAllCmd,
    copyTicketIdCmd,
    clearTicketFilterCmd,
    openHistoryLogCmd,
    openHistoryPlanCmd,
    openStageTicketCmd,
    openStageLogCmd,
    openStageReportCmd,
    createPlanFromFileCmd,
    decomposePlanCmd,
    runPipelineForPlanCmd,
    archivePlanCmd,
    unarchivePlanCmd,
    notificationsManager,
    onLocaleChanged()
  );

  const activationTime = Date.now() - startTime;
  console.log(`Workflow AI extension activated in ${activationTime}ms`);
}

export function deactivate(): void {
  // Cleanup resources
}
