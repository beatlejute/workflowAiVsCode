/**
 * CodeLensProvider - Code lenses for workflow ticket .md files
 *
 * Provides CodeLens implementations for .md tickets:
 * - Line 1: Status + Move actions (dynamic based on state machine)
 * - Line 2: Dependencies + Plan
 * - Line 3: Review status (if present)
 *
 * Features:
 * - Dynamic Move actions based on valid state transitions
 * - Clickable dependency IDs that open ticket files
 * - Clickable plan ID that opens plan file
 * - Review status with pass/fail indicator
 *
 * ADR-006: VS Code CodeLens API for inline actions
 */

import * as vscode from 'vscode';
import { t } from '../i18n';
import * as path from 'path';
import { load as loadYaml } from 'js-yaml';
import { WorkflowStore } from '../data/workflow-store';
import { TicketService } from '../services/ticket-service';
import { DependencyService } from '../services/dependency-service';
import { Ticket } from '../data/types';
import { STATUS_ICONS, DEP_STATUS_ICONS } from '../constants/ticket-constants';
import { PipelineCodeLensProvider } from './pipeline-codelens-provider';

/**
 * CodeLensProvider for .md ticket files
 *
 * Provides three lines of CodeLens:
 * 1. Status + Move actions
 * 2. Dependencies + Plan
 * 3. Review status (if present)
 */
export class TicketCodeLensProvider implements vscode.CodeLensProvider {
  private readonly store: WorkflowStore;
  private readonly ticketService: TicketService;
  private readonly dependencyService: DependencyService;
  private workflowRoot: string | null = null;

  constructor(
    store: WorkflowStore,
    ticketService: TicketService,
    dependencyService: DependencyService
  ) {
    this.store = store;
    this.ticketService = ticketService;
    this.dependencyService = dependencyService;
  }

  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root: string): void {
    this.workflowRoot = root;
  }

  /**
   * Provide CodeLenses for a ticket .md file
   */
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!this.workflowRoot) {
      return [];
    }

    const content = document.getText();
    const lenses: vscode.CodeLens[] = [];

    // Parse frontmatter to get ticket data
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch) {
      return [];
    }

    const frontmatterText = frontmatterMatch[1];
    const idMatch = frontmatterText.match(/^id:\s*["']?([A-Z]+-\d+)["']?/m);
    if (!idMatch) {
      return [];
    }

    const ticketId = idMatch[1];
    const ticket = this.store.getTicketById(ticketId);
    if (!ticket) {
      return [];
    }

    // Line 1: Status + Move actions
    const statusLens = this.createStatusLens(document, ticket);
    if (statusLens) {
      lenses.push(statusLens);
    }

    // Line 2: Dependencies + Plan
    const depsLenses = this.createDependenciesLenses(document, ticket);
    lenses.push(...depsLenses);

    // Line 3: Review status (if present)
    const reviewLens = this.createReviewLens(document, frontmatterText);
    if (reviewLens) {
      lenses.push(reviewLens);
    }

    return lenses;
  }

  /**
   * Create CodeLens for status line with Move actions
   * Format: {status_icon} {status} | Move: [ready] [review] [done] [blocked]
   */
  private createStatusLens(
    document: vscode.TextDocument,
    ticket: Ticket
  ): vscode.CodeLens | null {
    const range = new vscode.Range(0, 0, 0, 0);
    const statusIcon = STATUS_ICONS[ticket.status] || '📄';
    const validTransitions = this.ticketService.getValidTransitions(ticket.status);

    // Build Move actions
    const moveActions = validTransitions
      .map(status => `[${status}]`)
      .join(' ');

    const title = `${statusIcon} ${ticket.status} | ${t('Move')}: ${moveActions}`;

    // Create command that opens QuickPick for move
    const command: vscode.Command = {
      title,
      command: 'workflow.moveTicket',
      arguments: [ticket.id]
    };

    return new vscode.CodeLens(range, command);
  }

  /**
   * Create CodeLenses for dependencies and plan
   * Format: Deps: {dep1_id} {status_icon} | Blocks: {dep2_id} | Plan: {plan_id}
   */
  private createDependenciesLenses(
    document: vscode.TextDocument,
    ticket: Ticket
  ): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    const range = new vscode.Range(1, 0, 1, 0);

    // Get dependencies
    const dependencies = this.dependencyService.getDependencies(ticket.id);
    const depsStr = dependencies
      .map(dep => `${dep.id} ${DEP_STATUS_ICONS[dep.status] || '⬜'}`)
      .join(' ');

    // Get tickets that depend on this one (blocks)
    const dependents = this.dependencyService.getDependents(ticket.id);
    const blocksStr = dependents
      .map(dep => `${dep.id}`)
      .join(' ');

    // Get plan
    const planId = ticket.parent_plan || '';

    // Build title
    const parts: string[] = [];
    if (dependencies.length > 0) {
      parts.push(`${t('Deps')}: ${depsStr}`);
    }
    if (dependents.length > 0) {
      parts.push(`${t('Blocks')}: ${blocksStr}`);
    }
    if (planId) {
      parts.push(`${t('Plan')}: ${planId}`);
    }

    if (parts.length === 0) {
      return lenses;
    }

    const title = parts.join(' | ');

    // Create command to show dependencies view
    const command: vscode.Command = {
      title,
      command: 'workflow.showDependencies',
      arguments: [ticket.id]
    };

    lenses.push(new vscode.CodeLens(range, command));

    return lenses;
  }

  /**
   * Create CodeLens for review status
   * Format: Review: ✅ passed (3/3) or Review: ❌ failed (1/3)
   */
  private createReviewLens(
    document: vscode.TextDocument,
    _frontmatterText: string
  ): vscode.CodeLens | null {
    const range = new vscode.Range(2, 0, 2, 0);
    const content = document.getText();

    // Try to find review section in body
    const bodyReviewMatch = content.match(/## Review[\s\S]*?\|.*\|/);
    if (!bodyReviewMatch) {
      return null;
    }

    // Parse review table
    const reviewTable = bodyReviewMatch[0];
    const lastReviewMatch = reviewTable.match(/\| ([^|]+) \| ([✅❌])\s*(passed|failed) \|/g);
    if (!lastReviewMatch || lastReviewMatch.length === 0) {
      return null;
    }

    // Find the review with the latest date, not just the last row
    let latestReview = lastReviewMatch[0];
    let latestDate = '';
    for (const review of lastReviewMatch) {
      const dateMatch = review.match(/\|\s*(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?)\s*\|/);
      if (dateMatch && dateMatch[1] > latestDate) {
        latestDate = dateMatch[1];
        latestReview = review;
      }
    }
    const statusMatch = latestReview.match(/([✅❌])\s*(passed|failed)/);
    if (!statusMatch) {
      return null;
    }

    const icon = statusMatch[1];
    const status = statusMatch[2];
    const totalReviews = lastReviewMatch.length;
    const passedReviews = lastReviewMatch.filter(r => r.includes('✅')).length;

    const title = `${t('Review')}: ${icon} ${status} (${passedReviews}/${totalReviews})`;

    const command: vscode.Command = {
      title,
      command: 'workflow.gotoReviewSection'
    };

    return new vscode.CodeLens(range, command);
  }
}

/**
 * ConfigCodeLensProvider - Code lenses for config.yaml
 *
 * Provides CodeLens implementations for config.yaml:
 * - Project info: Project: {name} | {N} task types | {M} priorities
 *
 * Features:
 * - Parse YAML via loadYaml
 * - Extract project name, count task types and priorities
 */
export class ConfigCodeLensProvider implements vscode.CodeLensProvider {
  private workflowRoot: string | null = null;
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root: string): void {
    this.workflowRoot = root;
  }

  /**
   * Refresh code lenses when config.yaml changes
   */
  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  /**
   * Provide CodeLenses for a config.yaml file
   */
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!this.workflowRoot) {
      return [];
    }

    const fileName = path.basename(document.fileName);
    if (fileName !== 'config.yaml') {
      return [];
    }

    const content = document.getText();
    const lenses: vscode.CodeLens[] = [];

    try {
      const config = loadYaml(content) as ConfigYaml;

      if (!config) {
        return lenses;
      }

      // Find first line position
      const firstLine = new vscode.Position(0, 0);

      // Create Project info CodeLens
      const infoLens = this.createInfoLens(firstLine, config);
      if (infoLens) {
        lenses.push(infoLens);
      }
    } catch (error) {
      // YAML parsing failed - no lenses
      console.error('Failed to parse config.yaml for code lenses:', error);
    }

    return lenses;
  }

  /**
   * Create CodeLens with project info
   * Format: Project: {name} | {N} task types | {M} priorities
   */
  private createInfoLens(
    position: vscode.Position,
    config: ConfigYaml
  ): vscode.CodeLens | null {
    const range = new vscode.Range(position, position);

    const projectName = config.project?.name || 'Untitled';
    const taskTypesCount = Object.keys(config.task_types || {}).length;
    const prioritiesCount = Object.keys(config.priorities || {}).length;

    const title = `Project: ${projectName} | ${taskTypesCount} task types | ${prioritiesCount} priorities`;

    const command: vscode.Command = {
      title,
      command: 'workflow.openConfig'
    };

    return new vscode.CodeLens(range, command);
  }
}

interface ConfigYaml {
  project?: {
    name?: string;
    description?: string;
    created_at?: string;
  };
  task_types?: Record<string, unknown>;
  priorities?: Record<string, unknown>;
  statuses?: Record<string, unknown>;
  condition_types?: Record<string, unknown>;
  paths?: Record<string, string>;
  reporting?: Record<string, unknown>;
  version?: string;
}

/**
 * PlanCodeLensProvider - Code lenses for plan .md files
 *
 * Provides CodeLens implementations for plan files:
 * - .workflow/plans/{@link *.md}: "Decompose Plan" action
 * - plans/*.md (workspace root): "Create Workflow Plan" action
 */
export class PlanCodeLensProvider implements vscode.CodeLensProvider {
  private workflowRoot: string | null = null;

  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root: string): void {
    this.workflowRoot = root;
  }

  /**
   * Extract plan status from document frontmatter
   * Returns status string or undefined if not found
   */
  private extractPlanStatus(document: vscode.TextDocument): string | undefined {
    const content = document.getText();
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch) {
      return undefined;
    }

    const frontmatterText = frontmatterMatch[1];
    const statusMatch = frontmatterText.match(/^status:\s*["']?([a-zA-Z-]+)["']?/m);
    return statusMatch ? statusMatch[1] : undefined;
  }

  /**
   * Provide CodeLenses for a plan .md file
   */
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!this.workflowRoot) {
      return [];
    }

    const fileName = document.fileName;
    const normalizedPath = fileName.replace(/\\/g, '/');
    const lenses: vscode.CodeLens[] = [];

    // Check if it's a plan file in .workflow/plans/
    const isWorkflowPlan = normalizedPath.includes('/.workflow/plans/') && normalizedPath.endsWith('.md');
    
    // Check if it's a plan file in workspace root plans/ (but NOT .workflow/plans/)
    const isRootPlan = !normalizedPath.includes('/.workflow/') && 
                       /\/plans\/[^/]+\.md$/.test(normalizedPath);

    if (isWorkflowPlan) {
      // Extract planId from filename (e.g., PLAN-013.md → PLAN-013, PLAN-TEST-001.md → PLAN-TEST-001)
      const fileNameOnly = path.basename(fileName);
      const planIdMatch = fileNameOnly.match(/^([A-Z]+(?:-[A-Z]+)*-\d+)\.md$/);
      if (planIdMatch) {
        const planId = planIdMatch[1];
        const range = new vscode.Range(0, 0, 0, 0);
        const title = `$(symbol-method) ${t('Decompose Plan')}`;

        const command: vscode.Command = {
          title,
          command: 'workflow.decomposePlan',
          arguments: [planId]
        };

        lenses.push(new vscode.CodeLens(range, command));

        // Add "Run Pipeline" CodeLens for approved plans
        const planStatus = this.extractPlanStatus(document);
        if (!planStatus || planStatus === 'approved') {
          const runPipelineLens = new vscode.CodeLens(range, {
            title: '$(play) Run Pipeline',
            command: 'workflow.runPipelineForPlan',
            arguments: [planId]
          });
          lenses.push(runPipelineLens);
        }
      }
    } else if (isRootPlan) {
      // Root plan file - "Create Workflow Plan" action
      const range = new vscode.Range(0, 0, 0, 0);
      const title = `$(add) ${t('Create Workflow Plan')}`;
      
      const command: vscode.Command = {
        title,
        command: 'workflow.createPlanFromFile',
        arguments: [document.uri]
      };
      
      lenses.push(new vscode.CodeLens(range, command));
    }

    return lenses;
  }
}

/**
 * WorkflowCodeLensProvider - Composite provider for all workflow files
 */
export class WorkflowCodeLensProvider implements vscode.CodeLensProvider {
  private readonly ticketProvider: TicketCodeLensProvider;
  private readonly pipelineProvider: PipelineCodeLensProvider;
  private readonly configProvider: ConfigCodeLensProvider;
  private readonly planProvider: PlanCodeLensProvider;

  constructor(
    store: WorkflowStore,
    ticketService: TicketService,
    dependencyService: DependencyService
  ) {
    this.ticketProvider = new TicketCodeLensProvider(
      store,
      ticketService,
      dependencyService
    );
    this.pipelineProvider = new PipelineCodeLensProvider();
    this.configProvider = new ConfigCodeLensProvider();
    this.planProvider = new PlanCodeLensProvider();
  }

  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root: string): void {
    this.ticketProvider.setWorkflowRoot(root);
    this.pipelineProvider.setWorkflowRoot(root);
    this.configProvider.setWorkflowRoot(root);
    this.planProvider.setWorkflowRoot(root);
  }

  /**
   * Provide CodeLenses based on document type
   */
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const fileName = document.fileName;
    const normalizedPath = fileName.replace(/\\/g, '/');

    // Ticket .md files
    if (normalizedPath.includes('.workflow/tickets/') && normalizedPath.endsWith('.md')) {
      return this.ticketProvider.provideCodeLenses(document);
    }

    // Plan .md files in .workflow/plans/ or root plans/
    if ((normalizedPath.includes('/.workflow/plans/') || 
         (!normalizedPath.includes('/.workflow/') && /\/plans\/[^/]+\.md$/.test(normalizedPath))) && 
        normalizedPath.endsWith('.md')) {
      return this.planProvider.provideCodeLenses(document);
    }

    // pipeline.yaml
    if (normalizedPath.includes('.workflow/config/pipeline.yaml')) {
      return this.pipelineProvider.provideCodeLenses(document);
    }

    // config.yaml
    if (normalizedPath.includes('.workflow/config/config.yaml')) {
      return this.configProvider.provideCodeLenses(document);
    }

    return [];
  }
}
