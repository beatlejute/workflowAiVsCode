/**
 * Command handlers for configuration and navigation commands
 *
 * Includes: workflow.openPipelineConfig, workflow.openConfig, workflow.focusTicketsView,
 * workflow.focusKanban, workflow.refreshAll, workflow.copyTicketId, workflow.filterTicketsByPlan,
 * workflow.clearTicketFilter
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { t } from '../i18n';
import { WorkflowStore } from '../data/workflow-store';
import { TicketsTreeProvider } from '../ui/sidebar-tree-provider';
import { KanbanTreeProvider } from '../ui/kanban-tree-provider';
import { PipelineService } from '../services/pipeline-service';
import { updateContextKeys } from '../utils/extension-helpers';

/**
 * Execute workflow.openPipelineConfig command
 */
export async function executeOpenPipelineConfig(workflowRoot: string | null): Promise<void> {
  if (!workflowRoot) {
    vscode.window.showErrorMessage(t('Workflow not found'));
    return;
  }

  const configPath = path.join(workflowRoot, 'config', 'pipeline.yaml');
  const uri = vscode.Uri.file(configPath);

  try {
    await vscode.commands.executeCommand('vscode.open', uri);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(t('Failed to open pipeline config: {0}', message));
  }
}

/**
 * Execute workflow.openConfig command
 */
export async function executeOpenConfig(workflowRoot: string | null): Promise<void> {
  if (!workflowRoot) {
    vscode.window.showErrorMessage(t('Workflow not found'));
    return;
  }

  const configPath = path.join(workflowRoot, 'config', 'config.yaml');
  const uri = vscode.Uri.file(configPath);

  try {
    await vscode.commands.executeCommand('vscode.open', uri);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(t('Failed to open config: {0}', message));
  }
}

/**
 * Execute workflow.focusTicketsView command
 */
export async function executeFocusTicketsView(): Promise<void> {
  await vscode.commands.executeCommand('workbench.view.extension.workflow-sidebar');
  await vscode.commands.executeCommand('workbench.action.focusSideBar');
}

/**
 * Execute workflow.focusKanban command
 */
export async function executeFocusKanban(): Promise<void> {
  await vscode.commands.executeCommand('wf-kanban-backlog.focus');
}

/**
 * Execute workflow.refreshAll command
 */
export async function executeRefreshAll(
  workflowRoot: string | null,
  store: WorkflowStore,
  refreshCallbacks: Array<() => void>,
  pipelineService?: PipelineService
): Promise<void> {
  // Update context keys before refresh to prevent WELCOME view flickering
  await updateContextKeys(pipelineService);

  if (workflowRoot) {
    await store.refresh(workflowRoot);
  }

  // Call all refresh callbacks
  for (const refresh of refreshCallbacks) {
    refresh();
  }

  vscode.window.showInformationMessage(t('Workflow data refreshed'));
}

/**
 * Execute workflow.copyTicketId command
 */
export async function executeCopyTicketId(ticketId?: string): Promise<void> {
  // Get ticket ID if not provided
  if (!ticketId) {
    // Try to get from active editor
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const fileName = editor.document.fileName;
      const match = fileName.match(/\/([^\/]+)\.md$/);
      if (match) {
        ticketId = match[1];
      }
    }
  }

  if (!ticketId) {
    vscode.window.showErrorMessage(t('No ticket ID provided or found'));
    return;
  }

  await vscode.env.clipboard.writeText(ticketId);
  vscode.window.showInformationMessage(t('Copied {0} to clipboard', ticketId));
}

/**
 * Execute workflow.filterTicketsByPlan command
 * Shows QuickPick with plans and applies filter to tickets and kanban views
 */
export async function executeFilterTicketsByPlan(
  store: WorkflowStore,
  ticketsProvider: TicketsTreeProvider,
  kanbanProviders: {
    backlog: KanbanTreeProvider;
    ready: KanbanTreeProvider;
    inProgress: KanbanTreeProvider;
    blocked: KanbanTreeProvider;
    review: KanbanTreeProvider;
    done: KanbanTreeProvider;
  }
): Promise<void> {
  const plans = store.getPlans();

  if (plans.length === 0) {
    vscode.window.showInformationMessage(t('No plans available'));
    return;
  }

  // Sort plans by ID
  plans.sort((a, b) => a.id.localeCompare(b.id));

  // Create QuickPick items
  const currentFilter = ticketsProvider.getPlanFilter();

  const planItems = plans.map(plan => ({
    label: plan.id,
    description: plan.title,
    planId: plan.id,
    isCurrent: plan.folder === 'current'
  }));

  // Add "Clear filter" option if filter is active
  const quickPickItems = currentFilter
    ? [{
        label: t('$(clear-all) Clear Filter'),
        description: t('Show all tickets'),
        planId: null,
        isCurrent: false
      }, ...planItems]
    : planItems;

  const selected = await vscode.window.showQuickPick(quickPickItems, {
    placeHolder: t('Select a plan to filter tickets'),
    title: t('Filter Tickets by Plan'),
    matchOnDescription: true
  });

  if (!selected) {
    return; // User cancelled
  }

  // Apply filter to tickets and all kanban providers
  const planId = selected.planId;
  ticketsProvider.setPlanFilter(planId);
  
  // Apply same filter to all kanban providers
  kanbanProviders.backlog.setPlanFilter(planId);
  kanbanProviders.ready.setPlanFilter(planId);
  kanbanProviders.inProgress.setPlanFilter(planId);
  kanbanProviders.blocked.setPlanFilter(planId);
  kanbanProviders.review.setPlanFilter(planId);
  kanbanProviders.done.setPlanFilter(planId);

  // Update context key
  await vscode.commands.executeCommand(
    'setContext',
    'workflow.ticketFilterActive',
    planId !== null
  );

  if (planId) {
    vscode.window.showInformationMessage(
      t('Filtered tickets by plan: {0}', planId)
    );
  }
}

/**
 * Execute workflow.clearTicketFilter command
 * Clears filter from tickets and kanban views
 */
export async function executeClearTicketFilter(
  ticketsProvider: TicketsTreeProvider,
  kanbanProviders: {
    backlog: KanbanTreeProvider;
    ready: KanbanTreeProvider;
    inProgress: KanbanTreeProvider;
    blocked: KanbanTreeProvider;
    review: KanbanTreeProvider;
    done: KanbanTreeProvider;
  }
): Promise<void> {
  // Clear filter in tickets provider
  ticketsProvider.setPlanFilter(null);
  
  // Clear filter in all kanban providers
  kanbanProviders.backlog.setPlanFilter(null);
  kanbanProviders.ready.setPlanFilter(null);
  kanbanProviders.inProgress.setPlanFilter(null);
  kanbanProviders.blocked.setPlanFilter(null);
  kanbanProviders.review.setPlanFilter(null);
  kanbanProviders.done.setPlanFilter(null);

  // Update context key
  await vscode.commands.executeCommand(
    'setContext',
    'workflow.ticketFilterActive',
    false
  );

  vscode.window.showInformationMessage(t('Ticket filter cleared'));
}
