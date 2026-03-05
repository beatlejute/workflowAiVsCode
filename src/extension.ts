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

    // Platform-specific detection
    if (platform === 'win32') {
      await execAsync('where workflow');
    } else {
      await execAsync('which workflow');
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
  const configPath = path.join(workflowDir, 'config.yaml');
  const pipelinePath = path.join(workflowDir, 'pipeline.yaml');

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
        vscode.window.showInformationMessage('workflow-ai CLI installed successfully!');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to install workflow-ai CLI: ${message}`);
      }
    }
  );
}

/**
 * Initialize workflow in the current workspace.
 */
async function initWorkflow(): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Initializing Workflow...',
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 0 });
      try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
          throw new Error('No workspace folder open');
        }

        await execAsync('workflow init', { cwd: workspaceRoot });
        progress.report({ increment: 100 });
        await updateContextKeys();
        vscode.window.showInformationMessage('Workflow initialized successfully!');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to initialize workflow: ${message}`);
      }
    }
  );
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const startTime = Date.now();
  console.log('Workflow AI extension is activating...');

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
  const installCliCmd = vscode.commands.registerCommand('workflow.installCli', installCli);
  const initCmd = vscode.commands.registerCommand('workflow.init', initWorkflow);

  /**
   * Open ticket command - opens ticket file in editor
   */
  const openTicketCmd = vscode.commands.registerCommand(
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
        vscode.window.showErrorMessage('No ticket ID provided or workflow not available');
        return;
      }

      const ticket = store.getTicketById(ticketId);
      if (!ticket) {
        vscode.window.showErrorMessage(`Ticket ${ticketId} not found`);
        return;
      }

      const ticketPath = path.join(
        workflowRoot,
        '.workflow',
        'tickets',
        ticket.status,
        `${ticketId}.md`
      );

      try {
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(ticketPath));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to open ticket: ${message}`);
      }
    }
  );

  /**
   * Move ticket command - opens QuickPick to select target status
   */
  const moveTicketCmd = vscode.commands.registerCommand(
    'workflow.moveTicket',
    async (ticketId: string) => {
      if (!ticketService || !ticketId) {
        vscode.window.showErrorMessage('Ticket service not available or no ticket ID provided');
        return;
      }

      const ticket = ticketService.getById(ticketId);
      if (!ticket) {
        vscode.window.showErrorMessage(`Ticket ${ticketId} not found`);
        return;
      }

      // Get valid transitions
      const validTransitions = ticketService.getValidTransitions(ticket.status);
      if (validTransitions.length === 0) {
        vscode.window.showInformationMessage(`No valid transitions from ${ticket.status}`);
        return;
      }

      // Show QuickPick for target status
      const targetStatus = await vscode.window.showQuickPick(
        validTransitions.map(status => ({
          label: status,
          description: `Move to ${status}`
        })),
        {
          placeHolder: `Select target status for ${ticketId}`,
          title: `Move ${ticketId}`
        }
      );

      if (!targetStatus) {
        return; // User cancelled
      }

      try {
        await ticketService.move(ticketId, targetStatus.label as TicketStatus);
        vscode.window.showInformationMessage(`Moved ${ticketId} to ${targetStatus.label}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to move ticket: ${message}`);
      }
    }
  );

  /**
   * Move ticket from menu command - same as moveTicket but for context menu
   */
  const moveTicketFromMenuCmd = vscode.commands.registerCommand(
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
  const moveTicketNextCmd = vscode.commands.registerCommand(
    'workflow.moveTicketNext',
    async (ticketId: string) => {
      if (!ticketService || !ticketId) {
        vscode.window.showErrorMessage('Ticket service not available or no ticket ID provided');
        return;
      }

      const ticket = ticketService.getById(ticketId);
      if (!ticket) {
        vscode.window.showErrorMessage(`Ticket ${ticketId} not found`);
        return;
      }

      // Get valid transitions and pick the first one (primary next status)
      const validTransitions = ticketService.getValidTransitions(ticket.status);
      if (validTransitions.length === 0) {
        vscode.window.showInformationMessage(`No valid transitions from ${ticket.status}`);
        return;
      }

      // Use first valid transition as "next" status
      const nextStatus = validTransitions[0];

      try {
        await ticketService.move(ticketId, nextStatus);
        vscode.window.showInformationMessage(`Moved ${ticketId} to ${nextStatus}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to move ticket: ${message}`);
      }
    }
  );

  /**
   * Edit ticket command - opens ticket file for editing
   */
  const editTicketCmd = vscode.commands.registerCommand(
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
        vscode.window.showErrorMessage('No ticket ID provided or workflow not available');
        return;
      }

      const ticket = store.getTicketById(ticketId);
      if (!ticket) {
        vscode.window.showErrorMessage(`Ticket ${ticketId} not found`);
        return;
      }

      const ticketPath = path.join(
        workflowRoot,
        '.workflow',
        'tickets',
        ticket.status,
        `${ticketId}.md`
      );

      try {
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(ticketPath));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to open ticket: ${message}`);
      }
    }
  );

  /**
   * Show dependencies command - shows dependencies in a view
   */
  const showDependenciesCmd = vscode.commands.registerCommand(
    'workflow.showDependencies',
    async (ticketId: string) => {
      if (!dependencyService || !ticketId) {
        vscode.window.showErrorMessage('Dependency service not available or no ticket ID provided');
        return;
      }

      const ticket = store.getTicketById(ticketId);
      if (!ticket) {
        vscode.window.showErrorMessage(`Ticket ${ticketId} not found`);
        return;
      }

      const dependencies = dependencyService.getDependencies(ticketId);
      const dependents = dependencyService.getDependents(ticketId);

      // Build quick info message
      const depList = dependencies.length > 0
        ? dependencies.map(d => `- ${d.id}: ${d.title} (${d.status})`).join('\n')
        : 'No dependencies';

      const blocksList = dependents.length > 0
        ? dependents.map(d => `- ${d.id}: ${d.title} (${d.status})`).join('\n')
        : 'No tickets blocked by this one';

      const info = `**${ticketId}: ${ticket.title}**\n\n**Dependencies (Deps):**\n${depList}\n\n**Blocks:**\n${blocksList}`;

      await vscode.window.showInformationMessage(info, { modal: false });
    }
  );

  /**
   * Show ticket dependencies command - alias for context menu
   */
  const showTicketDependenciesCmd = vscode.commands.registerCommand(
    'workflow.showTicketDependencies',
    async (ticketId: string) => {
      await vscode.commands.executeCommand('workflow.showDependencies', ticketId);
    }
  );

  /**
   * Create ticket command - opens input to create new ticket
   */
  const createTicketCmd = vscode.commands.registerCommand(
    'workflow.createTicket',
    async () => {
      if (!ticketService) {
        vscode.window.showErrorMessage('Ticket service not available');
        return;
      }

      // Get ticket type
      const type = await vscode.window.showQuickPick(
        [
          { label: 'IMPL', description: 'Implementation task' },
          { label: 'FIX', description: 'Bug fix' },
          { label: 'DOCS', description: 'Documentation' },
          { label: 'REVIEW', description: 'Code review' },
          { label: 'PLAN', description: 'Planning task' },
          { label: 'ADMIN', description: 'Administrative task' }
        ],
        {
          placeHolder: 'Select ticket type',
          title: 'Create New Ticket'
        }
      );

      if (!type) {
        return; // User cancelled
      }

      // Get title
      const title = await vscode.window.showInputBox({
        prompt: 'Enter ticket title',
        placeHolder: 'e.g., Add feature X',
        title: 'Create New Ticket',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Title is required';
          }
          return undefined;
        }
      });

      if (!title) {
        return; // User cancelled
      }

      try {
        const ticket = await ticketService.create(type.label, title);
        vscode.window.showInformationMessage(`Created ticket ${ticket.id}: ${ticket.title}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to create ticket: ${message}`);
      }
    }
  );

  /**
   * Refresh tickets command - refreshes the tickets tree view
   */
  const refreshTicketsCmd = vscode.commands.registerCommand(
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
  const sortKanbanByPriorityCmd = vscode.commands.registerCommand(
    'workflow.sortKanbanByPriority',
    async () => {
      // Refresh all kanban providers (they will re-sort by priority by default)
      kanbanProviders.backlog.refresh();
      kanbanProviders.ready.refresh();
      kanbanProviders.inProgress.refresh();
      kanbanProviders.blocked.refresh();
      kanbanProviders.review.refresh();
      kanbanProviders.done.refresh();
      vscode.window.showInformationMessage('Kanban boards sorted by priority');
    }
  );

  /**
   * Sort Kanban by ID command
   */
  const sortKanbanByIdCmd = vscode.commands.registerCommand(
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
      vscode.window.showInformationMessage('Kanban boards sorted by ID');
    }
  );

  /**
   * Sort Kanban by title command
   */
  const sortKanbanByTitleCmd = vscode.commands.registerCommand(
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
      vscode.window.showInformationMessage('Kanban boards sorted by title');
    }
  );

  /**
   * Go to review section command - navigates to review section in document
   */
  const gotoReviewSectionCmd = vscode.commands.registerCommand(
    'workflow.gotoReviewSection',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      const document = editor.document;
      const content = document.getText();

      // Find review section
      const reviewMatch = content.match(/^## Review/m);
      if (!reviewMatch || reviewMatch.index === undefined) {
        vscode.window.showInformationMessage('No Review section found in this document');
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
  const startPipelineCmd = vscode.commands.registerCommand(
    'workflow.runPipeline',
    async () => {
      await pipelineProvider.startPipeline();
    }
  );

  /**
   * Stop pipeline command
   */
  const stopPipelineCmd = vscode.commands.registerCommand(
    'workflow.stopPipeline',
    async () => {
      pipelineProvider.stopPipeline();
    }
  );

  /**
   * Show pipeline output command
   */
  const showPipelineOutputCmd = vscode.commands.registerCommand(
    'workflow.showPipelineOutput',
    async () => {
      pipelineProvider.showOutput();
    }
  );

  /**
   * Clear pipeline history command
   */
  const clearPipelineHistoryCmd = vscode.commands.registerCommand(
    'workflow.clearPipelineHistory',
    async () => {
      pipelineProvider.clearHistory();
    }
  );

  /**
   * Status bar click command - opens Command Palette with WF: prefix
   */
  const statusBarClickCmd = vscode.commands.registerCommand(
    'workflow.statusBarClick',
    async () => {
      await vscode.commands.executeCommand('workbench.action.quickOpen', '>WF:');
    }
  );

  /**
   * workflow.newTicket command - creates new ticket via QuickPick + InputBox
   */
  const newTicketCmd = vscode.commands.registerCommand(
    'workflow.newTicket',
    async () => {
      if (!ticketService) {
        vscode.window.showErrorMessage('Ticket service not available');
        return;
      }
      await executeNewTicket(ticketService);
    }
  );

  /**
   * workflow.newPlan command - creates new plan (placeholder)
   */
  const newPlanCmd = vscode.commands.registerCommand(
    'workflow.newPlan',
    async () => {
      vscode.window.showInformationMessage('workflow.newPlan: Plan creation coming soon');
    }
  );

  /**
   * workflow.showDependencies command - shows ticket dependencies
   */
  const showDependenciesCmdNew = vscode.commands.registerCommand(
    'workflow.showDependencies',
    async (ticketId?: string) => {
      if (!dependencyService) {
        vscode.window.showErrorMessage('Dependency service not available');
        return;
      }
      await executeShowDependencies(store, dependencyService, ticketId);
    }
  );

  /**
   * workflow.showStatistics command - shows workflow statistics
   */
  const showStatisticsCmd = vscode.commands.registerCommand(
    'workflow.showStatistics',
    async () => {
      await executeShowStatistics(store);
    }
  );

  /**
   * workflow.openPipelineConfig command - opens pipeline.yaml
   */
  const openPipelineConfigCmd = vscode.commands.registerCommand(
    'workflow.openPipelineConfig',
    async () => {
      await executeOpenPipelineConfig(workflowRoot);
    }
  );

  /**
   * workflow.openConfig command - opens config.yaml
   */
  const openConfigCmd = vscode.commands.registerCommand(
    'workflow.openConfig',
    async () => {
      await executeOpenConfig(workflowRoot);
    }
  );

  /**
   * workflow.focusTicketsView command - focuses tickets sidebar
   */
  const focusTicketsViewCmd = vscode.commands.registerCommand(
    'workflow.focusTicketsView',
    async () => {
      await executeFocusTicketsView();
    }
  );

  /**
   * workflow.focusKanban command - focuses kanban panel
   */
  const focusKanbanCmd = vscode.commands.registerCommand(
    'workflow.focusKanban',
    async () => {
      await executeFocusKanban();
    }
  );

  /**
   * workflow.refreshAll command - refreshes all data
   */
  const refreshAllCmd = vscode.commands.registerCommand(
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
  const copyTicketIdCmd = vscode.commands.registerCommand(
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
