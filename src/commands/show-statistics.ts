/**
 * workflow.showStatistics command handler
 *
 * Shows workflow statistics with ASCII bars by status, type, and priority
 */

import * as vscode from 'vscode';
import { WorkflowStore } from '../data/workflow-store';
import { TicketStatus } from '../data/types';

/**
 * Execute workflow.showStatistics command
 */
export async function executeShowStatistics(store: WorkflowStore): Promise<void> {
  const tickets = store.getTickets();

  if (tickets.length === 0) {
    vscode.window.showInformationMessage(vscode.l10n.t('No tickets to analyze'));
    return;
  }

  // Calculate statistics
  const byStatus = calculateByStatus(tickets);
  const byType = calculateByType(tickets);
  const byPriority = calculateByPriority(tickets);

  // Find maximum for scaling
  const maxStatus = Math.max(...Object.values(byStatus), 1);
  const maxType = Math.max(...Object.values(byType), 1);
  const maxPriority = Math.max(...Object.values(byPriority), 1);

  // Build ASCII bars
  const statusBars = buildAsciiBars(byStatus, maxStatus, 40);
  const typeBars = buildAsciiBars(byType, maxType, 40);
  const priorityBars = buildAsciiBars(byPriority, maxPriority, 40);

  // Build summary
  const summary = [
    vscode.l10n.t('📊 Workflow Statistics'),
    ``,
    vscode.l10n.t('Total Tickets: {0}', tickets.length),
    ``,
    vscode.l10n.t('━━━ By Status ━━━'),
    ...statusBars,
    ``,
    vscode.l10n.t('━━━ By Type ━━━'),
    ...typeBars,
    ``,
    vscode.l10n.t('━━━ By Priority ━━━'),
    ...priorityBars
  ].join('\n');

  // Show in QuickPick with copy option
  const items: vscode.QuickPickItem[] = [
    {
      label: `$(graph) ${vscode.l10n.t('Statistics Summary')}`,
      description: '',
      detail: summary
    }
  ];

  await vscode.window.showQuickPick(items, {
    placeHolder: vscode.l10n.t('Statistics'),
    title: vscode.l10n.t('Statistics'),
    matchOnDescription: false,
    matchOnDetail: false
  });

  // Offer to copy to clipboard
  const copyAction = await vscode.window.showInformationMessage(
    vscode.l10n.t('Copy statistics to clipboard?'),
    vscode.l10n.t('Copy')
  );

  if (copyAction === 'Copy') {
    await vscode.env.clipboard.writeText(summary);
    vscode.window.showInformationMessage(vscode.l10n.t('Statistics copied to clipboard'));
  }
}

/**
 * Calculate ticket count by status
 */
function calculateByStatus(tickets: Array<{ status: TicketStatus }>): Record<string, number> {
  const result: Record<string, number> = {};
  const statusOrder: TicketStatus[] = [
    TicketStatus.Backlog,
    TicketStatus.Ready,
    TicketStatus.InProgress,
    TicketStatus.Review,
    TicketStatus.Blocked,
    TicketStatus.Done
  ];

  // Initialize with all statuses
  for (const status of statusOrder) {
    result[status] = 0;
  }

  // Count
  for (const ticket of tickets) {
    result[ticket.status] = (result[ticket.status] || 0) + 1;
  }

  return result;
}

/**
 * Calculate ticket count by type
 */
function calculateByType(tickets: Array<{ type: string }>): Record<string, number> {
  const result: Record<string, number> = {};

  for (const ticket of tickets) {
    const type = ticket.type.toUpperCase();
    result[type] = (result[type] || 0) + 1;
  }

  return result;
}

/**
 * Calculate ticket count by priority
 */
function calculateByPriority(tickets: Array<{ priority: number }>): Record<string, number> {
  const result: Record<string, number> = {};

  // Initialize priorities 1-5
  for (let i = 1; i <= 5; i++) {
    result[i.toString()] = 0;
  }

  // Count
  for (const ticket of tickets) {
    const priority = ticket.priority.toString();
    result[priority] = (result[priority] || 0) + 1;
  }

  return result;
}

/**
 * Build ASCII bar chart
 */
function buildAsciiBars(
  data: Record<string, number>,
  maxValue: number,
  maxWidth: number
): string[] {
  const bars: string[] = [];

  for (const [label, count] of Object.entries(data)) {
    const barLength = Math.round((count / maxValue) * maxWidth);
    const bar = '█'.repeat(barLength);
    const percentage = ((count / maxValue) * 100).toFixed(0);
    bars.push(`${label.padEnd(12)} │${bar.padEnd(maxWidth, '░')}│ ${count} (${percentage}%)`);
  }

  return bars;
}
