/**
 * workflow.moveTicket command handler
 *
 * Moves a ticket to a new status via QuickPick (ticket selection) → QuickPick (target status) → call wf CLI
 */

import * as vscode from 'vscode';
import { TicketService } from '../services/ticket-service';
import { TicketStatus } from '../data/types';

/**
 * Execute workflow.moveTicket command
 */
export async function executeMoveTicket(ticketService: TicketService, ticketId?: string): Promise<void> {
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
    // Show QuickPick to select ticket
    const tickets = ticketService.getAll();
    if (tickets.length === 0) {
      vscode.window.showInformationMessage(vscode.l10n.t('No tickets available to move'));
      return;
    }

    const selected = await vscode.window.showQuickPick(
      tickets.map(t => ({
        label: t.id,
        description: t.title,
        detail: vscode.l10n.t('Current: {0}', t.status)
      })),
      {
        placeHolder: vscode.l10n.t('Select ticket to move'),
        title: vscode.l10n.t('Move Ticket')
      }
    );

    if (!selected) {
      return; // User cancelled
    }

    ticketId = selected.label;
  }

  // Get current ticket
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
    vscode.window.showInformationMessage(vscode.l10n.t('Moved {0} to {0}', ticketId, targetStatus.label));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(vscode.l10n.t('Failed to move ticket: {0}', message));
  }
}
