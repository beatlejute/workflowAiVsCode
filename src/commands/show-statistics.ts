/**
 * workflow.showStatistics command handler
 *
 * Shows workflow statistics with ASCII bars by status, type, and priority
 */

import * as vscode from 'vscode';
import { t } from '../i18n';
import { WorkflowStore } from '../data/workflow-store';
import { TicketStatus } from '../data/types';

/**
 * Execute workflow.showStatistics command
 */
export async function executeShowStatistics(store: WorkflowStore): Promise<void> {
  const tickets = store.getTickets();

  if (tickets.length === 0) {
    vscode.window.showInformationMessage(t('No tickets to analyze'));
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
    t('📊 Workflow Statistics'),
    ``,
    t('Total Tickets: {0}', tickets.length),
    ``,
    t('━━━ By Status ━━━'),
    ...statusBars,
    ``,
    t('━━━ By Type ━━━'),
    ...typeBars,
    ``,
    t('━━━ By Priority ━━━'),
    ...priorityBars
  ].join('\n');

  // Build QuickPick items
  const items: vscode.QuickPickItem[] = [
    {
      label: `$(graph) ${t('Statistics Summary')}`,
      description: '',
      detail: summary
    }
  ];

  await vscode.window.showQuickPick(items, {
    placeHolder: t('Statistics'),
    title: t('Statistics'),
    matchOnDescription: false,
    matchOnDetail: false
  });

  // Offer to copy to clipboard
  const copyAction = await vscode.window.showInformationMessage(
    t('Copy statistics to clipboard?'),
    t('Copy')
  );

  if (copyAction === 'Copy') {
    await vscode.env.clipboard.writeText(summary);
    vscode.window.showInformationMessage(t('Statistics copied to clipboard'));
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
