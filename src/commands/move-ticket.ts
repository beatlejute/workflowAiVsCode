import * as vscode from 'vscode';
import { TicketService } from '../services/ticket-service';
import { TicketStatus } from '../data/types';
import { t } from '../i18n';

/**
 * Execute workflow.moveTicket command
 *
 * Supports both interactive (QuickPick) and programmatic invocation.
 *
 * @param arg - Can be:
 *   - undefined: interactive mode (QuickPick for ticket and target)
 *   - string: ticket ID (interactive for target)
 *   - { id: string, target?: string }: programmatic call; if target provided, fully non-interactive
 */
export async function executeMoveTicket(ticketService: TicketService, arg: unknown): Promise<void> {
  let ticketId: string | undefined;
  let targetStatusOverride: string | undefined;

  // Parse arg to extract ticketId and optional target
  if (typeof arg === 'string') {
    ticketId = arg;
  } else if (arg && typeof arg === 'object') {
    const item = arg as Record<string, unknown>;
    if (typeof item.id === 'string') {
      ticketId = item.id;
    }
    if (typeof item.target === 'string') {
      targetStatusOverride = item.target;
    }
  }

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
      vscode.window.showInformationMessage(t('No tickets available to move'));
      return;
    }

    const selected = await vscode.window.showQuickPick(
      tickets.map(ticket => ({
        label: ticket.id,
        description: ticket.title,
        detail: t('Current: {0}', ticket.status)
      })),
      {
        placeHolder: t('Select ticket to move'),
        title: t('Move Ticket')
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
    vscode.window.showErrorMessage(t('Ticket {0} not found', ticketId));
    return;
  }

  // Determine target status
  let targetStatus: string;
  if (targetStatusOverride) {
    // Use provided target (programmatic call)
    targetStatus = targetStatusOverride;
  } else {
    // Get valid transitions
    const validTransitions = ticketService.getValidTransitions(ticket.status);
    if (validTransitions.length === 0) {
      vscode.window.showInformationMessage(t('No valid transitions from {0}', ticket.status));
      return;
    }

    // Show QuickPick for target status
    const selectedTarget = await vscode.window.showQuickPick(
      validTransitions.map(status => ({
        label: status,
        description: t('Move to {0}', status)
      })),
      {
        placeHolder: t('Select target status for {0}', ticketId),
        title: t('Move {0}', ticketId)
      }
    );

    if (!selectedTarget) {
      return; // User cancelled
    }

    targetStatus = selectedTarget.label;
  }

  // Perform the move
  try {
    await ticketService.move(ticketId, targetStatus as TicketStatus);
    vscode.window.showInformationMessage(t('Тикет {0} перемещён в {1}', ticketId, targetStatus));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(t('Ошибка перемещения тикета {0}: {1}', ticketId, message));
  }
}
