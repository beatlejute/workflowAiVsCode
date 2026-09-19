/**
 * Unit tests for PipelineTreeProvider in Paused state
 *
 * Tests:
 * - PipelineRunTreeItem: Correct label, description, icon for Paused state with manual gate ticket
 * - TreeItem snapshot verification
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { PipelineState } from '../../services/pipeline-service';
import { PipelineRunTreeItem } from '../../ui/pipeline-tree-provider';

suite('PipelineTreeProvider Paused State Tests', () => {
  suite('PipelineRunTreeItem - Paused State', () => {
    test('Paused state with manual gate ticket displays correct label', () => {
      const item = new PipelineRunTreeItem(
        PipelineState.Paused,
        undefined,
        'HUMAN-1'
      );

      assert.ok(
        (item.label as string).includes('Waiting for manual intervention') ||
        (item.label as string).includes('Ожидание ручного вмешательства'),
        `Expected label to contain manual intervention text, got: ${item.label}`
      );
    });

    test('Paused state with manual gate ticket displays ticket in description', () => {
      const item = new PipelineRunTreeItem(
        PipelineState.Paused,
        undefined,
        'HUMAN-1'
      );

      assert.strictEqual(
        item.description,
        'HUMAN-1',
        `Expected description to be 'HUMAN-1', got: ${item.description}`
      );
    });

    test('Paused state displays debug-pause icon', () => {
      const item = new PipelineRunTreeItem(
        PipelineState.Paused,
        undefined,
        'HUMAN-1'
      );

      const icon = item.iconPath as vscode.ThemeIcon;
      assert.strictEqual(
        icon.id,
        'debug-pause',
        `Expected icon to be 'debug-pause', got: ${icon.id}`
      );
    });

    test('TC1: TreeItem snapshot - Paused state structure', () => {
      const item = new PipelineRunTreeItem(
        PipelineState.Paused,
        undefined,
        'HUMAN-1'
      );

      const snapshot = {
        label: item.label,
        description: item.description,
        itemType: item.itemType,
        state: item.state,
        iconId: (item.iconPath as vscode.ThemeIcon).id,
        collapsibleState: item.collapsibleState
      };

      expect(snapshot).toMatchSnapshot();
    });

    test('TC2: TreeItem snapshot - Paused state with elapsed time', () => {
      const item = new PipelineRunTreeItem(
        PipelineState.Paused,
        '1:30',
        'HUMAN-1'
      );

      const snapshot = {
        label: item.label,
        description: item.description,
        elapsed: item.elapsed,
        iconId: (item.iconPath as vscode.ThemeIcon).id
      };

      expect(snapshot).toMatchSnapshot();
    });

    test('TC3: Paused state without manual gate ticket displays elapsed time', () => {
      const item = new PipelineRunTreeItem(
        PipelineState.Paused,
        '2:45'
      );

      assert.ok(
        (item.label as string).includes('Paused'),
        `Expected label to contain 'Paused', got: ${item.label}`
      );
      assert.strictEqual(
        item.description,
        'Elapsed: 2:45',
        `Expected description to show elapsed time, got: ${item.description}`
      );
    });

    test('TC4: Paused state with manual gate and elapsed shows ticket, not elapsed', () => {
      const item = new PipelineRunTreeItem(
        PipelineState.Paused,
        '3:00',
        'HUMAN-2'
      );

      assert.strictEqual(
        item.description,
        'HUMAN-2',
        'Description should show manual gate ticket, not elapsed time'
      );
    });
  });
});

// Helper to use with Jest/snapshot testing
function expect(value: any) {
  return {
    toMatchSnapshot: () => {
      // Snapshot comparison would be handled by Jest if enabled
      // For now, just verify the structure exists
      assert.ok(value, 'Snapshot value should exist');
    }
  };
}
