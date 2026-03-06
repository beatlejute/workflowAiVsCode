/**
 * CompletionItemProvider - Auto-completion for workflow ticket .md and pipeline.yaml files
 *
 * Provides CompletionItem implementations for:
 * - .md files: Ticket ID autocomplete in dependencies/conditions fields
 * - pipeline.yaml: stage/agent/skill ID autocomplete
 *
 * Features:
 * - Ticket ID completion with title + status in detail
 * - Stage ID completion with description
 * - Agent ID completion with command info
 * - Skill ID completion with description
 *
 * ADR-007: VS Code CompletionItem API for intelligent autocomplete
 */

import * as vscode from 'vscode';
import { WorkflowStore } from '../data/workflow-store';
import { Ticket, TicketStatus } from '../data/types';

/**
 * Status icon mapping for completion items
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
 * CompletionItemProvider for .md ticket files
 *
 * Provides autocomplete for:
 * - dependencies field: ticket IDs
 * - conditions.value field: ticket IDs
 */
export class TicketCompletionProvider implements vscode.CompletionItemProvider {
  private readonly store: WorkflowStore;
  private workflowRoot: string | null = null;

  constructor(store: WorkflowStore) {
    this.store = store;
  }

  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root: string): void {
    this.workflowRoot = root;
  }

  /**
   * Provide completions for a .md ticket file
   */
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] | undefined {
    if (!this.workflowRoot) {
      return undefined;
    }

    const line = document.lineAt(position).text;
    const lineText = line.substring(0, position.character);

    // Check if we're in dependencies or conditions field
    const inDependencies = this.isInField(lineText, 'dependencies');
    const inConditions = this.isInField(lineText, 'value');

    if (!inDependencies && !inConditions) {
      return undefined;
    }

    // Get all tickets for completion
    const tickets = this.store.getTickets();
    const currentTicketId = this.getCurrentTicketId(document);

    // Create completion items for all tickets except current one
    const items: vscode.CompletionItem[] = [];

    for (const ticket of tickets) {
      // Skip self-reference
      if (ticket.id === currentTicketId) {
        continue;
      }

      const item = new vscode.CompletionItem(ticket.id, vscode.CompletionItemKind.Reference);
      item.detail = `${ticket.title} (${ticket.status})`;
      item.documentation = new vscode.MarkdownString(
        `**${ticket.title}**\n\n${vscode.l10n.t('Status')}: ${STATUS_ICONS[ticket.status]} ${ticket.status}\n\n${vscode.l10n.t('Priority')}: ${ticket.priority}`
      );
      item.sortText = ticket.id; // Ensure proper sorting by ID

      items.push(item);
    }

    return items;
  }

  /**
   * Check if cursor is in a specific YAML field
   */
  private isInField(lineText: string, fieldName: string): boolean {
    // Check if line contains the field name
    const fieldPattern = new RegExp(`^\\s*${fieldName}\\s*:`, 'i');
    const arrayItemPattern = new RegExp(`^\\s*-\\s*["']?${fieldName}`, 'i');

    if (fieldPattern.test(lineText) || arrayItemPattern.test(lineText)) {
      return true;
    }

    // Check if we're in a multi-line array item (line starts with -)
    if (/^\s*-\s*["']?[A-Z]+-\d+["']?\s*$/.test(lineText)) {
      return fieldName === 'dependencies' || fieldName === 'value';
    }

    return false;
  }

  /**
   * Get current ticket ID from document frontmatter
   */
  private getCurrentTicketId(document: vscode.TextDocument): string | null {
    const content = document.getText();
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch) {
      return null;
    }

    const frontmatterText = frontmatterMatch[1];
    const idMatch = frontmatterText.match(/^id:\s*["']?([A-Z]+-\d+)["']?/m);
    return idMatch ? idMatch[1] : null;
  }
}

/**
 * CompletionItemProvider for pipeline.yaml
 *
 * Provides autocomplete for:
 * - goto.stage: stage IDs
 * - agent/fallback_agent: agent IDs
 * - skill: skill IDs
 */
export class PipelineCompletionProvider implements vscode.CompletionItemProvider {
  private readonly store: WorkflowStore;
  private workflowRoot: string | null = null;

  constructor(store: WorkflowStore) {
    this.store = store;
  }

  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root: string): void {
    this.workflowRoot = root;
  }

  /**
   * Provide completions for a pipeline.yaml file
   */
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] | undefined {
    if (!this.workflowRoot) {
      return undefined;
    }

    const pipeline = this.store.getPipeline();
    if (!pipeline) {
      return undefined;
    }

    const line = document.lineAt(position).text;
    const lineText = line.substring(0, position.character);

    // Determine which field we're in
    const stageMatch = lineText.match(/^\s*(goto:)?\s*stage:\s*/i);
    const agentMatch = lineText.match(/^\s*(agent|fallback_agent):\s*/i);
    const skillMatch = lineText.match(/^\s*skill:\s*/i);

    const items: vscode.CompletionItem[] = [];

    if (stageMatch) {
      // Stage ID completion
      const stages = Object.entries(pipeline.pipeline.stages || {});
      for (const [stageId, stageConfig] of stages) {
        const item = new vscode.CompletionItem(stageId, vscode.CompletionItemKind.Class);
        item.detail = typeof stageConfig === 'string' ? stageConfig : (stageConfig.description || vscode.l10n.t('Stage'));
        item.documentation = this.createStageDocumentation(stageId, stageConfig);
        item.sortText = `1_${stageId}`; // Priority 1 for stages
        items.push(item);
      }
    } else if (agentMatch) {
      // Agent ID completion
      const agents = Object.entries(pipeline.pipeline.agents || {});
      for (const [agentId, agentConfig] of agents) {
        const item = new vscode.CompletionItem(agentId, vscode.CompletionItemKind.Module);
        const command = typeof agentConfig === 'string' ? agentConfig : agentConfig.command;
        item.detail = command;
        item.documentation = this.createAgentDocumentation(agentId, agentConfig);
        item.sortText = `2_${agentId}`; // Priority 2 for agents
        items.push(item);
      }
    } else if (skillMatch) {
      // Skill ID completion
      const skills = this.extractSkillsFromPipeline(pipeline);
      for (const skillId of skills) {
        const item = new vscode.CompletionItem(skillId, vscode.CompletionItemKind.Method);
        item.detail = `${vscode.l10n.t('Skill')}: ${skillId}`;
        item.documentation = new vscode.MarkdownString(
          `**${vscode.l10n.t('Skill')}: ${skillId}**\n\n${vscode.l10n.t('Located at')}: \`.workflow/src/skills/${skillId}/SKILL.md\``
        );
        item.sortText = `3_${skillId}`; // Priority 3 for skills
        items.push(item);
      }
    }

    return items.length > 0 ? items : undefined;
  }

  /**
   * Extract unique skill IDs from pipeline stages
   */
  private extractSkillsFromPipeline(pipeline: any): string[] {
    const skills = new Set<string>();
    const stages = pipeline.pipeline.stages || {};

    for (const [, stageConfig] of Object.entries(stages)) {
      if (typeof stageConfig === 'object' && stageConfig !== null) {
        const config = stageConfig as any;
        if (config.skill) {
          skills.add(config.skill);
        }
      }
    }

    return Array.from(skills);
  }

  /**
   * Create Markdown documentation for a stage
   */
  private createStageDocumentation(stageId: string, stageConfig: any): vscode.MarkdownString {
    const description = typeof stageConfig === 'string'
      ? stageConfig
      : (stageConfig.description || vscode.l10n.t('No description'));

    const doc = new vscode.MarkdownString(`**${vscode.l10n.t('Stage')}: ${stageId}**\n\n${description}`);

    if (typeof stageConfig === 'object' && stageConfig !== null) {
      if (stageConfig.agent) {
        doc.appendMarkdown(`\n\n**${vscode.l10n.t('Agent')}:** \`${stageConfig.agent}\``);
      }
      if (stageConfig.skill) {
        doc.appendMarkdown(`\n\n**${vscode.l10n.t('Skill')}:** \`${stageConfig.skill}\``);
      }
      if (stageConfig.type) {
        doc.appendMarkdown(`\n\n**${vscode.l10n.t('Type')}:** \`${stageConfig.type}\``);
      }
      if (stageConfig.goto) {
        doc.appendMarkdown(`\n\n**${vscode.l10n.t('Transitions')}:**`);
        for (const [trigger, target] of Object.entries(stageConfig.goto)) {
          const targetStage = typeof target === 'string' ? target : (target as any).stage;
          doc.appendMarkdown(`\n- \`${trigger}\` → \`${targetStage}\``);
        }
      }
    }

    return doc;
  }

  /**
   * Create Markdown documentation for an agent
   */
  private createAgentDocumentation(agentId: string, agentConfig: any): vscode.MarkdownString {
    const command = typeof agentConfig === 'string' ? agentConfig : agentConfig.command;
    const args = typeof agentConfig === 'object' && agentConfig !== null ? agentConfig.args || [] : [];
    const description = typeof agentConfig === 'object' && agentConfig !== null ? agentConfig.description : undefined;

    const doc = new vscode.MarkdownString(`**${vscode.l10n.t('Agent')}: ${agentId}**\n\n\`\`\`bash\n${command} ${args.join(' ')}\n\`\`\``);

    if (description) {
      doc.appendMarkdown(`\n\n${description}`);
    }

    if (typeof agentConfig === 'object' && agentConfig !== null && agentConfig.workdir) {
      doc.appendMarkdown(`\n\n**${vscode.l10n.t('Working Directory')}:** \`${agentConfig.workdir}\``);
    }

    return doc;
  }
}

/**
 * WorkflowCompletionProvider - Composite provider for all workflow files
 *
 * Delegates to the appropriate provider based on file type
 */
export class WorkflowCompletionProvider implements vscode.CompletionItemProvider {
  private readonly ticketProvider: TicketCompletionProvider;
  private readonly pipelineProvider: PipelineCompletionProvider;

  constructor(store: WorkflowStore) {
    this.ticketProvider = new TicketCompletionProvider(store);
    this.pipelineProvider = new PipelineCompletionProvider(store);
  }

  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root: string): void {
    this.ticketProvider.setWorkflowRoot(root);
    this.pipelineProvider.setWorkflowRoot(root);
  }

  /**
   * Provide completions based on document type
   */
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.CompletionItem[] | undefined {
    const fileName = document.fileName;

    // Ticket .md files
    const normalizedPath = fileName.replace(/\\/g, '/');
    if (normalizedPath.includes('.workflow/tickets/') && normalizedPath.endsWith('.md')) {
      return this.ticketProvider.provideCompletionItems(document, position);
    }

    // Pipeline.yaml
    if (fileName.endsWith('pipeline.yaml') || fileName.endsWith('pipeline.yml')) {
      return this.pipelineProvider.provideCompletionItems(document, position);
    }

    return undefined;
  }
}
