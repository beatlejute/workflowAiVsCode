/**
 * StatusBar - VS Code StatusBarItem for pipeline state and ticket counters
 *
 * Displays pipeline execution state (idle/running/error) with counters
 * for Ready and Blocked tickets. Updates reactively via event subscriptions.
 *
 * ADR-005: Event-driven architecture for reactive UI updates
 */

import * as vscode from 'vscode';
import { t } from '../i18n';
import { PipelineService, PipelineState } from '../services/pipeline-service';
import { WorkflowStore } from '../data/workflow-store';
import { TicketStatus } from '../data/types';

/**
 * Status bar item controller
 *
 * Manages a StatusBarItem that displays pipeline state and ticket counters.
 * Subscribes to PipelineService.onStateChange and Store.onDidChange for reactive updates.
 */
export class StatusBar implements vscode.Disposable {
  private readonly statusBarItem: vscode.StatusBarItem;
  private readonly pipelineService: PipelineService;
  private readonly store: WorkflowStore;
  private readonly disposables: vscode.Disposable[] = [];

  /**
   * Create StatusBar controller
   * @param pipelineService - Service for pipeline state monitoring
   * @param store - Store for ticket data
   */
  constructor(pipelineService: PipelineService, store: WorkflowStore) {
    this.pipelineService = pipelineService;
    this.store = store;

    // Create status bar item (left side, high priority)
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100 // High priority
    );

    // Register click command
    this.statusBarItem.command = 'workflow.statusBarClick';

    // Subscribe to events
    this.subscribeToEvents();

    // Initial render
    this.render();
  }

  /**
   * Subscribe to pipeline and store events
   */
  private subscribeToEvents(): void {
    // Subscribe to pipeline state changes
    // PipelineService.onStateChange returns 'this' for chaining, so we just call it
    this.pipelineService.onStateChange(() => {
      this.render();
    });

    // Subscribe to store changes
    // WorkflowStore.onDidChange returns a function, we need to wrap it in a disposable
    const storeDisposable = this.store.onDidChange(() => {
      this.render();
    });
    this.disposables.push({ dispose: () => {
      // Store doesn't expose unsubscribe, so this is a no-op
      // The store uses EventEmitter which doesn't leak significantly
    } });
  }

  /**
   * Render status bar based on current state
   */
  private render(): void {
    const pipelineState = this.pipelineService.getState();
    const currentStage = this.pipelineService.getCurrentStage();
    const currentAgent = this.pipelineService.getCurrentAgent();
    const currentTicket = this.pipelineService.getCurrentTicket();
    const retryCount = this.pipelineService.getRetryCount();

    // Get ticket counters
    const readyCount = this.store.getTicketsByStatus(TicketStatus.Ready).length;
    const blockedCount = this.store.getTicketsByStatus(TicketStatus.Blocked).length;

    // Build status text and tooltip based on pipeline state
    switch (pipelineState) {
      case PipelineState.Idle:
        this.statusBarItem.text = `$(wf) ${t('WF: Idle')}`;
        this.statusBarItem.tooltip = this.buildIdleTooltip(readyCount, blockedCount);
        this.statusBarItem.color = undefined;
        break;

      case PipelineState.Running:
        this.statusBarItem.text = this.buildRunningText(currentStage, currentTicket, retryCount);
        this.statusBarItem.tooltip = this.buildRunningTooltip(
          currentStage,
          currentAgent,
          currentTicket,
          retryCount,
          readyCount,
          blockedCount
        );
        this.statusBarItem.color = undefined;
        break;

      case PipelineState.Error:
        this.statusBarItem.text = `$(error) ${t('WF: Error')}`;
        this.statusBarItem.tooltip = this.buildErrorTooltip(readyCount, blockedCount);
        this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');
        break;

      case PipelineState.Completed:
        this.statusBarItem.text = `$(check) ${t('WF: Completed')}`;
        this.statusBarItem.tooltip = this.buildCompletedTooltip(readyCount, blockedCount);
        this.statusBarItem.color = undefined;
        break;
    }

    // Show the status bar item
    this.statusBarItem.show();
  }

  /**
   * Build text for running state
   */
  private buildRunningText(
    stage: string | undefined,
    ticket: string | undefined,
    retryCount: number
  ): string {
    const stageText = stage || t('unknown');
    const ticketText = ticket ? `| ${ticket}` : '';
    const retryText = retryCount > 0 ? ` (retry: ${retryCount})` : '';

    return `$(loading~spin) ${t('WF: Running')} | ${stageText}${ticketText}${retryText}`;
  }

  /**
   * Build tooltip for idle state
   */
  private buildIdleTooltip(readyCount: number, blockedCount: number): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${t('Workflow AI - Idle')}**\n\n`);
    tooltip.appendMarkdown('---\n\n');
    tooltip.appendMarkdown(`**${t('Ticket Counters')}**\n\n`);
    tooltip.appendMarkdown(`- ${t('Ready')}: ${readyCount}\n`);
    tooltip.appendMarkdown(`- ${t('Blocked')}: ${blockedCount}\n\n`);
    tooltip.appendMarkdown(t('Click to open command palette.'));

    return tooltip;
  }

  /**
   * Build tooltip for running state
   */
  private buildRunningTooltip(
    stage: string | undefined,
    agent: string | undefined,
    ticket: string | undefined,
    retryCount: number,
    readyCount: number,
    blockedCount: number
  ): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${t('Workflow AI - Running')}**\n\n`);
    tooltip.appendMarkdown('---\n\n');
    tooltip.appendMarkdown(`**${t('Current Execution')}**\n\n`);

    if (stage) {
      tooltip.appendMarkdown(`- ${t('Stage')}: \`${stage}\`\n`);
    }
    if (agent) {
      tooltip.appendMarkdown(`- ${t('Agent')}: \`${agent}\`\n`);
    }
    if (ticket) {
      tooltip.appendMarkdown(`- ${t('Ticket')}: \`${ticket}\`\n`);
    }
    if (retryCount > 0) {
      tooltip.appendMarkdown(`- ${t('Retry')}: ${retryCount}\n`);
    }

    tooltip.appendMarkdown(`\n**${t('Ticket Counters')}**\n\n`);
    tooltip.appendMarkdown(`- ${t('Ready')}: ${readyCount}\n`);
    tooltip.appendMarkdown(`- ${t('Blocked')}: ${blockedCount}\n\n`);
    tooltip.appendMarkdown(t('Click to open command palette.'));

    return tooltip;
  }

  /**
   * Build tooltip for error state
   */
  private buildErrorTooltip(readyCount: number, blockedCount: number): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${t('Workflow AI - Error')}**\n\n`);
    tooltip.appendMarkdown(`$(error) ${t('Pipeline execution failed')}\n\n`);
    tooltip.appendMarkdown('---\n\n');
    tooltip.appendMarkdown(`**${t('Ticket Counters')}**\n\n`);
    tooltip.appendMarkdown(`- ${t('Ready')}: ${readyCount}\n`);
    tooltip.appendMarkdown(`- ${t('Blocked')}: ${blockedCount}\n\n`);
    tooltip.appendMarkdown(t('Click to open command palette.'));

    return tooltip;
  }

  /**
   * Build tooltip for completed state
   */
  private buildCompletedTooltip(readyCount: number, blockedCount: number): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${t('Workflow AI - Completed')}**\n\n`);
    tooltip.appendMarkdown(`$(check) ${t('Pipeline execution completed successfully')}\n\n`);
    tooltip.appendMarkdown('---\n\n');
    tooltip.appendMarkdown(`**${t('Ticket Counters')}**\n\n`);
    tooltip.appendMarkdown(`- ${t('Ready')}: ${readyCount}\n`);
    tooltip.appendMarkdown(`- ${t('Blocked')}: ${blockedCount}\n\n`);
    tooltip.appendMarkdown(t('Click to open command palette.'));

    return tooltip;
  }

  /**
   * Show the status bar item
   */
  show(): void {
    this.statusBarItem.show();
  }

  /**
   * Hide the status bar item
   */
  hide(): void {
    this.statusBarItem.hide();
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.statusBarItem.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }
}

/**
 * Initialize and register StatusBar
 * @param context - Extension context for disposables
 * @param pipelineService - Pipeline service instance
 * @param store - Workflow store instance
 */
export function activateStatusBar(
  context: vscode.ExtensionContext,
  pipelineService: PipelineService,
  store: WorkflowStore
): void {
  const statusBar = new StatusBar(pipelineService, store);
  context.subscriptions.push(statusBar);
}
