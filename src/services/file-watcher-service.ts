/**
 * FileWatcherService - Reactive file system monitoring for workflow data
 *
 * Monitors .workflow directory for external changes (wf CLI, AI-agents)
 * and automatically updates WorkflowStore with debounced batch updates.
 *
 * ADR-005: FileWatcher → Store → EventEmitter → UI
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { WorkflowStore } from '../data/workflow-store';
import { TicketStatus } from '../data/types';
import { IFileWatcher } from '../interfaces/IFileWatcher';

/**
 * Change classification result
 */
interface ClassifiedChange {
  entityType: 'ticket' | 'plan' | 'report' | 'config' | 'plan-template';
  id?: string;
  status?: TicketStatus;
}

/**
 * FileWatcherService - Reactive bridge between file system and WorkflowStore
 *
 * Monitors .workflow directory for changes and updates store incrementally.
 * Implements debounce to prevent cascading updates from rapid file changes.
 */
export class FileWatcherService implements vscode.Disposable, IFileWatcher {
  private readonly store: WorkflowStore;
  private readonly workflowRoot: string;
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private debounceTimer: NodeJS.Timeout | undefined;
  private isOwnWrite = false;
  private readonly debounceDelayChange = 300; // ms for change events
  private readonly debounceDelayCreateDelete = 100; // ms for create/delete events
  private readonly incrementalRefresh: boolean = true;

  /**
   * Create FileWatcherService
   * @param store - WorkflowStore to update on file changes
   * @param workflowRoot - Root directory of the workflow project
   */
  constructor(store: WorkflowStore, workflowRoot: string, incrementalRefresh: boolean = true) {
    this.store = store;
    this.workflowRoot = workflowRoot;
    this.incrementalRefresh = incrementalRefresh;
    this.createWatcher();
  }

  /**
   * Create and configure FileSystemWatcher
   * Pattern: glob pattern for .workflow directory with md, yaml, yml extensions
   */
  private createWatcher(): void {
    const pattern = new vscode.RelativePattern(
      this.workflowRoot,
      '**/*.{md,yaml,yml}'
    );

    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      pattern,
      false, // ignoreCreateEvents
      false, // ignoreChangeEvents
      false  // ignoreDeleteEvents
    );

    // Subscribe to file system events
    this.fileWatcher.onDidCreate(uri => this.handleFileCreate(uri));
    this.fileWatcher.onDidChange(uri => this.handleFileChange(uri));
    this.fileWatcher.onDidDelete(uri => this.handleFileDelete(uri));
  }

  /**
   * Schedule a debounced refresh
   * Resets timer on each call, executes after specified delay
   */
  private scheduleRefresh(delay: number): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.performRefresh();
    }, delay);
  }

  /**
   * Perform the actual store refresh
   */
  private async performRefresh(): Promise<void> {
    try {
      await this.store.refresh(this.workflowRoot);
    } catch (error) {
      console.error('FileWatcherService: Failed to refresh store:', error);
    }
  }

  /**
   * Classify file change based on URI path
   * Maps file path to entity type and ID
   */
  private classifyChange(uri: vscode.Uri): ClassifiedChange {
    const relativePath = path.relative(this.workflowRoot, uri.fsPath);
    const pathParts = relativePath.split(path.sep);

    // Check for tickets: tickets/{status}/{ID}.md
    if (pathParts[0] === 'tickets' && pathParts.length >= 3) {
      const status = pathParts[1] as TicketStatus;
      const fileName = pathParts[2];
      const id = fileName.replace('.md', '');

      // Validate status
      const validStatuses = Object.values(TicketStatus);
      if (validStatuses.includes(status)) {
        return { entityType: 'ticket', id, status };
      }
    }

    // Check for plans: plans/current/{ID}.md or plans/archive/{ID}.md
    if (pathParts[0] === 'plans' && pathParts.length >= 3) {
      const fileName = pathParts[2];
      const id = fileName.replace('.md', '');
      return { entityType: 'plan', id };
    }

    // Check for plan templates: plans/templates/{ID}.md
    if (pathParts[0] === 'plans' && pathParts[1] === 'templates' && pathParts.length >= 3) {
      const fileName = pathParts[2];
      const id = fileName.replace('.md', '');
      return { entityType: 'plan-template', id };
    }

    // Check for reports: reports/{ID}.md
    if (pathParts[0] === 'reports' && pathParts.length >= 2) {
      const fileName = pathParts[1];
      const id = fileName.replace('.md', '');
      return { entityType: 'report', id };
    }

    // Check for config files
    if (pathParts[0] === 'config') {
      return { entityType: 'config' };
    }

    // Default: full refresh
    return { entityType: 'config' };
  }

  /**
   * Handle file creation event
   */
  private async handleFileCreate(uri: vscode.Uri): Promise<void> {
    if (this.isOwnWrite) {
      return;
    }

    console.log(`[FileWatcher] CREATE: ${uri.fsPath}`);
    const classification = this.classifyChange(uri);

    if (this.incrementalRefresh && classification.id) {
      if (classification.entityType === 'ticket' || classification.entityType === 'plan' || classification.entityType === 'report') {
        await this.store.updateFile(uri.fsPath, 'create');
        return;
      }
      if (classification.entityType === 'plan-template') {
        this.scheduleRefresh(this.debounceDelayCreateDelete);
        return;
      }
    }

    this.scheduleRefresh(this.debounceDelayCreateDelete);
  }

  /**
   * Handle file change event
   */
  private async handleFileChange(uri: vscode.Uri): Promise<void> {
    if (this.isOwnWrite) {
      return;
    }

    console.log(`[FileWatcher] CHANGE: ${uri.fsPath}`);
    const classification = this.classifyChange(uri);

    if (this.incrementalRefresh && classification.id) {
      if (classification.entityType === 'ticket' || classification.entityType === 'plan' || classification.entityType === 'report') {
        await this.store.updateFile(uri.fsPath, 'change');
        return;
      }
      if (classification.entityType === 'plan-template') {
        this.scheduleRefresh(this.debounceDelayChange);
        return;
      }
    }

    this.scheduleRefresh(this.debounceDelayChange);
  }

  /**
   * Handle file deletion event
   */
  private async handleFileDelete(uri: vscode.Uri): Promise<void> {
    if (this.isOwnWrite) {
      return;
    }

    const classification = this.classifyChange(uri);

    if (this.incrementalRefresh && classification.id) {
      // Use incremental update for known entity types
      if (classification.entityType === 'ticket' || classification.entityType === 'plan' || classification.entityType === 'report') {
        await this.store.updateFile(uri.fsPath, 'delete');
        return;
      }
      if (classification.entityType === 'plan-template') {
        this.scheduleRefresh(this.debounceDelayCreateDelete);
        return;
      }
    }

    // Fallback to full refresh
    this.scheduleRefresh(this.debounceDelayCreateDelete);
  }

  /**
   * Execute a write operation with isOwnWrite flag set
   * Prevents the watcher from triggering on our own writes
   */
  async withOwnWrite<T>(operation: () => Promise<T>): Promise<T> {
    this.isOwnWrite = true;
    try {
      return await operation();
    } finally {
      // Small delay to ensure file system events are processed
      setTimeout(() => {
        this.isOwnWrite = false;
      }, this.debounceDelayCreateDelete * 2);
    }
  }

  /**
   * Dispose of the file watcher
   * Cleans up resources when service is no longer needed
   */
  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }

    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = undefined;
    }
  }
}
