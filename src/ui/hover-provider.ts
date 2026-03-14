/**
 * HoverProvider - Ticket preview on hover + Agent info in pipeline.yaml
 *
 * Provides HoverProvider implementation for:
 * - .md files: ticket ID references
 * - .yaml files: ticket ID references
 * - pipeline.yaml: agent: and fallback_agent: values
 *
 * Features:
 * - Hover preview on ticket ID (IMPL-003, FIX-001, etc.)
 * - MarkdownString preview with: ID, title, status, priority, type, complexity, plan, deps, tags
 * - Status icons for visual distinction
 * - No hover for non-existent ticket IDs
 * - Hover on agent:/fallback_agent: in pipeline.yaml shows agent info (command, args, workdir, description)
 *
 * ADR-006: VS Code Hover API for inline previews
 */

import * as fs from 'fs';
import * as vscode from 'vscode';
import { t } from '../i18n';
import { safeLoad } from '../utils/yaml-utils';
import { WorkflowStore } from '../data/workflow-store';
import { Ticket } from '../data/types';
import { STATUS_ICONS, PRIORITY_ICONS, TYPE_ICONS, COMPLEXITY_ICONS } from '../constants/ticket-constants';

/**
 * Agent definition interface
 */
interface AgentDefinition {
  command: string;
  args?: string[];
  workdir?: string;
  description?: string;
}

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
      `**${t('Status')}:** ${statusIcon} \`${ticket.status}\`  ` +
      `| **${t('Priority')}:** ${priorityIcon} \`${ticket.priority}\`  ` +
      `| **${t('Type')}:** ${typeIcon} \`${ticket.type}\`  ` +
      `| **${t('Complexity')}:** ${complexityIcon} \`${ticket.complexity}\`\n\n`
    );

    // Plan reference
    if (ticket.parent_plan) {
      markdown.appendMarkdown(`**${t('Plan')}:** [${ticket.parent_plan}](command:workflow.openPlan?id=${ticket.parent_plan})  `);
    }

    // Dependencies with status icons
    if (ticket.dependencies && ticket.dependencies.length > 0) {
      const depsWithStatus = ticket.dependencies.map(depId => {
        const depTicket = this.store.getTicketById(depId);
        const depStatusIcon = depTicket ? STATUS_ICONS[depTicket.status] : '⬜';
        return `${depId} ${depStatusIcon}`;
      });
      markdown.appendMarkdown(`**${t('Deps')}:** ${depsWithStatus.join(', ')}\n\n`);
    } else {
      markdown.appendMarkdown(`**${t('Deps')}:** ${t('No dependencies')}\n\n`);
    }

    // Tags
    if (ticket.tags && ticket.tags.length > 0) {
      markdown.appendMarkdown(`**${t('Tags')}:** ${ticket.tags.join(', ')}\n\n`);
    }

    // Review
    if (ticket.reviews && ticket.reviews.length > 0) {
      markdown.appendMarkdown(`**${t('Review')}:**\n\n`);
      markdown.appendMarkdown(`| ${t('Date')} | ${t('Status')} | ${t('Summary')} |\n|---|---|---|\n`);
      for (const r of ticket.reviews) {
        markdown.appendMarkdown(`| ${r.date} | ${r.icon} ${r.status} | ${r.summary} |\n`);
      }
    }

    return markdown;
  }
}

/**
 * HoverProvider for agent definitions in pipeline.yaml
 *
 * Shows agent info when hovering over agent: or fallback_agent: values
 * 
 * Features:
 * - YAML кэш с инвалидацией по mtime файла
 * - Автоматическая инвалидация при изменении pipeline.yaml через WorkflowStore
 */
export class AgentHoverProvider implements vscode.HoverProvider {
  private workflowRoot: string | null = null;
  private agentsCache: Map<string, { data: AgentDefinition; mtime: number }> = new Map();
  private lastParsedFile: string | null = null;
  private lastParsedMtime: number = 0;
  private storeUnsubscribe: (() => void) | undefined;

  constructor(private readonly store?: WorkflowStore) {
    // Подписка на изменения store для инвалидации кэша
    if (this.store) {
      this.store.onDidChange((event) => {
        // Инвалидация кэша при любом изменении (конфигурация меняется)
        if (event.type === 'config') {
          this.agentsCache.clear();
          this.lastParsedFile = null;
          this.lastParsedMtime = 0;
        }
      });
    }
  }

  /**
   * Очистка ресурсов
   */
  dispose(): void {
    this.storeUnsubscribe?.();
    this.agentsCache.clear();
  }

  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root: string): void {
    this.workflowRoot = root;
    this.agentsCache.clear();
    this.lastParsedFile = null;
    this.lastParsedMtime = 0;
  }

  /**
   * Parse pipeline.yaml and extract agents definitions
   * Использует кэш с инвалидацией по mtime файла
   */
  private parsePipelineYaml(document: vscode.TextDocument): Map<string, AgentDefinition> {
    const fsPath = document.uri.fsPath;

    try {
      // Проверяем кэш по mtime файла
      let mtime = 0;
      try {
        const stat = fs.statSync(fsPath);
        mtime = stat.mtimeMs;
      } catch {
        // Файл не существует (например, в тестах) - используем mtime = 0
        mtime = 0;
      }

      // Используем кэш если файл не изменился
      if (this.lastParsedFile === fsPath && this.agentsCache.size > 0 && this.lastParsedMtime === mtime) {
        // Возвращаем только данные без mtime
        const result = new Map<string, AgentDefinition>();
        this.agentsCache.forEach((value, key) => {
          result.set(key, value.data);
        });
        return result;
      }

      const content = document.getText();
      const parsed = safeLoad(content) as Record<string, unknown> | null;

      if (parsed?.pipeline && typeof parsed.pipeline === 'object') {
        const pipeline = parsed.pipeline as Record<string, unknown>;
        if (pipeline.agents && typeof pipeline.agents === 'object') {
          this.agentsCache.clear();
          const agents = pipeline.agents as Record<string, unknown>;

          for (const [agentId, agentData] of Object.entries(agents)) {
            if (agentData && typeof agentData === 'object') {
              const data = agentData as Record<string, unknown>;
              this.agentsCache.set(agentId, {
                data: {
                  command: (data.command as string) || '',
                  args: (data.args as string[]) || [],
                  workdir: (data.workdir as string) || '.',
                  description: (data.description as string) || ''
                },
                mtime
              });
            }
          }

          this.lastParsedFile = fsPath;
          this.lastParsedMtime = mtime;
        }
      }
    } catch (error) {
      console.error('Failed to parse pipeline.yaml:', error);
      this.agentsCache.clear();
      this.lastParsedFile = null;
      this.lastParsedMtime = 0;
    }

    // Возвращаем только данные без mtime
    const result = new Map<string, AgentDefinition>();
    this.agentsCache.forEach((value, key) => {
      result.set(key, value.data);
    });
    return result;
  }

  /**
   * Check if pipeline.yaml has agents section
   */
  private hasAgents(document: vscode.TextDocument): boolean {
    const agents = this.parsePipelineYaml(document);
    return agents.size > 0;
  }

  /**
   * Extract agent name at cursor position for agent: or fallback_agent:
   */
  private extractAgentNameAtPosition(line: string, charPosition: number): string | null {
    // Match agent: value or fallback_agent: value
    const agentValueRegex = /(agent|fallback_agent):\s*([a-zA-Z0-9_-]+)/g;
    let match: RegExpExecArray | null;

    while ((match = agentValueRegex.exec(line)) !== null) {
      const fullMatchStart = match.index;
      const valueStart = fullMatchStart + match[1].length + 1; // +1 for colon

      // Skip whitespace after colon
      const trimmedValueStart = line.indexOf(match[2], valueStart);
      const trimmedValueEnd = trimmedValueStart + match[2].length;

      // Check if cursor position is within the agent value
      if (charPosition >= trimmedValueStart && charPosition <= trimmedValueEnd) {
        return match[2];
      }
    }

    return null;
  }

  /**
   * Provide hover for agent values in pipeline.yaml
   */
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | undefined {
    if (!this.workflowRoot) {
      return undefined;
    }

    const fsPath = document.uri.fsPath;
    
    // Only support pipeline.yaml
    if (!fsPath.endsWith('pipeline.yaml') && !fsPath.endsWith('pipeline.yml')) {
      return undefined;
    }

    const line = document.lineAt(position.line).text;
    const agentName = this.extractAgentNameAtPosition(line, position.character);

    if (!agentName) {
      return undefined;
    }

    // Parse agents if not already cached
    const agents = this.parsePipelineYaml(document);
    const agent = agents.get(agentName);

    if (!agent) {
      return undefined;
    }

    // Build hover content
    const hoverContent = this.buildAgentHoverContent(agentName, agent);
    return new vscode.Hover(hoverContent);
  }

  /**
   * Build MarkdownString hover content for agent
   */
  private buildAgentHoverContent(agentId: string, agent: AgentDefinition): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.supportHtml = true;

    // Header: Agent ID
    markdown.appendMarkdown(`#### 🤖 ${agentId}\n\n`);

    // Command
    markdown.appendMarkdown(`**${t('Command')}:** \`${agent.command}\`\n\n`);

    // Args
    if (agent.args && agent.args.length > 0) {
      markdown.appendMarkdown(`**${t('Args')}:**\n`);
      markdown.appendMarkdown('```json\n' + JSON.stringify(agent.args, null, 2) + '\n```\n\n');
    }

    // Workdir
    if (agent.workdir) {
      markdown.appendMarkdown(`**${t('Workdir')}:** \`${agent.workdir}\`\n\n`);
    }

    // Description
    if (agent.description) {
      markdown.appendMarkdown(`**${t('Description')}:** ${agent.description}\n\n`);
    }

    return markdown;
  }
}

/**
 * Combined HoverProvider that delegates to specific providers
 */
export class WorkflowHoverProvider implements vscode.HoverProvider, vscode.Disposable {
  private readonly ticketProvider: TicketHoverProvider;
  private readonly agentProvider: AgentHoverProvider;

  constructor(store: WorkflowStore) {
    this.ticketProvider = new TicketHoverProvider(store);
    this.agentProvider = new AgentHoverProvider(store);
  }

  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root: string): void {
    this.ticketProvider.setWorkflowRoot(root);
    this.agentProvider.setWorkflowRoot(root);
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.agentProvider.dispose();
  }

  /**
   * Provide hover for any supported file type
   */
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | undefined {
    const fsPath = document.uri.fsPath;

    // Support pipeline.yaml for agent hover
    if (fsPath.endsWith('pipeline.yaml') || fsPath.endsWith('pipeline.yml')) {
      const agentHover = this.agentProvider.provideHover(document, position);
      if (agentHover) {
        return agentHover;
      }
      // Fall back to ticket hover for ticket IDs in pipeline.yaml
      return this.ticketProvider.provideHover(document, position);
    }

    // Support .md and other .yaml/.yml files for ticket hover
    if (fsPath.endsWith('.md') || fsPath.endsWith('.yaml') || fsPath.endsWith('.yml')) {
      return this.ticketProvider.provideHover(document, position);
    }

    return undefined;
  }
}
