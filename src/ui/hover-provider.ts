/**
 * HoverProvider - Ticket preview on hover
 *
 * Provides HoverProvider implementation for:
 * - .md files: ticket ID references
 * - .yaml files: ticket ID references
 *
 * Features:
 * - Hover preview on ticket ID (IMPL-003, FIX-001, etc.)
 * - MarkdownString preview with: ID, title, status, priority, type, complexity, plan, deps, tags
 * - Status icons for visual distinction
 * - No hover for non-existent ticket IDs
 *
 * ADR-006: VS Code Hover API for inline previews
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { WorkflowStore } from '../data/workflow-store';
import { Ticket, TicketStatus } from '../data/types';

/**
 * Status icons mapping for hover preview
 */
const STATUS_ICONS: Record<TicketStatus, string> = {
  [TicketStatus.Backlog]: '📋',
  [TicketStatus.Ready]: '✅',
  [TicketStatus.InProgress]: '🔄',
  [TicketStatus.Review]: '👀',
  [TicketStatus.Blocked]: '🚫',
  [TicketStatus.Done]: '✨'
};

/**
 * Priority icons mapping for hover preview
 */
const PRIORITY_ICONS: Record<number, string> = {
  1: '🔥',
  2: '⚠️',
  3: '📌',
  4: 'ℹ️',
  5: '💡'
};

/**
 * Type icons mapping for hover preview
 */
const TYPE_ICONS: Record<string, string> = {
  IMPL: '🔨',
  FIX: '🐛',
  DOCS: '📄',
  REVIEW: '🔍',
  PLAN: '📋',
  ADMIN: '⚙️',
  ARCH: '🏗️'
};

/**
 * Complexity icons mapping for hover preview
 */
const COMPLEXITY_ICONS: Record<string, string> = {
  low: '🟢',
  medium: '🟡',
  high: '🔴'
};

/**
 * HoverProvider for ticket ID references
 *
 * Shows preview when hovering over ticket ID in any .md or .yaml file
 */
export class TicketHoverProvider implements vscode.HoverProvider {
  private workflowRoot: string | null = null;

  constructor(private readonly store: WorkflowStore) {}

  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root: string): void {
    this.workflowRoot = root;
  }

  /**
   * Provide hover for a ticket ID
   */
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | undefined {
    if (!this.workflowRoot) {
      return undefined;
    }

    const line = document.lineAt(position.line).text;
    const ticketId = this.extractTicketIdAtPosition(line, position.character);

    if (!ticketId) {
      return undefined;
    }

    // Check if ticket exists in store
    const ticket = this.store.getTicketById(ticketId);
    if (!ticket) {
      return undefined;
    }

    // Build hover content
    const hoverContent = this.buildHoverContent(ticket);
    return new vscode.Hover(hoverContent);
  }

  /**
   * Extract ticket ID at cursor position
   * Regex: \b[A-Z]+-\d+\b
   */
  private extractTicketIdAtPosition(line: string, charPosition: number): string | null {
    const ticketIdRegex = /\b([A-Z]+-\d+)\b/g;
    let match: RegExpExecArray | null;

    while ((match = ticketIdRegex.exec(line)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      // Check if cursor position is within this match
      if (charPosition >= start && charPosition <= end) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Build MarkdownString hover content from ticket
   */
  private buildHoverContent(ticket: Ticket): vscode.MarkdownString {
    const statusIcon = STATUS_ICONS[ticket.status] || '📋';
    const priorityIcon = PRIORITY_ICONS[ticket.priority] || '📌';
    const typeIcon = TYPE_ICONS[ticket.type?.toUpperCase()] || '📝';
    const complexityIcon = COMPLEXITY_ICONS[ticket.complexity] || '🟡';

    // Build markdown content
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.supportHtml = true;

    // Header: ID and title
    markdown.appendMarkdown(`#### ${ticket.id}: ${ticket.title}\n\n`);

    // Status, priority, type, complexity
    markdown.appendMarkdown(
      `**${vscode.l10n.t('Status')}:** ${statusIcon} \`${ticket.status}\`  ` +
      `| **${vscode.l10n.t('Priority')}:** ${priorityIcon} \`${ticket.priority}\`  ` +
      `| **${vscode.l10n.t('Type')}:** ${typeIcon} \`${ticket.type}\`  ` +
      `| **${vscode.l10n.t('Complexity')}:** ${complexityIcon} \`${ticket.complexity}\`\n\n`
    );

    // Plan reference
    if (ticket.parent_plan) {
      markdown.appendMarkdown(`**${vscode.l10n.t('Plan')}:** [${ticket.parent_plan}](command:workflow.openPlan?id=${ticket.parent_plan})  `);
    }

    // Dependencies with status icons
    if (ticket.dependencies && ticket.dependencies.length > 0) {
      const depsWithStatus = ticket.dependencies.map(depId => {
        const depTicket = this.store.getTicketById(depId);
        const depStatusIcon = depTicket ? STATUS_ICONS[depTicket.status] : '⬜';
        return `${depId} ${depStatusIcon}`;
      });
      markdown.appendMarkdown(`**${vscode.l10n.t('Deps')}:** ${depsWithStatus.join(', ')}\n\n`);
    } else {
      markdown.appendMarkdown(`**${vscode.l10n.t('Deps')}:** ${vscode.l10n.t('No dependencies')}\n\n`);
    }

    // Tags
    if (ticket.tags && ticket.tags.length > 0) {
      markdown.appendMarkdown(`**${vscode.l10n.t('Tags')}:** ${ticket.tags.join(', ')}`);
    }

    return markdown;
  }
}

/**
 * Combined HoverProvider that delegates to specific providers
 */
export class WorkflowHoverProvider implements vscode.HoverProvider {
  private readonly ticketProvider: TicketHoverProvider;

  constructor(store: WorkflowStore) {
    this.ticketProvider = new TicketHoverProvider(store);
  }

  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root: string): void {
    this.ticketProvider.setWorkflowRoot(root);
  }

  /**
   * Provide hover for any supported file type
   */
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | undefined {
    const fsPath = document.uri.fsPath;

    // Support .md and .yaml files
    if (fsPath.endsWith('.md') || fsPath.endsWith('.yaml') || fsPath.endsWith('.yml')) {
      return this.ticketProvider.provideHover(document, position);
    }

    return undefined;
  }
}
