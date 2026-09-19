/**
 * Unit tests for CollapseStateStore.
 *
 * The bug being guarded: the pipeline tree rebuilds its items on every refresh,
 * once a second while a pipeline runs, and each rebuilt item carries the
 * builder's default collapsible state. Without this store the user's click on a
 * chevron is undone on the next tick.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { CollapseStateStore } from '../../ui/tree-collapse-state';

function item(id: string | undefined, state: vscode.TreeItemCollapsibleState): vscode.TreeItem {
  const treeItem = new vscode.TreeItem('label', state);
  treeItem.id = id;
  return treeItem;
}

suite('CollapseStateStore', () => {

  test('returns the builder default for an item the user never touched', () => {
    const store = new CollapseStateStore();
    assert.strictEqual(
      store.resolve('statistics', vscode.TreeItemCollapsibleState.Collapsed),
      vscode.TreeItemCollapsibleState.Collapsed
    );
  });

  test('remembers a collapse and overrides the builder default', () => {
    const store = new CollapseStateStore();
    store.record('pipeline-run', vscode.TreeItemCollapsibleState.Collapsed);

    // Билдер отдаёт Expanded, пользователь свернул — побеждает пользователь.
    assert.strictEqual(
      store.resolve('pipeline-run', vscode.TreeItemCollapsibleState.Expanded),
      vscode.TreeItemCollapsibleState.Collapsed
    );
  });

  test('remembers an expand and overrides the builder default', () => {
    const store = new CollapseStateStore();
    store.record('history', vscode.TreeItemCollapsibleState.Expanded);

    assert.strictEqual(
      store.resolve('history', vscode.TreeItemCollapsibleState.Collapsed),
      vscode.TreeItemCollapsibleState.Expanded
    );
  });

  test('survives a rebuild: applying twice keeps the user choice', () => {
    const store = new CollapseStateStore();
    store.record('pipeline-run', vscode.TreeItemCollapsibleState.Collapsed);

    // Имитируем два подряд refresh с новыми объектами item — так ведёт себя
    // getRootItemsFromState, который каждый раз конструирует их заново.
    for (let tick = 0; tick < 2; tick++) {
      const items = store.apply([item('pipeline-run', vscode.TreeItemCollapsibleState.Expanded)]);
      assert.strictEqual(items[0].collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
    }
  });

  test('a leaf stays a leaf even if it was expandable before', () => {
    const store = new CollapseStateStore();
    store.record('history-3', vscode.TreeItemCollapsibleState.Expanded);

    // Узел потерял детей — chevron не должен воскреснуть.
    assert.strictEqual(
      store.resolve('history-3', vscode.TreeItemCollapsibleState.None),
      vscode.TreeItemCollapsibleState.None
    );
  });

  test('None is never recorded', () => {
    const store = new CollapseStateStore();
    store.record('stat-retries', vscode.TreeItemCollapsibleState.None);
    assert.strictEqual(store.size, 0);
  });

  test('items without an id are left alone', () => {
    const store = new CollapseStateStore();
    store.record(undefined, vscode.TreeItemCollapsibleState.Collapsed);
    assert.strictEqual(store.size, 0);

    const items = store.apply([item(undefined, vscode.TreeItemCollapsibleState.Expanded)]);
    assert.strictEqual(items[0].collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
  });

  test('apply only touches the items it is given and returns them', () => {
    const store = new CollapseStateStore();
    store.record('history', vscode.TreeItemCollapsibleState.Expanded);

    const input = [
      item('pipeline-run', vscode.TreeItemCollapsibleState.Expanded),
      item('history', vscode.TreeItemCollapsibleState.Collapsed),
      item('stat-retries', vscode.TreeItemCollapsibleState.None)
    ];
    const output = store.apply(input);

    assert.strictEqual(output, input);
    assert.strictEqual(output[0].collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
    assert.strictEqual(output[1].collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
    assert.strictEqual(output[2].collapsibleState, vscode.TreeItemCollapsibleState.None);
  });

  test('forget drops a single entry, clear drops everything', () => {
    const store = new CollapseStateStore();
    store.record('a', vscode.TreeItemCollapsibleState.Collapsed);
    store.record('b', vscode.TreeItemCollapsibleState.Collapsed);
    assert.strictEqual(store.size, 2);

    store.forget('a');
    assert.strictEqual(store.size, 1);
    assert.strictEqual(
      store.resolve('a', vscode.TreeItemCollapsibleState.Expanded),
      vscode.TreeItemCollapsibleState.Expanded
    );

    store.clear();
    assert.strictEqual(store.size, 0);
  });
});
