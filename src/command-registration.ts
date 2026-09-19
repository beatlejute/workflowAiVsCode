import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import { safeLoad, safeDump } from './utils/yaml-utils';
import { parse as parseFrontmatter } from './data/frontmatter-parser';
import {
  TicketsTreeProvider,
  PlansTreeProvider,
  SkillsTreeProvider,
  LogsTreeProvider
} from './ui/sidebar-tree-provider';
import {
  createKanbanProviders,
  KanbanSortMode
} from './ui/kanban-tree-provider';
import { PipelineTreeProvider } from './ui/pipeline-tree-provider';
import { PipelineService, PipelineState } from './services/pipeline-service';
import { TicketService } from './services/ticket-service';
import { DependencyService } from './services/dependency-service';
import { WorkflowStore } from './data/workflow-store';
import { PlanService } from './services/plan-service';

import { executeNewTicket } from './commands/new-ticket';
import { executeNewPlan } from './commands/new-plan';
import { executeShowStatistics } from './commands/show-statistics';
import { executeCreatePlanFromFile } from './commands/create-plan-from-file';
import { executeTogglePlanTemplate } from './commands/toggle-plan-template';
import { executeMoveTicket } from './commands/move-ticket';
import {
  executeFilterTicketsByPlan,
  executeClearTicketFilter,
  executeOpenConfig,
  executeOpenPipelineConfig,
  executeFocusTicketsView,
  executeFocusKanban,
  executeRefreshAll,
  executeCopyTicketId
} from './commands/index';
import { onLocaleChanged, t } from './i18n';
import { initializeErrorHandler, withErrorHandling } from './error-handler';
import { getTicketPath, getPlanPath, getPipelineConfigPath } from './utils/path-utils';
import { CommandRegistry } from './command-registry';
import {
  resolveTicketId,
  resolvePlanId,
  resolveLogFile,
  resolveReportPath,
  installCli,
  initWorkflow
} from './utils/extension-helpers';

let workspaceRoot: string | undefined;

export function registerCommands(
  context: vscode.ExtensionContext,
  registry: CommandRegistry,
  store: WorkflowStore,
  ticketService: TicketService | undefined,
  planService: PlanService | undefined,
  dependencyService: DependencyService | undefined,
  pipelineService: PipelineService,
  pipelineProvider: PipelineTreeProvider,
  ticketsProvider: TicketsTreeProvider,
  plansProvider: PlansTreeProvider,
  skillsProvider: SkillsTreeProvider,
  logsProvider: LogsTreeProvider,
  kanbanProviders: ReturnType<typeof createKanbanProviders>,
  errorHandler: ReturnType<typeof initializeErrorHandler>
): void {
  registry.register('workflow.installCli', () => installCli(errorHandler));
  registry.register('workflow.init', () => initWorkflow(errorHandler));

  registry.register(
    'workflow.focusPipelineStage',
    async (...args: unknown[]) => {
      const stageId = args[0] as string;
      if (!workspaceRoot || !stageId) {
        vscode.window.showErrorMessage(t('Workflow root not available'));
        return;
      }

      const pipelinePath = getPipelineConfigPath(workspaceRoot);

      try {
        const doc = await vscode.workspace.openTextDocument(pipelinePath);
        const editor = await vscode.window.showTextDocument(doc);

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

  registry.register(
    'workflow.openTicket',
    async (arg: unknown) => {
      let ticketId = resolveTicketId(arg);
      if (!ticketId) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          ticketId = path.basename(editor.document.fileName, '.md');
        }
      }

      if (!ticketId || !workspaceRoot) {
        vscode.window.showErrorMessage(t('No ticket ID provided or workflow not available'));
        return;
      }

      const ticket = store.getTicketById(ticketId);
      if (!ticket) {
        vscode.window.showErrorMessage(t('Ticket {0} not found', ticketId));
        return;
      }

      const ticketPath = getTicketPath(workspaceRoot, ticket.status, ticketId);

      await withErrorHandling(
        async () => vscode.commands.executeCommand('vscode.open', vscode.Uri.file(ticketPath)),
        (_error) => {
          vscode.window.showErrorMessage(t('Failed to open ticket. Check Output channel for details.'));
        }
      );
    }
  );

  registry.register(
    'workflow.moveTicket',
    async (arg: unknown) => {
      if (!ticketService) {
        vscode.window.showErrorMessage(t('Ticket service not available'));
        return;
      }
      await executeMoveTicket(ticketService, arg);
    }
  );

  registry.register(
    'workflow.moveTicketFromMenu',
    async (arg: unknown) => {
      const ticketId = resolveTicketId(arg);
      await vscode.commands.executeCommand('workflow.moveTicket', ticketId);
    }
  );

  registry.register(
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

      const validTransitions = ticketService.getValidTransitions(ticket.status);
      if (validTransitions.length === 0) {
        vscode.window.showInformationMessage(t('No valid transitions from {0}', ticket.status));
        return;
      }

      const nextStatus = validTransitions[0];

      const result = await withErrorHandling(
        async () => {
          await ticketService.move(ticketId, nextStatus);
          return true;
        },
        (_error) => {
          vscode.window.showErrorMessage(t('Failed to move ticket. Check Output channel for details.'));
        }
      );

      if (result) {
        vscode.window.showInformationMessage(t('Moved {0} to {1}', ticketId, nextStatus));
      }
    }
  );

  registry.register(
    'workflow.editTicket',
    async (arg: unknown) => {
      let ticketId = resolveTicketId(arg);
      if (!ticketId) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          ticketId = path.basename(editor.document.fileName, '.md');
        }
      }

      if (!ticketId || !workspaceRoot) {
        vscode.window.showErrorMessage(t('No ticket ID provided or workflow not available'));
        return;
      }

      const ticket = store.getTicketById(ticketId);
      if (!ticket) {
        vscode.window.showErrorMessage(t('Ticket {0} not found', ticketId));
        return;
      }

      const ticketPath = getTicketPath(workspaceRoot, ticket.status, ticketId);

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

  registry.register(
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

  registry.register(
    'workflow.showTicketDependencies',
    async (arg: unknown) => {
      const ticketId = resolveTicketId(arg);
      await vscode.commands.executeCommand('workflow.showDependencies', ticketId);
    }
  );

  registry.register(
    'workflow.refreshTickets',
    async () => {
      try {
        ticketsProvider.refresh();
        if (workspaceRoot) {
          await store.refresh(workspaceRoot);
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

  const setAllKanbanSortMode = (mode: KanbanSortMode) => {
    kanbanProviders.backlog.setSortMode(mode);
    kanbanProviders.ready.setSortMode(mode);
    kanbanProviders.inProgress.setSortMode(mode);
    kanbanProviders.blocked.setSortMode(mode);
    kanbanProviders.review.setSortMode(mode);
    kanbanProviders.done.setSortMode(mode);
  };

  registry.register(
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

  registry.register(
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

  registry.register(
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

  registry.register(
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

  registry.register(
    'workflow.toggleSortDirection',
    async () => {
      try {
        const current = kanbanProviders.backlog.getSortAscending();
        const ascending = !current;

        kanbanProviders.backlog.setSortAscending(ascending);
        kanbanProviders.ready.setSortAscending(ascending);
        kanbanProviders.inProgress.setSortAscending(ascending);
        kanbanProviders.blocked.setSortAscending(ascending);
        kanbanProviders.review.setSortAscending(ascending);
        kanbanProviders.done.setSortAscending(ascending);

        await vscode.commands.executeCommand('setContext', 'workflow.sortAscending', ascending);

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

  const setAllTicketsSortMode = (mode: import('./ui/sidebar-tree-provider').SidebarSortMode) => {
    ticketsProvider.setSortMode(mode);
  };

  registry.register(
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

  registry.register(
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

  registry.register(
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

  registry.register(
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

  registry.register(
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

  registry.register(
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

  registry.register(
    'workflow.stopPipeline',
    async () => {
      try {
        await pipelineProvider.stopPipeline();
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

  registry.register(
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

  registry.register(
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

  registry.register(
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

  registry.register(
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

  registry.register(
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

  registry.register(
    'workflow.decomposePlan',
    async (arg?: unknown) => {
      try {
        let planId = resolvePlanId(arg);

        if (!planId) {
          if (!workspaceRoot) {
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

        if (!workspaceRoot) {
          vscode.window.showErrorMessage(t('Workflow root not available'));
          return;
        }

        const planPath = getPlanPath(workspaceRoot, planId);

        let actualPlanPath = planPath;
        if (!fs.existsSync(planPath)) {
          actualPlanPath = getPlanPath(workspaceRoot, planId, 'archive');
        }

        if (!fs.existsSync(actualPlanPath)) {
          vscode.window.showErrorMessage(t('Plan {0} not found', planId));
          return;
        }

        const pipelinePath = getPipelineConfigPath(workspaceRoot);
        if (!fs.existsSync(pipelinePath)) {
          vscode.window.showErrorMessage(t('Pipeline config not found: {0}', pipelinePath));
          return;
        }
        const pipelineContent = fs.readFileSync(pipelinePath, 'utf-8');
        const pipelineData = safeLoad(pipelineContent) as { pipeline?: { default_agent?: string; agents?: Record<string, { command: string; args: string[]; workdir?: string }> } };
        const defaultAgentId = pipelineData?.pipeline?.default_agent;
        const agent = defaultAgentId ? pipelineData?.pipeline?.agents?.[defaultAgentId] : undefined;
        if (!agent) {
          vscode.window.showErrorMessage(t('Default agent not configured in pipeline.yaml'));
          return;
        }

        const prompt = `decompose-plan Context: plan_id=${planId}`;

        const agentArgs = agent.args.map((a: string) => `"${a}"`).join(' ');
        const agentCommand = `${agent.command} ${agentArgs} "${prompt}"`;

        const terminalEnv: Record<string, string | null> = { CLAUDECODE: null };

        const terminal = vscode.window.createTerminal({
          name: `Decompose ${planId}`,
          cwd: workspaceRoot,
          env: terminalEnv
        });
        terminal.show();

        plansProvider.setDecomposing(planId);

        terminal.sendText(agentCommand);
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

  registry.register(
    'workflow.createPlanFromFile',
    async (...args: unknown[]) => {
      const uri = args[0] as vscode.Uri | undefined;
      await executeCreatePlanFromFile(store, uri, workspaceRoot ?? null);
    }
  );

  registry.register(
    'workflow.showStatistics',
    async (_arg: unknown) => {
      await executeShowStatistics(store);
    }
  );

  registry.register(
    'workflow.openConfig',
    async () => {
      await executeOpenConfig(workspaceRoot ?? null);
    }
  );

  registry.register(
    'workflow.openPipelineConfig',
    async () => {
      await executeOpenPipelineConfig(workspaceRoot ?? null);
    }
  );

  registry.register(
    'workflow.focusTicketsView',
    async () => {
      await executeFocusTicketsView();
    }
  );

  registry.register(
    'workflow.focusKanban',
    async () => {
      await executeFocusKanban();
    }
  );

  registry.register(
    'workflow.refreshAll',
    async () => {
      const refreshCallbacks = [
        () => ticketsProvider.refresh(),
        () => plansProvider.refresh(),
        () => skillsProvider.refresh(),
        () => logsProvider.refresh(),
        () => pipelineProvider.refresh(),
        () => kanbanProviders.backlog.refresh(),
        () => kanbanProviders.ready.refresh(),
        () => kanbanProviders.inProgress.refresh(),
        () => kanbanProviders.blocked.refresh(),
        () => kanbanProviders.review.refresh(),
        () => kanbanProviders.done.refresh()
      ];
      await executeRefreshAll(workspaceRoot ?? null, store, refreshCallbacks, pipelineProvider.getPipelineService() ?? undefined);
    }
  );

  registry.register(
    'workflow.copyTicketId',
    async (arg: unknown) => {
      const ticketId = resolveTicketId(arg);
      await executeCopyTicketId(ticketId);
    }
  );

   registry.register(
     'workflow.filterTicketsByPlan',
     () => executeFilterTicketsByPlan(store, ticketsProvider, kanbanProviders)
   );

  registry.register(
    'workflow.clearTicketFilter',
    async () => {
      await executeClearTicketFilter(ticketsProvider, kanbanProviders);
    }
  );

  registry.register(
    'workflow.openHistoryReport',
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
          errorHandler.handleError(error, 'Open History Report', {
            userMessage: t('Failed to open report. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to open report: {0}', message));
        }
      }
    }
  );

  registry.register(
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

  registry.register(
    'workflow.openHistoryPlan',
    async (arg?: unknown) => {
      const planId = resolvePlanId(arg);
      if (!planId || !workspaceRoot) {
        vscode.window.showErrorMessage(t('Plan ID not available or workflow not found'));
        return;
      }
      const currentPath = getPlanPath(workspaceRoot, planId);
      const archivePath = getPlanPath(workspaceRoot, planId, 'archive');
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

  registry.register(
    'workflow.openStageTicket',
    async (arg?: unknown) => {
      const ticketId = resolveTicketId(arg);
      if (!ticketId || !workspaceRoot) {
        vscode.window.showErrorMessage(t('Ticket ID not available or workflow not found'));
        return;
      }
      const ticket = store.getTicketById(ticketId);
      if (!ticket) {
        vscode.window.showErrorMessage(t('Ticket {0} not found', ticketId));
        return;
      }
      const ticketPath = path.join(
        workspaceRoot,
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

  registry.register(
    'workflow.openStageLog',
    async (...args: unknown[]) => {
      const arg = args[0];
      let logFile = resolveLogFile(arg);
      let stageName: string | undefined;
      let logLineHintVal: number | undefined;
      if (arg && typeof arg === 'object') {
        const item = arg as Record<string, unknown>;
        stageName = typeof item.stage === 'string' ? item.stage : undefined;
        logLineHintVal = typeof item.logLineHint === 'number' ? item.logLineHint : undefined;
      }
      // Fallback: scan for newest timestamped log file
      if (!logFile) {
        const wfRoot = store.getWorkflowRoot();
        if (wfRoot) {
          const logsDir = path.join(wfRoot, 'logs');
          try {
            if (fs.existsSync(logsDir)) {
              const files = fs.readdirSync(logsDir)
                .filter(f => f.endsWith('.log') && /^pipeline_\d{4}-\d{2}-\d{2}_/.test(f));
              if (files.length > 0) {
                let newest = files[0];
                let newestMtime = fs.statSync(path.join(logsDir, newest)).mtimeMs;
                for (let i = 1; i < files.length; i++) {
                  const mtime = fs.statSync(path.join(logsDir, files[i])).mtimeMs;
                  if (mtime > newestMtime) {
                    newest = files[i];
                    newestMtime = mtime;
                  }
                }
                logFile = path.join(logsDir, newest);
              }
            }
          } catch { /* ignore scan errors */ }
        }
      }
      if (!logFile) {
        vscode.window.showErrorMessage(t('No log file provided'));
        return;
      }
      try {
        const doc = await vscode.workspace.openTextDocument(logFile);
        const editor = await vscode.window.showTextDocument(doc);
        if (stageName) {
          const content = doc.getText();
          const lines = content.split('\n');
          const escapedStage = stageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const startPattern = new RegExp(`START stage="${escapedStage}"`);
          const gotoPattern = new RegExp(`GOTO ${escapedStage}[\\s\u2192]`);
          const completePattern = new RegExp(`COMPLETE stage="${escapedStage}"`);
          const nextStepPattern = /\[PipelineRunner\] Step \d+/;
          const nextStartPattern = /START stage="/;

          const stageIndex = typeof logLineHintVal === 'number' ? logLineHintVal : 0;
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

          if (startLine >= 0) {
            // Find end of section: GOTO, COMPLETE, next Step, or next START of different stage
            for (let i = startLine + 1; i < lines.length; i++) {
              if (gotoPattern.test(lines[i]) || completePattern.test(lines[i])) {
                endLine = i;
                break;
              }
              if (nextStepPattern.test(lines[i]) || (nextStartPattern.test(lines[i]) && !startPattern.test(lines[i]))) {
                endLine = i - 1;
                break;
              }
            }

            const from = new vscode.Position(startLine, 0);
            const to = new vscode.Position(endLine, lines[endLine].length);
            // Delay to ensure editor is fully rendered
            setTimeout(() => {
              editor.selection = new vscode.Selection(from, to);
              editor.revealRange(new vscode.Range(from, to), vscode.TextEditorRevealType.InCenter);
            }, 150);
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

  registry.register(
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

  // workflow.archivePlan — moves plan from current to archive
  registry.register(
    'workflow.archivePlan',
    async (arg?: unknown) => {
      const planId = resolvePlanId(arg);
      if (!planId || !workspaceRoot) {
        vscode.window.showErrorMessage(t('Plan ID not available or workflow not found'));
        return;
      }
      const sourcePath = path.join(workspaceRoot, 'plans', 'current', `${planId}.md`);
      const targetPath = path.join(workspaceRoot, 'plans', 'archive', `${planId}.md`);
      if (!fs.existsSync(sourcePath)) {
        vscode.window.showErrorMessage(t('Plan {0} not found in current plans', planId));
        return;
      }
      try {
        const archiveDir = path.join(workspaceRoot, 'plans', 'archive');
        if (!fs.existsSync(archiveDir)) {
          fs.mkdirSync(archiveDir, { recursive: true });
        }
        fs.renameSync(sourcePath, targetPath);
        await store.refresh(workspaceRoot);
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

  // workflow.unarchivePlan — moves plan from archive to current
  registry.register(
    'workflow.unarchivePlan',
    async (arg?: unknown) => {
      const planId = resolvePlanId(arg);
      if (!planId || !workspaceRoot) {
        vscode.window.showErrorMessage(t('Plan ID not available or workflow not found'));
        return;
      }
      const sourcePath = path.join(workspaceRoot, 'plans', 'archive', `${planId}.md`);
      const targetPath = path.join(workspaceRoot, 'plans', 'current', `${planId}.md`);
      if (!fs.existsSync(sourcePath)) {
        vscode.window.showErrorMessage(t('Plan {0} not found in archive', planId));
        return;
      }
      try {
        const currentDir = path.join(workspaceRoot, 'plans', 'current');
        if (!fs.existsSync(currentDir)) {
          fs.mkdirSync(currentDir, { recursive: true });
        }
        fs.renameSync(sourcePath, targetPath);
        await store.refresh(workspaceRoot);
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

  // workflow.approvePlan — changes plan status from draft to approved
  registry.register(
    'workflow.approvePlan',
    async (arg?: unknown) => {
      const planId = resolvePlanId(arg);
      if (!planId || !workspaceRoot) {
        vscode.window.showErrorMessage(t('Plan ID not available or workflow not found'));
        return;
      }
      const planPath = path.join(workspaceRoot, 'plans', 'current', `${planId}.md`);
      if (!fs.existsSync(planPath)) {
        vscode.window.showErrorMessage(t('Plan {0} not found', planId));
        return;
      }
      try {
        // Read and parse current file
        const content = await fsPromises.readFile(planPath, 'utf-8');
        const { frontmatter: rawFrontmatter, body } = parseFrontmatter(content);
        const frontmatter = rawFrontmatter as Record<string, unknown>;

        // Validate current status
        if (frontmatter.status !== 'draft') {
          const currentStatus = String(frontmatter.status || 'unknown');
          vscode.window.showWarningMessage(
            t('Plan {0} has status "{1}", expected "draft". Only draft plans can be approved.', planId, currentStatus)
          );
          return;
        }

        // Merge: update only status and updated_at, preserve all other fields
        const updatedFrontmatter = {
          ...frontmatter,
          status: 'approved',
          updated_at: new Date().toISOString()
        };

        // Generate new content with updated frontmatter
        const updatedYaml = safeDump(updatedFrontmatter, { indent: 2 }).trimEnd();
        const newContent = `---\n${updatedYaml}\n---\n${body}`;

        // Atomic write: write to temp file then rename
        const tmpPath = planPath + '.tmp';
        await fsPromises.writeFile(tmpPath, newContent, 'utf-8');
        await fsPromises.rename(tmpPath, planPath);

        // Refresh store
        await store.refresh(workspaceRoot);

        vscode.window.showInformationMessage(t('Plan {0} approved', planId));
      } catch (error) {
        // Clean up temp file if it exists
        try {
          await fsPromises.unlink(planPath + '.tmp');
        } catch { /* ignore */ }

        if (errorHandler) {
          errorHandler.handleError(error, 'Approve Plan', {
            userMessage: t('Failed to approve plan {0}. Check Output channel for details.', planId)
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to approve plan {0}: {1}', planId, message));
        }
      }
    }
  );

  // workflow.revertPlanToDraft — changes plan status from approved to draft
  registry.register(
    'workflow.revertPlanToDraft',
    async (arg?: unknown) => {
      const planId = resolvePlanId(arg);
      if (!planId || !workspaceRoot) {
        vscode.window.showErrorMessage(t('Plan ID not available or workflow not found'));
        return;
      }
      const planPath = path.join(workspaceRoot, 'plans', 'current', `${planId}.md`);
      if (!fs.existsSync(planPath)) {
        vscode.window.showErrorMessage(t('Plan {0} not found', planId));
        return;
      }
      try {
        // Read and parse current file
        const content = await fsPromises.readFile(planPath, 'utf-8');
        const { frontmatter: rawFrontmatter, body } = parseFrontmatter(content);
        const frontmatter = rawFrontmatter as Record<string, unknown>;

        // Validate current status
        const currentStatus = String(frontmatter.status || '');

        // Check if already draft - no-op
        if (currentStatus === 'draft') {
          vscode.window.showInformationMessage(t('Plan {0} is already in draft status', planId));
          return;
        }

        // Check if active/completed - refuse with warning
        if (currentStatus === 'active' || currentStatus === 'completed') {
          vscode.window.showWarningMessage(
            t('Cannot revert plan in "{0}" status. Use archive instead.', currentStatus)
          );
          return;
        }

        // Only approved -> draft is allowed
        if (currentStatus !== 'approved') {
          vscode.window.showWarningMessage(
            t('Plan {0} has status "{1}". Only approved plans can be reverted to draft.', planId, currentStatus)
          );
          return;
        }

        // Merge: update only status and updated_at, preserve all other fields
        const updatedFrontmatter = {
          ...frontmatter,
          status: 'draft',
          updated_at: new Date().toISOString()
        };

        // Generate new content with updated frontmatter
        const updatedYaml = safeDump(updatedFrontmatter, { indent: 2 }).trimEnd();
        const newContent = `---\n${updatedYaml}\n---\n${body}`;

        // Atomic write: write to temp file then rename
        const tmpPath = planPath + '.tmp';
        await fsPromises.writeFile(tmpPath, newContent, 'utf-8');
        await fsPromises.rename(tmpPath, planPath);

        // Refresh store
        await store.refresh(workspaceRoot);

        vscode.window.showInformationMessage(t('Plan {0} reverted to draft', planId));
      } catch (error) {
        // Clean up temp file if it exists
        try {
          await fsPromises.unlink(planPath + '.tmp');
        } catch { /* ignore */ }

        if (errorHandler) {
          errorHandler.handleError(error, 'Revert Plan To Draft', {
            userMessage: t('Failed to revert plan {0}. Check Output channel for details.', planId)
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to revert plan {0}: {1}', planId, message));
        }
      }
    }
  );

  // workflow.createPlanFromTemplate — creates new plan from template
  registry.register(
    'workflow.createPlanFromTemplate',
    async (arg?: unknown) => {
      if (!workspaceRoot) {
        vscode.window.showErrorMessage(t('Workflow not found'));
        return;
      }

      // Resolve template path from tree item or URI
      let templatePath: string | undefined;
      if (arg && typeof arg === 'object') {
        const item = arg as Record<string, unknown>;
        // From tree item with template object
        if (item.template && typeof item.template === 'object') {
          const template = item.template as Record<string, unknown>;
          if (typeof template.id === 'string') {
            templatePath = path.join(workspaceRoot, 'plans', 'templates', `${template.id}.md`);
          }
        }
        // From URI
        if (!templatePath && item.fsPath && typeof item.fsPath === 'string') {
          templatePath = item.fsPath;
        }
      }

      if (!templatePath) {
        vscode.window.showErrorMessage(t('Template not found'));
        return;
      }

      if (!fs.existsSync(templatePath)) {
        vscode.window.showErrorMessage(t('Template file not found: {0}', templatePath));
        return;
      }

      try {
        const planService = new PlanService(store, workspaceRoot);
        const { plan, filePath } = await planService.createFromTemplate(templatePath);

        // Open the new plan file in the editor
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);

        // Refresh store
        await store.refresh(workspaceRoot);

        vscode.window.showInformationMessage(t('Plan {0} created from template', plan.id));
      } catch (error) {
        if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'EEXIST') {
          vscode.window.showErrorMessage(t('A plan with this ID already exists. Please try again.'));
        } else if (errorHandler) {
          errorHandler.handleError(error, 'Create Plan From Template', {
            userMessage: t('Failed to create plan from template. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to create plan from template: {0}', message));
        }
      }
    }
  );

  // workflow.runPipelineForPlan — runs pipeline with --plan flag
  registry.register(
    'workflow.runPipelineForPlan',
    async (arg?: unknown) => {
      const planId = resolvePlanId(arg);
      if (!planId || !workspaceRoot) {
        vscode.window.showErrorMessage(t('Plan ID not available or workflow not found'));
        return;
      }
      const planPath = path.join(workspaceRoot, 'plans', 'current', `${planId}.md`);
      if (!fs.existsSync(planPath)) {
        vscode.window.showErrorMessage(t('Plan {0} not found in current plans', planId));
        return;
      }
      try {
        const pipelinePath = getPipelineConfigPath(workspaceRoot);
        if (!fs.existsSync(pipelinePath)) {
          vscode.window.showErrorMessage(t('Pipeline config not found: {0}', pipelinePath));
          return;
        }

        // Check if pipeline is already running
        if (pipelineService.getState() === PipelineState.Running) {
          vscode.window.showWarningMessage(t('Pipeline is already running. Please stop it first.'));
          return;
        }

        // Use PipelineService instead of direct terminal
        await pipelineProvider.startPipeline(planId);
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Run Pipeline For Plan', {
            userMessage: t('Pipeline failed for plan {0}. Check Output channel for details.', planId)
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Pipeline failed for plan {0}: {1}', planId, message));
        }
      }
    }
  );

  // workflow.togglePlanTemplate — toggles enabled state of a plan template
  registry.register(
    'workflow.togglePlanTemplate',
    async (arg: unknown) => {
      await executeTogglePlanTemplate(store, plansProvider, arg);
    }
  );

  context.subscriptions.push(onLocaleChanged());
}

export function setWorkspaceRoot(root: string | undefined): void {
  workspaceRoot = root;
}

export function getWorkspaceRoot(): string | undefined {
  return workspaceRoot;
}
