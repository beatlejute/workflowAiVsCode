/**
 * Unit tests for ticket-utils.ts
 *
 * Tests:
 * - getTicketIcon(): returns correct ThemeIcon for each priority level
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { getTicketIcon } from '../../utils/ticket-utils';

suite('ticket-utils', () => {
  suite('getTicketIcon()', () => {
    test('priority 1 (Critical) returns error icon color', () => {
      const icon = getTicketIcon(1);
      assert.strictEqual(icon.id, 'circle-filled');
      assert.ok(icon.color instanceof vscode.ThemeColor);
      assert.ok((icon.color as vscode.ThemeColor).id.includes('Error'));
    });

    test('priority 0 (below 1) also returns error icon color', () => {
      const icon = getTicketIcon(0);
      assert.strictEqual(icon.id, 'circle-filled');
      assert.ok(icon.color instanceof vscode.ThemeColor);
      assert.ok((icon.color as vscode.ThemeColor).id.includes('Error'));
    });

    test('negative priority returns error icon color', () => {
      const icon = getTicketIcon(-1);
      assert.strictEqual(icon.id, 'circle-filled');
      assert.ok((icon.color as vscode.ThemeColor).id.includes('Error'));
    });

    test('priority 2 (High) returns warning icon color', () => {
      const icon = getTicketIcon(2);
      assert.strictEqual(icon.id, 'circle-filled');
      assert.ok(icon.color instanceof vscode.ThemeColor);
      assert.ok((icon.color as vscode.ThemeColor).id.includes('Warning'));
    });

    test('priority 3 (Medium) returns info icon color', () => {
      const icon = getTicketIcon(3);
      assert.strictEqual(icon.id, 'circle-filled');
      assert.ok(icon.color instanceof vscode.ThemeColor);
      assert.ok((icon.color as vscode.ThemeColor).id.includes('Info'));
    });

    test('priority 4 (Low) returns green color', () => {
      const icon = getTicketIcon(4);
      assert.strictEqual(icon.id, 'circle-filled');
      assert.ok(icon.color instanceof vscode.ThemeColor);
      assert.ok((icon.color as vscode.ThemeColor).id.includes('Green') || (icon.color as vscode.ThemeColor).id.includes('green'));
    });

    test('priority 5 also returns green/default color', () => {
      const icon = getTicketIcon(5);
      assert.strictEqual(icon.id, 'circle-filled');
      assert.ok(icon.color instanceof vscode.ThemeColor);
    });

    test('all returned icons are ThemeIcon instances', () => {
      for (const p of [0, 1, 2, 3, 4, 5, 10]) {
        const icon = getTicketIcon(p);
        assert.ok(icon instanceof vscode.ThemeIcon, `Priority ${p} should return ThemeIcon`);
      }
    });
  });
});
