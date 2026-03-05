/**
 * Command handlers for configuration and navigation commands
 *
 * Includes: workflow.openPipelineConfig, workflow.openConfig, workflow.focusTicketsView,
 * workflow.focusKanban, workflow.refreshAll, workflow.copyTicketId
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { WorkflowStore } from '../data/workflow-store';

/**
 * Execute workflow.openPipelineConfig command
 */
export async function executeOpenPipelineConfig(workflowRoot: string | null): Promise<void> {
  if (!workflowRoot) {
    vscode.window.showErrorMessage(vscode.l10n.t('Workflow not found'));
    return;
  }

  const configPath = path.join(workflowRoot, 'config', 'pipeline.yaml');
  const uri = vscode.Uri.file(configPath);

  try {
    await vscode.commands.executeCommand('vscode.open', uri);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(vscode.l10n.t('Failed to open pipeline config: {0}', message));
  }
}

/**
 * Execute workflow.openConfig command
 */
export async function executeOpenConfig(workflowRoot: string | null): Promise<void> {
  if (!workflowRoot) {
    vscode.window.showErrorMessage(vscode.l10n.t('Workflow not found'));
    return;
  }

  const configPath = path.join(workflowRoot, 'config', 'config.yaml');
  const uri = vscode.Uri.file(configPath);

  try {
    await vscode.commands.executeCommand('vscode.open', uri);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(vscode.l10n.t('Failed to open config: {0}', message));
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
  await vscode.commands.executeCommand('workbench.panel.workflow-kanban.view.wf-kanban-backlog');
}

/**
 * Execute workflow.refreshAll command
 */
export async function executeRefreshAll(
  workflowRoot: string | null,
  store: WorkflowStore,
  refreshCallbacks: Array<() => void>
): Promise<void> {
  if (workflowRoot) {
    await store.refresh(workflowRoot);
  }

  // Call all refresh callbacks
  for (const refresh of refreshCallbacks) {
    refresh();
  }

  vscode.window.showInformationMessage(vscode.l10n.t('Workflow data refreshed'));
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
    vscode.window.showErrorMessage(vscode.l10n.t('No ticket ID provided or found'));
    return;
  }

  await vscode.env.clipboard.writeText(ticketId);
  vscode.window.showInformationMessage(vscode.l10n.t('Copied {0} to clipboard', ticketId));
}
