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
import { t } from '../i18n';
import { WorkflowStore } from '../data/workflow-store';
import { STATUS_ICONS } from '../constants/ticket-constants';

/**
 * CompletionItemProvider for .md ticket files
 *
 * Provides autocomplete for:
 * - dependencies field: ticket IDs
 * - conditions.value field: ticket IDs
 * - frontmatter fields: type, priority, status, depends_on
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

    // Check if we're in frontmatter block
    const frontmatterInfo = this.getFrontmatterInfo(document);
    if (frontmatterInfo && position.line >= frontmatterInfo.startLine && position.line <= frontmatterInfo.endLine) {
      // Check if we're in a frontmatter field
      const frontmatterCompletions = this.getFrontmatterCompletions(lineText, frontmatterInfo);
      if (frontmatterCompletions) {
        return frontmatterCompletions;
      }
    }

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
        `**${ticket.title}**\n\n${t('Status')}: ${STATUS_ICONS[ticket.status]} ${ticket.status}\n\n${t('Priority')}: ${ticket.priority}`
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
    // Match both: "- IMPL-001" and "- " (empty item for completion)
    if (/^\s*-\s*(["']?[A-Z]+-\d+["']?)?\s*$/.test(lineText)) {
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
    // Match ticket IDs like IMPL-001, FIX-001, IMPL-TEST, etc.
    const idMatch = frontmatterText.match(/^id:\s*["']?([A-Z]+-\w+)["']?/m);
    return idMatch ? idMatch[1] : null;
  }

  /**
   * Get frontmatter block information
   * @returns Object with startLine and endLine, or null if not in frontmatter
   */
  private getFrontmatterInfo(document: vscode.TextDocument): { startLine: number; endLine: number } | null {
    const content = document.getText();
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch) {
      return null;
    }

    // Count lines before frontmatter content
    const linesBefore = content.substring(0, frontmatterMatch.index).split('\n').length - 1;
    const frontmatterContent = frontmatterMatch[1];
    const frontmatterLines = frontmatterContent.split('\n').length;

    // startLine is the line after opening ---, endLine is the line before closing ---
    return {
      startLine: linesBefore + 1,
      endLine: linesBefore + frontmatterLines
    };
  }

  /**
   * Get completions for frontmatter fields
   */
  private getFrontmatterCompletions(lineText: string, _frontmatterInfo: { startLine: number; endLine: number }): vscode.CompletionItem[] | undefined {
    // Check which field we're in
    const typeMatch = lineText.match(/^\s*type:\s*/i);
    const priorityMatch = lineText.match(/^\s*priority:\s*/i);
    const statusMatch = lineText.match(/^\s*status:\s*/i);
    const dependsOnMatch = lineText.match(/^\s*depends_on:\s*/i);

    if (typeMatch) {
      return this.getTaskTypeCompletions();
    } else if (priorityMatch) {
      return this.getPriorityCompletions();
    } else if (statusMatch) {
      return this.getStatusCompletions();
    } else if (dependsOnMatch) {
      return this.getDependsOnCompletions();
    }

    return undefined;
  }

  /**
   * Get task type completions from config
   */
  private getTaskTypeCompletions(): vscode.CompletionItem[] {
    const config = this.store.getConfig();
    const items: vscode.CompletionItem[] = [];

    if (config && config.task_types) {
      for (const [typeId, typeConfig] of Object.entries(config.task_types)) {
        const item = new vscode.CompletionItem(typeId, vscode.CompletionItemKind.Enum);
        item.detail = typeConfig.description;
        item.documentation = new vscode.MarkdownString(
          `**${t('Type')}: ${typeId}**\n\n${typeConfig.description}\n\n**${t('Prefix')}:** ${typeConfig.prefix}`
        );
        item.sortText = `0_${typeId}`; // High priority for frontmatter completions
        items.push(item);
      }
    } else {
      // Fallback for empty config
      const defaultTypes = ['impl', 'fix', 'review', 'docs', 'arch', 'qa'];
      for (const type of defaultTypes) {
        const item = new vscode.CompletionItem(type, vscode.CompletionItemKind.Enum);
        item.detail = `${t('Type')} - ${type}`;
        item.sortText = `0_${type}`;
        items.push(item);
      }
    }

    return items;
  }

  /**
   * Get priority completions from config
   */
  private getPriorityCompletions(): vscode.CompletionItem[] {
    const config = this.store.getConfig();
    const items: vscode.CompletionItem[] = [];

    if (config && config.priorities) {
      for (const [priorityNum, priorityConfig] of Object.entries(config.priorities)) {
        const num = parseInt(priorityNum, 10);
        const item = new vscode.CompletionItem(num.toString(), vscode.CompletionItemKind.EnumMember);
        const detail = typeof priorityConfig === 'string' ? priorityConfig : (priorityConfig as { name?: string }).name || '';
        item.detail = `P${num}: ${detail}`;
        item.documentation = new vscode.MarkdownString(
          `**${t('Priority')}: ${num}**\n\n${detail}`
        );
        item.sortText = `0_${num}`;
        items.push(item);
      }
    } else {
      // Fallback for empty config
      const defaultPriorities = [
        { num: 1, name: 'critical' },
        { num: 2, name: 'high' },
        { num: 3, name: 'medium' },
        { num: 4, name: 'low' },
        { num: 5, name: 'someday' }
      ];
      for (const p of defaultPriorities) {
        const item = new vscode.CompletionItem(p.num.toString(), vscode.CompletionItemKind.EnumMember);
        item.detail = `P${p.num}: ${p.name}`;
        item.sortText = `0_${p.num}`;
        items.push(item);
      }
    }

    return items;
  }

  /**
   * Get status completions from config
   */
  private getStatusCompletions(): vscode.CompletionItem[] {
    const config = this.store.getConfig();
    const items: vscode.CompletionItem[] = [];

    if (config && config.statuses) {
      for (const [statusId, statusConfig] of Object.entries(config.statuses)) {
        const item = new vscode.CompletionItem(statusId, vscode.CompletionItemKind.EnumMember);
        const detail = typeof statusConfig === 'string' ? statusConfig : statusConfig.description || '';
        item.detail = detail;
        item.documentation = new vscode.MarkdownString(
          `**${t('Status')}: ${statusId}**\n\n${detail}`
        );
        item.sortText = `0_${statusId}`;
        items.push(item);
      }
    } else {
      // Fallback for empty config
      const defaultStatuses = ['backlog', 'ready', 'in-progress', 'blocked', 'review', 'done'];
      for (const status of defaultStatuses) {
        const item = new vscode.CompletionItem(status, vscode.CompletionItemKind.EnumMember);
        item.detail = `${t('Status')} - ${status}`;
        item.sortText = `0_${status}`;
        items.push(item);
      }
    }

    return items;
  }

  /**
   * Get depends_on completions (array of ticket IDs)
   */
  private getDependsOnCompletions(): vscode.CompletionItem[] {
    const tickets = this.store.getTickets();
    const items: vscode.CompletionItem[] = [];

    for (const ticket of tickets) {
      const item = new vscode.CompletionItem(ticket.id, vscode.CompletionItemKind.Reference);
      item.detail = `${ticket.title} (${ticket.status})`;
      item.documentation = new vscode.MarkdownString(
        `**${ticket.title}**\n\n${t('Status')}: ${STATUS_ICONS[ticket.status]} ${ticket.status}\n\n${t('Priority')}: ${ticket.priority}`
      );
      item.sortText = `0_${ticket.id}`;
      items.push(item);
    }

    return items;
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
        item.detail = typeof stageConfig === 'string' ? stageConfig : (stageConfig.description || t('Stage'));
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
        item.detail = `${t('Skill')}: ${skillId}`;
        item.documentation = new vscode.MarkdownString(
          `**${t('Skill')}: ${skillId}**\n\n${t('Located at')}: \`.workflow/src/skills/${skillId}/SKILL.md\``
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
  private extractSkillsFromPipeline(pipeline: unknown): string[] {
    const skills = new Set<string>();

    if (!pipeline || typeof pipeline !== 'object') {
      return Array.from(skills);
    }

    const pipelineObj = pipeline as Record<string, unknown>;
    if (!pipelineObj.pipeline || typeof pipelineObj.pipeline !== 'object') {
      return Array.from(skills);
    }

    const pipelineData = pipelineObj.pipeline as Record<string, unknown>;
    if (!pipelineData.stages || typeof pipelineData.stages !== 'object') {
      return Array.from(skills);
    }

    const stages = pipelineData.stages as Record<string, unknown>;

    for (const [, stageConfig] of Object.entries(stages)) {
      if (typeof stageConfig === 'object' && stageConfig !== null) {
        const config = stageConfig as Record<string, unknown>;
        if (config.skill && typeof config.skill === 'string') {
          skills.add(config.skill);
        }
      }
    }

    return Array.from(skills);
  }

  /**
   * Create Markdown documentation for a stage
   */
  private createStageDocumentation(stageId: string, stageConfig: unknown): vscode.MarkdownString {
    const description = typeof stageConfig === 'string'
      ? stageConfig
      : (stageConfig && typeof stageConfig === 'object' ? (stageConfig as Record<string, unknown>).description : undefined) || t('No description');

    const doc = new vscode.MarkdownString(`**${t('Stage')}: ${stageId}**\n\n${description}`);

    if (typeof stageConfig === 'object' && stageConfig !== null) {
      const config = stageConfig as Record<string, unknown>;
      if (config.agent && typeof config.agent === 'string') {
        doc.appendMarkdown(`\n\n**${t('Agent')}:** \`${config.agent}\``);
      }
      if (config.skill && typeof config.skill === 'string') {
        doc.appendMarkdown(`\n\n**${t('Skill')}:** \`${config.skill}\``);
      }
      if (config.type && typeof config.type === 'string') {
        doc.appendMarkdown(`\n\n**${t('Type')}:** \`${config.type}\``);
      }
      if (config.goto && typeof config.goto === 'object') {
        doc.appendMarkdown(`\n\n**${t('Transitions')}:**`);
        const goto = config.goto as Record<string, unknown>;
        for (const [trigger, target] of Object.entries(goto)) {
          const targetStage = typeof target === 'string'
            ? target
            : (target && typeof target === 'object' ? (target as Record<string, unknown>).stage : undefined);
          if (typeof targetStage === 'string') {
            doc.appendMarkdown(`\n- \`${trigger}\` → \`${targetStage}\``);
          }
        }
      }
    }

    return doc;
  }

  /**
   * Create Markdown documentation for an agent
   */
  private createAgentDocumentation(agentId: string, agentConfig: unknown): vscode.MarkdownString {
    const command = typeof agentConfig === 'string'
      ? agentConfig
      : (agentConfig && typeof agentConfig === 'object' ? (agentConfig as Record<string, unknown>).command : undefined) || '';

    const args = typeof agentConfig === 'object' && agentConfig !== null
      ? ((agentConfig as Record<string, unknown>).args as string[] | undefined) || []
      : [];

    const description = typeof agentConfig === 'object' && agentConfig !== null
      ? (agentConfig as Record<string, unknown>).description as string | undefined
      : undefined;

    const doc = new vscode.MarkdownString(`**${t('Agent')}: ${agentId}**\n\n\`\`\`bash\n${command} ${args.join(' ')}\n\`\`\``);

    if (description) {
      doc.appendMarkdown(`\n\n${description}`);
    }

    if (typeof agentConfig === 'object' && agentConfig !== null) {
      const config = agentConfig as Record<string, unknown>;
      if (config.workdir && typeof config.workdir === 'string') {
        doc.appendMarkdown(`\n\n**${t('Working Directory')}:** \`${config.workdir}\``);
      }
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
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
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
