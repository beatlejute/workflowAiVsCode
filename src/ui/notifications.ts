/**
 * Notifications - VS Code notifications for pipeline and ticket events
 *
 * Provides user notifications for:
 * - Ticket completed (transition to done)
 * - Ticket blocked (transition to blocked)
 * - Pipeline error
 * - Pipeline completed
 *
 * Subscribes to Store.onDidChange and PipelineService.onStateChange
 */

import * as vscode from 'vscode';
import { t } from '../i18n';
import { WorkflowStore, StoreChangeEvent } from '../data/workflow-store';
import { PipelineService, PipelineState } from '../services/pipeline-service';
import { Ticket, TicketStatus } from '../data/types';
import * as path from 'path';

/**
 * Ticket transition types for notification tracking
 */
interface TicketTransition {
  ticketId: string;
  fromStatus: TicketStatus;
  toStatus: TicketStatus;
}

/**
 * Notifications manager - handles all VS Code notifications
 *
 * Subscribes to store and pipeline events to show contextual notifications.
 */
export class NotificationsManager {
  private store: WorkflowStore;
  private pipelineService: PipelineService;
  private workflowRoot: string | null = null;
  private ticketStatusCache: Map<string, TicketStatus> = new Map();
  private humanGateNotificationDedup: Map<string, true> = new Map();
  private storeChangeListener?: (event: StoreChangeEvent) => void;
  private stateChangeListener?: (state: PipelineState) => void;
  private manualGateListener?: (data: { stage: string | undefined; ticketId: string | undefined }) => void;
  private unsubscribeStoreChange?: () => void;

  /**
   * Create NotificationsManager
   * @param store - WorkflowStore for ticket tracking
   * @param pipelineService - PipelineService for pipeline state tracking
   */
  constructor(store: WorkflowStore, pipelineService: PipelineService) {
    this.store = store;
    this.pipelineService = pipelineService;
  }

  /**
   * Initialize notifications - subscribe to all events
   */
  initialize(): void {
    // Subscribe to store changes for ticket transitions
    this.storeChangeListener = (event) => {
      if (event.type === 'ticket' && event.operation === 'add' && event.id) {
        // Cache status for newly added tickets
        const ticket = this.store.getTicketById(event.id);
        if (ticket) {
          this.ticketStatusCache.set(ticket.id, ticket.status);
        }
      }
      if (event.type === 'ticket' && event.operation === 'update') {
        this.handleTicketUpdate(event.id!);
      }
    };
    this.unsubscribeStoreChange = this.store.onDidChange(this.storeChangeListener);

    // Subscribe to pipeline state changes
    this.stateChangeListener = (state) => {
      this.handlePipelineStateChange(state);
    };
    this.pipelineService.onStateChange(this.stateChangeListener);

    // Subscribe to manual gate activation events
    this.manualGateListener = ({ stage, ticketId }) => {
      if (stage === 'manual-gate-human') {
        this.showHumanGatePendingNotification(ticketId);
      }
    };
    this.pipelineService.onManualGateActivated(this.manualGateListener);

    // Reset dedup map on each initialization (simulates window reload behavior)
    this.humanGateNotificationDedup = new Map();

    // Initialize cache with current ticket statuses
    this.initializeCache();
  }

  /**
   * Initialize ticket status cache from store
   */
  private initializeCache(): void {
    const tickets = this.store.getTickets();
    for (const ticket of tickets) {
      this.ticketStatusCache.set(ticket.id, ticket.status);
    }
  }

  /**
   * Handle ticket update - detect transitions to done/blocked
   */
  private handleTicketUpdate(ticketId: string): void {
    const ticket = this.store.getTicketById(ticketId);
    if (!ticket) {
      return;
    }

    const previousStatus = this.ticketStatusCache.get(ticketId);
    const currentStatus = ticket.status;

    // Update cache
    this.ticketStatusCache.set(ticketId, currentStatus);

    // Detect transition
    if (previousStatus && previousStatus !== currentStatus) {
      const transition: TicketTransition = {
        ticketId,
        fromStatus: previousStatus,
        toStatus: currentStatus
      };

      this.handleTicketTransition(transition, ticket);
    }
  }

  /**
   * Handle ticket transition - show appropriate notification
   */
  private handleTicketTransition(transition: TicketTransition, ticket: Ticket): void {
    // Ticket completed (transition to done)
    if (transition.toStatus === TicketStatus.Done) {
      this.showTicketCompletedNotification(transition.ticketId, ticket);
    }

    // Ticket blocked (transition to blocked)
    if (transition.toStatus === TicketStatus.Blocked) {
      this.showTicketBlockedNotification(transition.ticketId, ticket);
    }
  }

  /**
   * Handle pipeline state change - show notifications for error/completed
   */
  private handlePipelineStateChange(state: PipelineState): void {
    switch (state) {
      case PipelineState.Error:
        this.showPipelineErrorNotification();
        break;
      case PipelineState.Completed:
        this.showPipelineCompletedNotification();
        break;
    }
  }

  /**
   * Show ticket completed notification
   * @param ticketId - Ticket ID
   * @param _ticket - Ticket data
   */
  private showTicketCompletedNotification(ticketId: string, _ticket: Ticket): void {
    const message = t('Ticket {0} completed', ticketId);

    vscode.window.showInformationMessage(message, t('Open')).then((selection) => {
      if (selection === 'Open') {
        this.openTicketFile(ticketId, TicketStatus.Done);
      }
    });
  }

  /**
   * Show ticket blocked notification
   * @param ticketId - Ticket ID
   * @param _ticket - Ticket data
   */
  private showTicketBlockedNotification(ticketId: string, _ticket: Ticket): void {
    let message: string;
    const reason = _ticket.auto_blocked_reason;
    const attempts = _ticket.auto_blocked_attempts;

    if (reason === 'max_review_attempts') {
      message = t('Ticket {0} auto-blocked after {1} review attempts', ticketId, attempts ?? 0);
    } else if (reason === 'human_gate_rejected' || reason === 'human_gate_timeout') {
      message = t('Human ticket {0} rejected ({1})', ticketId, reason);
    } else {
      message = t('Ticket {0} is blocked', ticketId);
    }

    vscode.window.showWarningMessage(message, t('Details')).then((selection) => {
      if (selection === 'Details') {
        this.openTicketFile(ticketId, TicketStatus.Blocked);
      }
    });
  }

  /**
   * Show pipeline error notification
   */
  private showPipelineErrorNotification(): void {
    const message = t('Pipeline error occurred');

    vscode.window.showErrorMessage(message, t('View Log')).then((selection) => {
      if (selection === 'View Log') {
        this.showPipelineOutput();
      }
    });
  }

  /**
   * Show pipeline completed notification
   */
  private showPipelineCompletedNotification(): void {
    const message = t('Pipeline completed successfully');

    vscode.window.showInformationMessage(message, t('Report')).then((selection) => {
      if (selection === 'Report') {
        this.openLatestReport();
      }
    });
  }

  /**
   * Open ticket file in editor
   */
  private async openTicketFile(ticketId: string, status: TicketStatus): Promise<void> {
    if (!this.workflowRoot) {
      vscode.window.showErrorMessage(t('Workflow root not available'));
      return;
    }

    const ticketPath = path.join(
      this.workflowRoot,
      '.workflow',
      'tickets',
      status,
      `${ticketId}.md`
    );

    try {
      await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(ticketPath));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(t('Failed to open ticket: {0}', message));
    }
  }

  /**
   * Show pipeline output channel
   */
  private showPipelineOutput(): void {
    // Pipeline output is shown via PipelineTreeProvider's OutputChannel
    // This command triggers the showOutput method
    vscode.commands.executeCommand('workflow.showPipelineOutput');
  }

  /**
   * Open latest report file
   */
  private async openLatestReport(): Promise<void> {
    if (!this.workflowRoot) {
      vscode.window.showErrorMessage(t('Workflow root not available'));
      return;
    }

    const reports = this.store.getReports();
    if (reports.length === 0) {
      vscode.window.showInformationMessage(t('No reports available'));
      return;
    }

    // Sort by created_at descending and get the latest
    const latestReport = reports
      .filter(r => r.created_at)
      .sort((a, b) => {
        const dateA = new Date(a.created_at!).getTime();
        const dateB = new Date(b.created_at!).getTime();
        return dateB - dateA;
      })[0];

    if (!latestReport) {
      vscode.window.showInformationMessage(t('No reports with date available'));
      return;
    }

    const reportPath = path.join(
      this.workflowRoot,
      '.workflow',
      'reports',
      `${latestReport.id}.md`
    );

    try {
      await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(reportPath));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(t('Failed to open report: {0}', message));
    }
  }

  /**
   * Show human gate pending notification with deduplication
   * @param ticketId - Optional ticket ID
   */
  showHumanGatePendingNotification(ticketId: string | undefined): void {
    // Dedup: key = ticketId_stage_hourBucket
    const hourBucket = Math.floor(Date.now() / 3_600_000);
    const dedupKey = `${ticketId || 'undefined'}_manual-gate-human_${hourBucket}`;
    if (this.humanGateNotificationDedup.has(dedupKey)) {
      return;
    }
    this.humanGateNotificationDedup.set(dedupKey, true);

    // Determine message
    const message = ticketId
      ? t('Human ticket {0} ready for manual execution', ticketId)
      : t('Pipeline is waiting for manual intervention');

    // Build actions
    const actions: string[] = [];
    const actionResults: { [key: string]: () => void } = {};

    if (ticketId) {
      actions.push(t('Open'));
      actionResults[t('Open')] = () => {
        const ticketUri = `.workflow/tickets/ready/${ticketId}.md`;
        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(path.join(this.workflowRoot || '', ticketUri)));
      };
    }

    actions.push(t('Move to review'));
    actionResults[t('Move to review')] = () => {
      if (ticketId) {
        vscode.commands.executeCommand('workflow.moveTicket', { id: ticketId, target: 'review' });
      }
    };

    vscode.window.showInformationMessage(message, ...actions).then((selection) => {
      if (selection && actionResults[selection]) {
        actionResults[selection]();
      }
    });
  }

  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root: string | null): void {
    this.workflowRoot = root;
  }

  /**
   * Dispose resources
   */
   dispose(): void {
     // Remove event listeners
     this.unsubscribeStoreChange?.();
     if (this.stateChangeListener) {
       this.pipelineService.removeListener('stateChange', this.stateChangeListener);
     }
     if (this.manualGateListener) {
       this.pipelineService.removeListener('manual-gate-activated', this.manualGateListener);
     }

     this.storeChangeListener = undefined;
     this.unsubscribeStoreChange = undefined;
     this.stateChangeListener = undefined;
     this.manualGateListener = undefined;
   }
}
