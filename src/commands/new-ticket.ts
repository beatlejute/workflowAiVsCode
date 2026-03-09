/**
 * workflow.newTicket command handler
 *
 * Creates a new ticket via QuickPick (type) → InputBox (title) → create file → open
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { t } from '../i18n';
import { TicketService } from '../services/ticket-service';

/**
 * Execute workflow.newTicket command
 */
export async function executeNewTicket(ticketService: TicketService): Promise<void> {
  // Get ticket type
  const type = await vscode.window.showQuickPick(
    [
      { label: 'IMPL', description: t('Implementation task') },
      { label: 'FIX', description: t('Bug fix') },
      { label: 'DOCS', description: t('Documentation') },
      { label: 'REVIEW', description: t('Code review') },
      { label: 'ARCH', description: t('Architecture task') },
      { label: 'ADMIN', description: t('Administrative task') }
    ],
    {
      placeHolder: t('Select ticket type'),
      title: t('Create New Ticket')
    }
  );

  if (!type) {
    return; // User cancelled
  }

  // Get title
  const title = await vscode.window.showInputBox({
    prompt: t('Enter ticket title'),
    placeHolder: t('e.g., Add feature X'),
    title: t('Create New Ticket'),
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return t('Title is required');
      }
      return undefined;
    }
  });

  if (!title) {
    return; // User cancelled
  }

  try {
    const ticket = await ticketService.create(type.label, title);
    vscode.window.showInformationMessage(t('Created ticket {0}: {1}', ticket.id, ticket.title));

    // Open the created ticket
    const workflowRoot = ticketService.getWorkflowRoot();
    if (workflowRoot) {
      const ticketPath = vscode.Uri.file(
        path.join(workflowRoot, 'tickets', 'backlog', `${ticket.id}.md`)
      );
      await vscode.commands.executeCommand('vscode.open', ticketPath);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(t('Failed to create ticket: {0}', message));
  }
}
