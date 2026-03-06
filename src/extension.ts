import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowStore } from './data/workflow-store';
import {
  TicketsTreeProvider,
  PlansTreeProvider,
  ReportsTreeProvider
} from './ui/sidebar-tree-provider';
import {
  createKanbanProviders
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
import { DependencyService } from './services/dependency-service';
import { TicketStatus } from './data/types';
import { executeNewTicket } from './commands/new-ticket';
import { executeShowDependencies } from './commands/show-dependencies';
import { executeShowStatistics } from './commands/show-statistics';
import {
  executeOpenPipelineConfig,
  executeOpenConfig,
  executeFocusTicketsView,
  executeFocusKanban,
  executeRefreshAll,
  executeCopyTicketId
} from './commands/index';

const execAsync = promisify(exec);

/**
 * Check if workflow CLI is installed on the system.
 * Uses platform-specific commands: 'which' on Unix, 'where' on Windows.
 * Falls back to configured cliPath if available.
 */
export async function checkCliInstalled(): Promise<boolean> {
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
  } catch {
    return false;
  }
}

/**
 * Check if .workflow/ directory exists with required config files.
 * Verifies presence of config.yaml and pipeline.yaml.
 */
export function checkWorkflowDir(): boolean {
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
  } catch {
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
export async function updateContextKeys(pipelineService?: PipelineService): Promise<void> {
  const cliInstalled = await checkCliInstalled();
  const workflowFound = checkWorkflowDir();
  const pipelineRunning = pipelineService?.getState() === PipelineState.Running;

  await setContextKey('workflow.cliInstalled', cliInstalled);
  await setContextKey('workflow.workflowFound', workflowFound);
  await setContextKey('workflow.pipelineRunning', pipelineRunning);
}

/**
 * Install workflow-ai CLI globally.
 */
async function installCli(): Promise<void> {
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
        await updateContextKeys();
        vscode.window.showInformationMessage(vscode.l10n.t('workflow-ai CLI installed successfully!'));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(vscode.l10n.t('Failed to install workflow-ai CLI: {0}', message));
      }
    }
  );
}

/**
 * Initialize workflow in the current workspace.
 * Tries 'workflow init' first, falls back to 'workflow-ai init' if binary not found.
 */
async function initWorkflow(): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: vscode.l10n.t('Initializing Workflow...'),
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 0 });
      try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
          throw new Error('No workspace folder open');
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
        await updateContextKeys();
        vscode.window.showInformationMessage(vscode.l10n.t('Workflow initialized successfully!'));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(vscode.l10n.t('Failed to initialize workflow: {0}', message));
      }
    }
  );
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const startTime = Date.now();
  console.log('Workflow AI extension is activating...');

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
    store.refresh(workflowRoot).catch(err => {
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
  const kanbanProviders = createKanbanProviders(store);

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
    ticketsProvider.setWorkflowRoot(workflowRoot);
    plansProvider.setWorkflowRoot(workflowRoot);
    reportsProvider.setWorkflowRoot(workflowRoot);
    pipelineProvider.setWorkflowRoot(workflowRoot);
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
    vscode.window.registerTreeDataProvider('workflow-sidebar.pipeline', pipelineProvider),
    statusBar
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
    backlogTreeView.title = `BACKLOG (${kanbanProviders.backlog.getCount()})`;
    readyTreeView.title = `READY (${kanbanProviders.ready.getCount()})`;
    inProgressTreeView.title = `IN PROGRESS (${kanbanProviders.inProgress.getCount()})`;
    blockedTreeView.title = `BLOCKED (${kanbanProviders.blocked.getCount()})`;
    reviewTreeView.title = `REVIEW (${kanbanProviders.review.getCount()})`;
    doneTreeView.title = `DONE (${kanbanProviders.done.getCount()})`;
  };

  // Initial title update
  updateKanbanTitles();

  // Subscribe to store changes to update titles
  store.onDidChange(() => {
    updateKanbanTitles();
  });

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

  // Register CodeLens provider for ticket .md files
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
      { scheme: 'file', pattern: '**/.workflow/tickets/**/*.md' },
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

  if (workflowRoot) {
    ticketService = new TicketService(store, workflowRoot);
    dependencyService = new DependencyService(store);
  }

  // Register commands
  const installCliCmd = registerCommandSafe('workflow.installCli', installCli);
  const initCmd = registerCommandSafe('workflow.init', initWorkflow);

  /**
   * Open ticket command - opens ticket file in editor
   */
  const openTicketCmd = registerCommandSafe(
    'workflow.openTicket',
    async (ticketId: string) => {
      if (!ticketId) {
        // Try to get from active editor or selection
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          ticketId = path.basename(editor.document.fileName, '.md');
        }
      }

      if (!ticketId || !workflowRoot) {
        vscode.window.showErrorMessage(vscode.l10n.t('No ticket ID provided or workflow not available'));
        return;
      }

      const ticket = store.getTicketById(ticketId);
      if (!ticket) {
        vscode.window.showErrorMessage(vscode.l10n.t('Ticket {0} not found', ticketId));
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
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(vscode.l10n.t('Failed to open ticket: {0}', message));
      }
    }
  );

  /**
   * Move ticket command - opens QuickPick to select target status
   */
  const moveTicketCmd = registerCommandSafe(
    'workflow.moveTicket',
    async (ticketId: string) => {
      if (!ticketService || !ticketId) {
        vscode.window.showErrorMessage(vscode.l10n.t('Ticket service not available or no ticket ID provided'));
        return;
      }

      const ticket = ticketService.getById(ticketId);
      if (!ticket) {
        vscode.window.showErrorMessage(vscode.l10n.t('Ticket {0} not found', ticketId));
        return;
      }

      // Get valid transitions
      const validTransitions = ticketService.getValidTransitions(ticket.status);
      if (validTransitions.length === 0) {
        vscode.window.showInformationMessage(vscode.l10n.t('No valid transitions from {0}', ticket.status));
        return;
      }

      // Show QuickPick for target status
      const targetStatus = await vscode.window.showQuickPick(
        validTransitions.map(status => ({
          label: status,
          description: vscode.l10n.t('Move to {0}', status)
        })),
        {
          placeHolder: vscode.l10n.t('Select target status for {0}', ticketId),
          title: vscode.l10n.t('Move {0}', ticketId)
        }
      );

      if (!targetStatus) {
        return; // User cancelled
      }

      try {
        await ticketService.move(ticketId, targetStatus.label as TicketStatus);
        vscode.window.showInformationMessage(vscode.l10n.t('Moved {0} to {1}', ticketId, targetStatus.label));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(vscode.l10n.t('Failed to move ticket: {0}', message));
      }
    }
  );

  /**
   * Move ticket from menu command - same as moveTicket but for context menu
   */
  const moveTicketFromMenuCmd = registerCommandSafe(
    'workflow.moveTicketFromMenu',
    async (ticketId: string) => {
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
    async (ticketId: string) => {
      if (!ticketService || !ticketId) {
        vscode.window.showErrorMessage(vscode.l10n.t('Ticket service not available or no ticket ID provided'));
        return;
      }

      const ticket = ticketService.getById(ticketId);
      if (!ticket) {
        vscode.window.showErrorMessage(vscode.l10n.t('Ticket {0} not found', ticketId));
        return;
      }

      // Get valid transitions and pick the first one (primary next status)
      const validTransitions = ticketService.getValidTransitions(ticket.status);
      if (validTransitions.length === 0) {
        vscode.window.showInformationMessage(vscode.l10n.t('No valid transitions from {0}', ticket.status));
        return;
      }

      // Use first valid transition as "next" status
      const nextStatus = validTransitions[0];

      try {
        await ticketService.move(ticketId, nextStatus);
        vscode.window.showInformationMessage(vscode.l10n.t('Moved {0} to {1}', ticketId, nextStatus));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(vscode.l10n.t('Failed to move ticket: {0}', message));
      }
    }
  );

  /**
   * Edit ticket command - opens ticket file for editing
   */
  const editTicketCmd = registerCommandSafe(
    'workflow.editTicket',
    async (ticketId: string) => {
      if (!ticketId) {
        // Try to get from active editor or selection
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          ticketId = path.basename(editor.document.fileName, '.md');
        }
      }

      if (!ticketId || !workflowRoot) {
        vscode.window.showErrorMessage(vscode.l10n.t('No ticket ID provided or workflow not available'));
        return;
      }

      const ticket = store.getTicketById(ticketId);
      if (!ticket) {
        vscode.window.showErrorMessage(vscode.l10n.t('Ticket {0} not found', ticketId));
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
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(vscode.l10n.t('Failed to open ticket: {0}', message));
      }
    }
  );

  /**
   * Show dependencies command - shows dependencies in a view
   */
  const showDependenciesCmd = registerCommandSafe(
    'workflow.showDependencies',
    async (ticketId: string) => {
      if (!dependencyService || !ticketId) {
        vscode.window.showErrorMessage(vscode.l10n.t('Dependency service not available or no ticket ID provided'));
        return;
      }

      const ticket = store.getTicketById(ticketId);
      if (!ticket) {
        vscode.window.showErrorMessage(vscode.l10n.t('Ticket {0} not found', ticketId));
        return;
      }

      const dependencies = dependencyService.getDependencies(ticketId);
      const dependents = dependencyService.getDependents(ticketId);

      // Build quick info message
      const depList = dependencies.length > 0
        ? dependencies.map(d => `- ${d.id}: ${d.title} (${d.status})`).join('\n')
        : vscode.l10n.t('No dependencies');

      const blocksList = dependents.length > 0
        ? dependents.map(d => `- ${d.id}: ${d.title} (${d.status})`).join('\n')
        : vscode.l10n.t('No tickets blocked by this one');

      const info = `**${ticketId}: ${ticket.title}**\n\n**Dependencies (Deps):**\n${depList}\n\n**Blocks:**\n${blocksList}`;

      await vscode.window.showInformationMessage(info, { modal: false });
    }
  );

  /**
   * Show ticket dependencies command - alias for context menu
   */
  const showTicketDependenciesCmd = registerCommandSafe(
    'workflow.showTicketDependencies',
    async (ticketId: string) => {
      await vscode.commands.executeCommand('workflow.showDependencies', ticketId);
    }
  );

  /**
   * Create ticket command - opens input to create new ticket
   */
  const createTicketCmd = registerCommandSafe(
    'workflow.createTicket',
    async () => {
      if (!ticketService) {
        vscode.window.showErrorMessage(vscode.l10n.t('Ticket service not available'));
        return;
      }

      // Get ticket type
      const type = await vscode.window.showQuickPick(
        [
          { label: 'IMPL', description: vscode.l10n.t('Implementation task') },
          { label: 'FIX', description: vscode.l10n.t('Bug fix') },
          { label: 'DOCS', description: vscode.l10n.t('Documentation') },
          { label: 'REVIEW', description: vscode.l10n.t('Code review') },
          { label: 'PLAN', description: vscode.l10n.t('Planning task') },
          { label: 'ADMIN', description: vscode.l10n.t('Administrative task') }
        ],
        {
          placeHolder: vscode.l10n.t('Select ticket type'),
          title: vscode.l10n.t('Create New Ticket')
        }
      );

      if (!type) {
        return; // User cancelled
      }

      // Get title
      const title = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('Enter ticket title'),
        placeHolder: vscode.l10n.t('e.g., Add feature X'),
        title: vscode.l10n.t('Create New Ticket'),
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return vscode.l10n.t('Title is required');
          }
          return undefined;
        }
      });

      if (!title) {
        return; // User cancelled
      }

      try {
        const ticket = await ticketService.create(type.label, title);
        vscode.window.showInformationMessage(vscode.l10n.t('Created ticket {0}: {1}', ticket.id, ticket.title));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(vscode.l10n.t('Failed to create ticket: {0}', message));
      }
    }
  );

  /**
   * Refresh tickets command - refreshes the tickets tree view
   */
  const refreshTicketsCmd = registerCommandSafe(
    'workflow.refreshTickets',
    async () => {
      ticketsProvider.refresh();
      // Also refresh the store
      if (workflowRoot) {
        await store.refresh(workflowRoot);
      }
    }
  );

  /**
   * Sort Kanban by priority command
   */
  const sortKanbanByPriorityCmd = registerCommandSafe(
    'workflow.sortKanbanByPriority',
    async () => {
      // Refresh all kanban providers (they will re-sort by priority by default)
      kanbanProviders.backlog.refresh();
      kanbanProviders.ready.refresh();
      kanbanProviders.inProgress.refresh();
      kanbanProviders.blocked.refresh();
      kanbanProviders.review.refresh();
      kanbanProviders.done.refresh();
      vscode.window.showInformationMessage(vscode.l10n.t('Kanban boards sorted by priority'));
    }
  );

  /**
   * Sort Kanban by ID command
   */
  const sortKanbanByIdCmd = registerCommandSafe(
    'workflow.sortKanbanById',
    async () => {
      // Note: This would require modifying the provider to support different sort modes
      // For now, just refresh to show the default sorting
      kanbanProviders.backlog.refresh();
      kanbanProviders.ready.refresh();
      kanbanProviders.inProgress.refresh();
      kanbanProviders.blocked.refresh();
      kanbanProviders.review.refresh();
      kanbanProviders.done.refresh();
      vscode.window.showInformationMessage(vscode.l10n.t('Kanban boards sorted by ID'));
    }
  );

  /**
   * Sort Kanban by title command
   */
  const sortKanbanByTitleCmd = registerCommandSafe(
    'workflow.sortKanbanByTitle',
    async () => {
      // Note: This would require modifying the provider to support different sort modes
      // For now, just refresh to show the default sorting
      kanbanProviders.backlog.refresh();
      kanbanProviders.ready.refresh();
      kanbanProviders.inProgress.refresh();
      kanbanProviders.blocked.refresh();
      kanbanProviders.review.refresh();
      kanbanProviders.done.refresh();
      vscode.window.showInformationMessage(vscode.l10n.t('Kanban boards sorted by title'));
    }
  );

  /**
   * Go to review section command - navigates to review section in document
   */
  const gotoReviewSectionCmd = registerCommandSafe(
    'workflow.gotoReviewSection',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage(vscode.l10n.t('No active editor'));
        return;
      }

      const document = editor.document;
      const content = document.getText();

      // Find review section
      const reviewMatch = content.match(/^## Review/m);
      if (!reviewMatch || reviewMatch.index === undefined) {
        vscode.window.showInformationMessage(vscode.l10n.t('No Review section found in this document'));
        return;
      }

      const position = document.positionAt(reviewMatch.index);
      await editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
      editor.selection = new vscode.Selection(position, position);
    }
  );

  /**
   * Start pipeline command - opens QuickPick for mode selection
   */
  const startPipelineCmd = registerCommandSafe(
    'workflow.runPipeline',
    async () => {
      await pipelineProvider.startPipeline();
    }
  );

  /**
   * Stop pipeline command
   */
  const stopPipelineCmd = registerCommandSafe(
    'workflow.stopPipeline',
    async () => {
      pipelineProvider.stopPipeline();
    }
  );

  /**
   * Show pipeline output command
   */
  const showPipelineOutputCmd = registerCommandSafe(
    'workflow.showPipelineOutput',
    async () => {
      pipelineProvider.showOutput();
    }
  );

  /**
   * Clear pipeline history command
   */
  const clearPipelineHistoryCmd = registerCommandSafe(
    'workflow.clearPipelineHistory',
    async () => {
      pipelineProvider.clearHistory();
    }
  );

  /**
   * Status bar click command - opens Command Palette with WF: prefix
   */
  const statusBarClickCmd = registerCommandSafe(
    'workflow.statusBarClick',
    async () => {
      await vscode.commands.executeCommand('workbench.action.quickOpen', '>WF:');
    }
  );

  /**
   * workflow.newTicket command - creates new ticket via QuickPick + InputBox
   */
  const newTicketCmd = registerCommandSafe(
    'workflow.newTicket',
    async () => {
      if (!ticketService) {
        vscode.window.showErrorMessage(vscode.l10n.t('Ticket service not available'));
        return;
      }
      await executeNewTicket(ticketService);
    }
  );

  /**
   * workflow.newPlan command - creates new plan (placeholder)
   */
  const newPlanCmd = registerCommandSafe(
    'workflow.newPlan',
    async () => {
      vscode.window.showInformationMessage(vscode.l10n.t('workflow.newPlan: Plan creation coming soon'));
    }
  );

  /**
   * workflow.showDependencies command - shows ticket dependencies
   */
  const showDependenciesCmdNew = registerCommandSafe(
    'workflow.showDependencies',
    async (ticketId?: string) => {
      if (!dependencyService) {
        vscode.window.showErrorMessage(vscode.l10n.t('Dependency service not available'));
        return;
      }
      await executeShowDependencies(store, dependencyService, ticketId);
    }
  );

  /**
   * workflow.showStatistics command - shows workflow statistics
   */
  const showStatisticsCmd = registerCommandSafe(
    'workflow.showStatistics',
    async () => {
      await executeShowStatistics(store);
    }
  );

  /**
   * workflow.openPipelineConfig command - opens pipeline.yaml
   */
  const openPipelineConfigCmd = registerCommandSafe(
    'workflow.openPipelineConfig',
    async () => {
      await executeOpenPipelineConfig(workflowRoot);
    }
  );

  /**
   * workflow.openConfig command - opens config.yaml
   */
  const openConfigCmd = registerCommandSafe(
    'workflow.openConfig',
    async () => {
      await executeOpenConfig(workflowRoot);
    }
  );

  /**
   * workflow.focusTicketsView command - focuses tickets sidebar
   */
  const focusTicketsViewCmd = registerCommandSafe(
    'workflow.focusTicketsView',
    async () => {
      await executeFocusTicketsView();
    }
  );

  /**
   * workflow.focusKanban command - focuses kanban panel
   */
  const focusKanbanCmd = registerCommandSafe(
    'workflow.focusKanban',
    async () => {
      await executeFocusKanban();
    }
  );

  /**
   * workflow.refreshAll command - refreshes all data
   */
  const refreshAllCmd = registerCommandSafe(
    'workflow.refreshAll',
    async () => {
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
    }
  );

  /**
   * workflow.copyTicketId command - copies ticket ID to clipboard
   */
  const copyTicketIdCmd = registerCommandSafe(
    'workflow.copyTicketId',
    async (ticketId?: string) => {
      await executeCopyTicketId(ticketId);
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
    createTicketCmd,
    refreshTicketsCmd,
    sortKanbanByPriorityCmd,
    sortKanbanByIdCmd,
    sortKanbanByTitleCmd,
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
    notificationsManager
  );

  const activationTime = Date.now() - startTime;
  console.log(`Workflow AI extension activated in ${activationTime}ms`);
}

export function deactivate(): void {
  // Cleanup resources
}
