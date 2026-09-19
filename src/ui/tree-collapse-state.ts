/**
 * CollapseStateStore — remembers what the user collapsed or expanded in a TreeView.
 *
 * VS Code keeps collapse state per TreeItem `id`, but only until the item is
 * rebuilt. The pipeline view rebuilds every root item on every refresh, and
 * while a pipeline runs that happens once per second (see
 * PipelineTreeProvider.updateStageElapsedTimer), so the state the builder hands
 * back — Expanded for the run node, Collapsed for statistics and history —
 * overwrites the user's choice almost immediately. That is the "chevron does
 * nothing" bug: the click works, the next refresh undoes it.
 *
 * Providers feed freshly built items through `apply()`, and the TreeView feeds
 * the user's own collapse/expand events into `record()`.
 */

import * as vscode from 'vscode';

export class CollapseStateStore {
  /** id → user's choice. Only ids the user actually touched appear here. */
  private readonly states = new Map<string, vscode.TreeItemCollapsibleState>();

  /**
   * Remembers an explicit collapse/expand by the user.
   * `None` is never stored — a leaf cannot be collapsed, and storing it would
   * make a node that later grows children permanently un-expandable.
   */
  record(id: string | undefined, state: vscode.TreeItemCollapsibleState): void {
    if (!id || state === vscode.TreeItemCollapsibleState.None) {
      return;
    }
    this.states.set(id, state);
  }

  /**
   * Returns the state a freshly built item should get: the user's choice when
   * there is one, otherwise the builder's default.
   *
   * A leaf stays a leaf: if the builder says `None` the item has no children
   * now, and a remembered state from when it did have them must not resurrect
   * the chevron.
   */
  resolve(id: string | undefined, fallback: vscode.TreeItemCollapsibleState): vscode.TreeItemCollapsibleState {
    if (!id || fallback === vscode.TreeItemCollapsibleState.None) {
      return fallback;
    }
    return this.states.get(id) ?? fallback;
  }

  /** Applies remembered state to every item in place and returns the same array. */
  apply<T extends vscode.TreeItem>(items: T[]): T[] {
    for (const item of items) {
      const id = typeof item.id === 'string' ? item.id : undefined;
      item.collapsibleState = this.resolve(id, item.collapsibleState ?? vscode.TreeItemCollapsibleState.None);
    }
    return items;
  }

  /** Drops a single remembered entry — used when a node leaves the model. */
  forget(id: string): void {
    this.states.delete(id);
  }

  /** Drops every remembered entry (history cleared, workspace switched). */
  clear(): void {
    this.states.clear();
  }

  /** Number of remembered entries. Exposed for tests and disposal checks. */
  get size(): number {
    return this.states.size;
  }

  /**
   * Wires a TreeView's collapse/expand events into this store.
   * Returns disposables for the caller's subscription list.
   */
  attach<T extends vscode.TreeItem>(treeView: vscode.TreeView<T>): vscode.Disposable[] {
    return [
      treeView.onDidCollapseElement(e => {
        const id = typeof e.element.id === 'string' ? e.element.id : undefined;
        this.record(id, vscode.TreeItemCollapsibleState.Collapsed);
      }),
      treeView.onDidExpandElement(e => {
        const id = typeof e.element.id === 'string' ? e.element.id : undefined;
        this.record(id, vscode.TreeItemCollapsibleState.Expanded);
      })
    ];
  }
}
