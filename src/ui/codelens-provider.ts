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
import { WorkflowStore } from '../data/workflow-store';
import { TicketService } from '../services/ticket-service';
import { DependencyService } from '../services/dependency-service';
import { Ticket, TicketStatus } from '../data/types';

/**
 * Status icon mapping for ticket status
 * @exported for testing
 */
export const STATUS_ICONS: Record<TicketStatus, string> = {
  [TicketStatus.Backlog]: '📋',
  [TicketStatus.Ready]: '✅',
  [TicketStatus.InProgress]: '🔄',
  [TicketStatus.Review]: '👀',
  [TicketStatus.Blocked]: '🚫',
  [TicketStatus.Done]: '✨'
};

/**
 * Status icon mapping for dependency status
 * @exported for testing
 */
export const DEP_STATUS_ICONS: Record<TicketStatus, string> = {
  [TicketStatus.Backlog]: '⬜',
  [TicketStatus.Ready]: '🔵',
  [TicketStatus.InProgress]: '🔷',
  [TicketStatus.Review]: '👁️',
  [TicketStatus.Blocked]: '🔴',
  [TicketStatus.Done]: '✅'
};

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

    const title = `${statusIcon} ${ticket.status} | ${vscode.l10n.t('Move')}: ${moveActions}`;

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
      parts.push(`${vscode.l10n.t('Deps')}: ${depsStr}`);
    }
    if (dependents.length > 0) {
      parts.push(`${vscode.l10n.t('Blocks')}: ${blocksStr}`);
    }
    if (planId) {
      parts.push(`${vscode.l10n.t('Plan')}: ${planId}`);
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
    frontmatterText: string
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

    const lastReview = lastReviewMatch[lastReviewMatch.length - 1];
    const statusMatch = lastReview.match(/([✅❌])\s*(passed|failed)/);
    if (!statusMatch) {
      return null;
    }

    const icon = statusMatch[1];
    const status = statusMatch[2];
    const totalReviews = lastReviewMatch.length;
    const passedReviews = lastReviewMatch.filter(r => r.includes('✅')).length;

    const title = `${vscode.l10n.t('Review')}: ${icon} ${status} (${passedReviews}/${totalReviews})`;

    const command: vscode.Command = {
      title,
      command: 'workflow.gotoReviewSection'
    };

    return new vscode.CodeLens(range, command);
  }
}

/**
 * WorkflowCodeLensProvider - Composite provider for all workflow files
 */
export class WorkflowCodeLensProvider implements vscode.CodeLensProvider {
  private readonly ticketProvider: TicketCodeLensProvider;

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
  }

  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root: string): void {
    this.ticketProvider.setWorkflowRoot(root);
  }

  /**
   * Provide CodeLenses based on document type
   */
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const fileName = document.fileName;

    // Ticket .md files
    const normalizedPath = fileName.replace(/\\/g, '/');
    if (normalizedPath.includes('.workflow/tickets/') && normalizedPath.endsWith('.md')) {
      return this.ticketProvider.provideCodeLenses(document);
    }

    return [];
  }
}
