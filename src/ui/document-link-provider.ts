/**
 * DocumentLinkProvider - Clickable links for workflow artifacts
 *
 * Provides DocumentLinkProvider implementations for:
 * - .md tickets: context.files paths, dependencies ID
 * - pipeline.yaml: skill, goto.stage
 *
 * Features:
 * - Clickable file paths in context.files
 * - Clickable ticket IDs in dependencies
 * - Clickable skill IDs in pipeline.yaml
 * - Clickable stage IDs in goto.stage
 *
 * ADR-006: VS Code DocumentLink API for navigation
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowStore } from '../data/workflow-store';
import { load as loadYaml } from 'js-yaml';
import { PipelineConfig } from '../data/types';

/**
 * DocumentLinkProvider for .md ticket files
 *
 * Makes the following clickable:
 * - context.files: file paths → open file in editor
 * - dependencies: ticket ID → open ticket .md file
 */
export class TicketDocumentLinkProvider implements vscode.DocumentLinkProvider {
  private workflowRoot: string | null = null;

  constructor(private readonly store: WorkflowStore) {}

  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root: string): void {
    this.workflowRoot = root;
  }

  /**
   * Provide document links for a ticket .md file
   */
  provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    if (!this.workflowRoot) {
      return [];
    }

    const content = document.getText();
    const links: vscode.DocumentLink[] = [];

    // Parse frontmatter to get structured data
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch) {
      return [];
    }

    const frontmatterText = frontmatterMatch[1];
    const lines = frontmatterText.split('\n');

    // Find context.files section and extract file paths
    this.extractContextFilesLinks(lines, document, links);

    // Find dependencies and extract ticket IDs
    this.extractDependenciesLinks(lines, document, links);

    return links;
  }

  /**
   * Extract context.files links from frontmatter lines
   */
  private extractContextFilesLinks(
    lines: string[],
    document: vscode.TextDocument,
    links: vscode.DocumentLink[]
  ): void {
    let inContextFiles = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1; // Frontmatter starts at line 1, but we need to offset by frontmatter start

      // Check for context: section start
      if (line.trim().match(/^context:\s*$/)) {
        continue;
      }

      // Check for files: section start
      const filesMatch = line.match(/^\s+files:\s*$/);
      if (filesMatch) {
        inContextFiles = true;
        continue;
      }

      // Check for end of files array (next key at same or lower indentation)
      if (inContextFiles && line.match(/^\s+[a-z_]+:\s*/)) {
        inContextFiles = false;
        continue;
      }

      // Extract file paths from array items
      if (inContextFiles) {
        const pathMatch = line.match(/^\s+-\s+(.+?)\s*$/);
        if (pathMatch) {
          const filePath = pathMatch[1].trim();
          const charStart = line.indexOf(filePath);
          const charEnd = charStart + filePath.length;

          // Create link target
          let targetUri: vscode.Uri;

          // Check if it's an absolute path
          if (path.isAbsolute(filePath)) {
            targetUri = vscode.Uri.file(filePath);
          } else {
            // Relative path - resolve from workflow root
            targetUri = vscode.Uri.file(path.join(this.workflowRoot!, filePath));
          }

          // Verify file exists (optional, but provides better UX)
          if (fs.existsSync(targetUri.fsPath)) {
            const range = new vscode.Range(lineNum, charStart, lineNum, charEnd);
            const link = new vscode.DocumentLink(range, targetUri);
            link.tooltip = `Open file: ${filePath}`;
            links.push(link);
          }
        }
      }
    }
  }

  /**
   * Extract dependencies links from frontmatter lines
   */
  private extractDependenciesLinks(
    lines: string[],
    document: vscode.TextDocument,
    links: vscode.DocumentLink[]
  ): void {
    let inDependencies = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check for dependencies: section start
      const depsMatch = line.match(/^dependencies:\s*$/);
      if (depsMatch) {
        inDependencies = true;
        continue;
      }

      // Check for end of dependencies array (next top-level key)
      if (inDependencies && line.match(/^[a-z_]+:\s*/)) {
        inDependencies = false;
        continue;
      }

      // Extract ticket IDs from array items
      if (inDependencies) {
        const idMatch = line.match(/^\s+-\s+([A-Z]+-\d+)\s*$/);
        if (idMatch) {
          const ticketId = idMatch[1];
          const charStart = line.indexOf(ticketId);
          const charEnd = charStart + ticketId.length;

          // Find ticket in store to get its path
          const ticket = this.store.getTicketById(ticketId);
          if (ticket) {
            const ticketPath = path.join(
              this.workflowRoot!,
              '.workflow',
              'tickets',
              ticket.status,
              `${ticketId}.md`
            );

            if (fs.existsSync(ticketPath)) {
              const range = new vscode.Range(lineNum, charStart, lineNum, charEnd);
              const targetUri = vscode.Uri.file(ticketPath);
              const link = new vscode.DocumentLink(range, targetUri);
              link.tooltip = `Open ticket: ${ticketId} - ${ticket.title}`;
              links.push(link);
            }
          }
        }
      }
    }
  }
}

/**
 * DocumentLinkProvider for pipeline.yaml
 *
 * Makes the following clickable:
 * - skill: skill ID → open SKILL.md
 * - goto.stage: stage ID → go to stage definition
 */
export class PipelineDocumentLinkProvider implements vscode.DocumentLinkProvider {
  private workflowRoot: string | null = null;

  constructor(private readonly store: WorkflowStore) {}

  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root: string): void {
    this.workflowRoot = root;
  }

  /**
   * Provide document links for a pipeline.yaml file
   */
  provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    if (!this.workflowRoot) {
      return [];
    }

    const content = document.getText();
    const links: vscode.DocumentLink[] = [];

    try {
      const config = loadYaml(content) as PipelineConfig;

      if (!config?.pipeline?.stages) {
        return links;
      }

      const lines = content.split('\n');
      const stages = config.pipeline.stages;

      // Process each line looking for skill and goto.stage references
      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];

        // Look for skill: references
        this.extractSkillLinks(line, lineNum, stages, links);

        // Look for goto.stage: references
        this.extractGotoStageLinks(line, lineNum, stages, document, links);
      }
    } catch (error) {
      // YAML parsing failed - no links
      console.error('Failed to parse pipeline.yaml for document links:', error);
    }

    return links;
  }

  /**
   * Extract skill links from a line
   */
  private extractSkillLinks(
    line: string,
    lineNum: number,
    stages: Record<string, unknown>,
    links: vscode.DocumentLink[]
  ): void {
    // Match skill: "skill-id" or skill: skill-id
    const skillMatch = line.match(/skill:\s*["']?([a-z0-9-_]+)["']?/i);
    if (!skillMatch) {
      return;
    }

    const skillId = skillMatch[1];
    const skillIndex = line.indexOf(`skill:`);
    const valueStart = skillIndex + skillMatch.index! - skillIndex + 'skill:'.length;
    const valueMatch = line.substring(valueStart).match(/\s*["']?([a-z0-9-_]+)["']?/);

    if (!valueMatch) {
      return;
    }

    const actualStart = valueStart + valueMatch.index! + valueMatch[0].indexOf(skillId);
    const actualEnd = actualStart + skillId.length;

    // Find SKILL.md file for this skill
    const skillPath = path.join(
      this.workflowRoot!,
      '.workflow',
      'src',
      'skills',
      skillId,
      'SKILL.md'
    );

    if (fs.existsSync(skillPath)) {
      const range = new vscode.Range(lineNum, actualStart, lineNum, actualEnd);
      const targetUri = vscode.Uri.file(skillPath);
      const link = new vscode.DocumentLink(range, targetUri);
      link.tooltip = `Open skill: ${skillId}`;
      links.push(link);
    }
  }

  /**
   * Extract stage reference links from a line
   * Matches both `stage: <id>` (nested under goto) and shorthand `<status>: <stage-id>`
   */
  private extractGotoStageLinks(
    line: string,
    lineNum: number,
    stages: Record<string, unknown>,
    document: vscode.TextDocument,
    links: vscode.DocumentLink[]
  ): void {
    // Match stage: stage-id (nested under goto block)
    const stageMatch = line.match(/^\s+stage:\s*["']?([a-z0-9-_]+)["']?/i);
    if (!stageMatch) {
      return;
    }

    const stageId = stageMatch[1];

    // Check if stage exists in pipeline (skip non-stage values like "end")
    if (!stages[stageId]) {
      return;
    }

    // Find the line where this stage is defined
    const content = document.getText();
    const stageDefPattern = new RegExp(`^    ${stageId}:`, 'm');
    const defMatch = stageDefPattern.exec(content);

    if (defMatch) {
      const textBeforeMatch = content.substring(0, defMatch.index);
      const targetLine = textBeforeMatch.split('\n').length - 1;

      const valueIndex = line.indexOf(stageId, line.indexOf('stage:'));
      const range = new vscode.Range(lineNum, valueIndex, lineNum, valueIndex + stageId.length);
      const targetUri = document.uri.with({
        fragment: `L${targetLine + 1}`
      });

      const link = new vscode.DocumentLink(range, targetUri);
      link.tooltip = `Go to stage: ${stageId}`;
      links.push(link);
    }
  }
}

/**
 * Combined DocumentLinkProvider that delegates to specific providers
 */
export class WorkflowDocumentLinkProvider implements vscode.DocumentLinkProvider {
  private readonly ticketProvider: TicketDocumentLinkProvider;
  private readonly pipelineProvider: PipelineDocumentLinkProvider;

  constructor(store: WorkflowStore) {
    this.ticketProvider = new TicketDocumentLinkProvider(store);
    this.pipelineProvider = new PipelineDocumentLinkProvider(store);
  }

  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root: string): void {
    this.ticketProvider.setWorkflowRoot(root);
    this.pipelineProvider.setWorkflowRoot(root);
  }

  /**
   * Provide document links based on file type
   */
  provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    const fsPath = document.uri.fsPath;

    if (fsPath.endsWith('.md') && fsPath.includes(path.join('.workflow', 'tickets'))) {
      return this.ticketProvider.provideDocumentLinks(document);
    }

    if (fsPath.endsWith(path.join('.workflow', 'config', 'pipeline.yaml'))) {
      return this.pipelineProvider.provideDocumentLinks(document);
    }

    return [];
  }
}
