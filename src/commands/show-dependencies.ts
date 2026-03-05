/**
 * workflow.showDependencies command handler
 *
 * Shows ticket dependencies via QuickPick with deps + blocks + chain
 */

import * as vscode from 'vscode';
import { WorkflowStore } from '../data/workflow-store';
import { DependencyService } from '../services/dependency-service';

/**
 * Execute workflow.showDependencies command
 */
export async function executeShowDependencies(
  store: WorkflowStore,
  dependencyService: DependencyService,
  ticketId?: string
): Promise<void> {
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
    const tickets = store.getTickets();
    if (tickets.length === 0) {
      vscode.window.showInformationMessage(vscode.l10n.t('No tickets available'));
      return;
    }

    const selected = await vscode.window.showQuickPick(
      tickets.map(t => ({
        label: t.id,
        description: t.title,
        detail: vscode.l10n.t('Status: {0}', t.status)
      })),
      {
        placeHolder: vscode.l10n.t('Select ticket to show dependencies'),
        title: vscode.l10n.t('Show Dependencies')
      }
    );

    if (!selected) {
      return; // User cancelled
    }

    ticketId = selected.label;
  }

  // Get ticket
  const ticket = store.getTicketById(ticketId);
  if (!ticket) {
    vscode.window.showErrorMessage(vscode.l10n.t('Ticket {0} not found', ticketId));
    return;
  }

  // Get dependencies and dependents
  const dependencies = dependencyService.getDependencies(ticketId);
  const dependents = dependencyService.getDependents(ticketId);

  // Build dependency chain (all ancestors and descendants)
  const chain = buildDependencyChain(ticketId, dependencyService);

  // Format dependency list
  const depList = dependencies.length > 0
    ? dependencies.map(d => `- ${d.id}: ${d.title} (${d.status})`).join('\n')
    : vscode.l10n.t('No dependencies');

  // Format blocked list
  const blocksList = dependents.length > 0
    ? dependents.map(d => `- ${d.id}: ${d.title} (${d.status})`).join('\n')
    : vscode.l10n.t('No tickets blocked by this one');

  // Format chain
  const chainList = chain.length > 0
    ? chain.map((id, index) => `${'  '.repeat(index)}└─ ${id}`).join('\n')
    : vscode.l10n.t('No dependency chain');

  // Show in QuickPick with detailed information
  const items: vscode.QuickPickItem[] = [
    {
      label: `$(git-pull-request) ${ticketId}: ${ticket.title}`,
      description: '',
      detail: `${vscode.l10n.t('Status')}: ${ticket.status} | ${vscode.l10n.t('Priority')}: ${ticket.priority} | ${vscode.l10n.t('Type')}: ${ticket.type}`
    },
    {
      label: '',
      description: '─── Dependencies ───',
      detail: depList
    },
    {
      label: '',
      description: '─── Blocks ───',
      detail: blocksList
    },
    {
      label: '',
      description: '─── Chain ───',
      detail: chainList
    }
  ];

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: vscode.l10n.t('Dependencies for {0}', ticketId),
    title: vscode.l10n.t('Ticket Dependencies'),
    matchOnDescription: false,
    matchOnDetail: false
  });

  // If user selected a dependency, offer to open it
  if (selected && selected.label.startsWith('$(git-pull-request)')) {
    // This is the main ticket, offer to open
    const openAction = await vscode.window.showInformationMessage(
      vscode.l10n.t('Open {0}?', ticketId),
      vscode.l10n.t('Open')
    );
    if (openAction === 'Open') {
      await vscode.commands.executeCommand('workflow.openTicket', ticketId);
    }
  }
}

/**
 * Build full dependency chain (ancestors and descendants)
 */
function buildDependencyChain(
  ticketId: string,
  dependencyService: DependencyService,
  visited: Set<string> = new Set(),
  depth: number = 0
): string[] {
  if (visited.has(ticketId) || depth > 10) {
    return []; // Prevent infinite loops
  }

  visited.add(ticketId);

  const dependencies = dependencyService.getDependencies(ticketId);
  const dependents = dependencyService.getDependents(ticketId);

  const chain: string[] = [ticketId];

  // Add ancestors (dependencies)
  for (const dep of dependencies) {
    const ancestorChain = buildDependencyChain(dep.id, dependencyService, visited, depth + 1);
    chain.unshift(...ancestorChain);
  }

  // Add descendants (dependents)
  for (const dependent of dependents) {
    const descendantChain = buildDependencyChain(dependent.id, dependencyService, visited, depth + 1);
    chain.push(...descendantChain);
  }

  return chain;
}
