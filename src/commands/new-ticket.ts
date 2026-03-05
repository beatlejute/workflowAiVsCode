/**
 * workflow.newTicket command handler
 *
 * Creates a new ticket via QuickPick (type) → InputBox (title) → create file → open
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { TicketService } from '../services/ticket-service';

/**
 * Execute workflow.newTicket command
 */
export async function executeNewTicket(ticketService: TicketService): Promise<void> {
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
    vscode.window.showInformationMessage(vscode.l10n.t('Created ticket {0}: {0}', ticket.id, ticket.title));

    // Open the created ticket
    const workflowRoot = ticketService.getWorkflowRoot();
    if (workflowRoot) {
      const ticketPath = vscode.Uri.file(
        path.join(workflowRoot, '.workflow', 'tickets', 'backlog', `${ticket.id}.md`)
      );
      await vscode.commands.executeCommand('vscode.open', ticketPath);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(vscode.l10n.t('Failed to create ticket: {0}', message));
  }
}
