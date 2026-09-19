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
import { WorkflowStore, StoreChangeEvent } from '../data/workflow-store';
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
  private stateChangeListener?: (state: PipelineState) => void;
  private stageChangeDisposable?: vscode.Disposable;
  private storeChangeListener?: (event: StoreChangeEvent) => void;
  private unsubscribeStoreChange?: () => void;

  /**
   * How many projects currently have a pipeline going.
   *
   * Within one project there is never more than one: the runner refuses a
   * second `workflow run` for the same root while a live lock exists. So a
   * count above 1 always means several workspace folders, and the status bar
   * says "projects", not "pipelines".
   */
  private activeProjectCount = 0;

  /** Details of the external run, for the tooltip when there is exactly one. */
  private externalTooltip: string | undefined;

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
    this.stateChangeListener = () => {
      this.render();
    };
    this.pipelineService.onStateChange(this.stateChangeListener);

    // Subscribe to pipeline stage changes (GOTO events)
    // onStageChange is a vscode.Event which returns a Disposable
    this.stageChangeDisposable = this.pipelineService.onStageChange(() => {
      this.render();
    });

    // Subscribe to store changes
    this.storeChangeListener = () => {
      this.render();
    };
    this.unsubscribeStoreChange = this.store.onDidChange(this.storeChangeListener);
  }

  /**
   * Report how many projects have an active pipeline (own or external).
   * Re-renders only when the number actually changed.
   */
  setActiveProjectCount(count: number, externalTooltip?: string): void {
    if (count === this.activeProjectCount && externalTooltip === this.externalTooltip) { return; }
    this.activeProjectCount = count;
    this.externalTooltip = externalTooltip;
    this.render();
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

      case PipelineState.Paused:
        this.statusBarItem.text = this.buildPausedText(currentStage, currentTicket);
        this.statusBarItem.tooltip = this.buildPausedTooltip(
          currentStage,
          currentAgent,
          currentTicket,
          retryCount,
          readyCount,
          blockedCount
        );
        this.statusBarItem.color = new vscode.ThemeColor('notificationsWarningIcon.foreground');
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

    // Свой запуск считается активным только в Running/Paused: после него
    // PipelineService остаётся в Completed/Error до следующего старта, и без
    // этой проверки внешний пайплайн не был бы виден вообще.
    const ownRunActive = pipelineState === PipelineState.Running || pipelineState === PipelineState.Paused;

    if (!ownRunActive && this.activeProjectCount >= 1) {
      // Своего запуска нет, но пайплайн идёт — показываем его, а не «Idle».
      this.statusBarItem.text = `$(zap) ${t('WF: external pipeline')}`;
      this.statusBarItem.tooltip = this.externalTooltip ?? t('A pipeline started outside the extension is running');
      this.statusBarItem.color = undefined;
    }

    // Пайплайны в других папках дописываются суффиксом, а не подменяют
    // состояние: `Paused` ждёт человека, `Error` требует внимания — счётчик
    // проектов их не важнее.
    if (this.activeProjectCount > 1) {
      this.statusBarItem.text = `${this.statusBarItem.text} $(zap) +${this.activeProjectCount - 1}`;
      const extra = t('Pipelines are running in {0} workspace folders', String(this.activeProjectCount));
      // Дописываем к уже собранному tooltip, а не заменяем его: у своего
      // запуска там стейдж, агент, тикет и счётчики — терять их ради счётчика
      // папок нельзя.
      const current = this.statusBarItem.tooltip;
      if (current instanceof vscode.MarkdownString) {
        current.appendMarkdown(`\n\n---\n\n${extra}`);
      } else if (typeof current === 'string' && current.length > 0) {
        this.statusBarItem.tooltip = [current, '', extra].join('\n');
      } else {
        this.statusBarItem.tooltip = extra;
      }
    }

    // Show the status bar item
    this.statusBarItem.show();
  }

  /**
   * Build text for paused state
   */
  private buildPausedText(
    stage: string | undefined,
    ticket: string | undefined
  ): string {
    const stageText = stage || t('unknown');
    const ticketText = ticket ? `| ${ticket}` : '';
    return `$(debug-pause) ${t('Paused')} | ${stageText}${ticketText}`;
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
   * Build tooltip for paused state
   */
  private buildPausedTooltip(
    stage: string | undefined,
    agent: string | undefined,
    ticket: string | undefined,
    retryCount: number,
    readyCount: number,
    blockedCount: number
  ): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${t('Workflow AI - Paused')}**\n\n`);
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

     // Remove event listeners
     if (this.stateChangeListener) {
       this.pipelineService.removeListener('stateChange', this.stateChangeListener);
     }
     if (this.stageChangeDisposable) {
       this.stageChangeDisposable.dispose();
     }
     this.unsubscribeStoreChange?.();

     this.stateChangeListener = undefined;
     this.stageChangeDisposable = undefined;
     this.storeChangeListener = undefined;
     this.unsubscribeStoreChange = undefined;
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
