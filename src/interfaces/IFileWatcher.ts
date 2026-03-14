/**
 * IFileWatcher - Interface for file system watcher service
 *
 * Monitors .workflow directory for external changes (wf CLI, AI-agents)
 * and automatically updates WorkflowStore with debounced batch updates.
 *
 * Implements Dependency Inversion Principle (SOLID) for testability and DI.
 *
 * @see FileWatcherService - Implementation of this interface
 */

import * as vscode from 'vscode';

/**
 * IFileWatcher - Interface for reactive file system monitoring
 *
 * Monitors workflow directory for changes and triggers store updates.
 * Extends vscode.Disposable for proper resource cleanup.
 */
export interface IFileWatcher extends vscode.Disposable {
  /**
   * Execute a write operation with isOwnWrite flag set
   * Prevents the watcher from triggering on our own writes
   *
   * @param operation - Async operation to execute
   * @returns Result of the operation
   */
  withOwnWrite<T>(operation: () => Promise<T>): Promise<T>;
}
