/**
 * Unit tests for the in-progress ticket icon.
 *
 * The old implementation faked a pulse with a 1s interval that flipped the icon
 * and fired onDidChangeTreeData for the row. VS Code re-renders the whole row on
 * that event, so what the user saw was the row flashing and hover being lost.
 * The icon now animates by itself, so no timer and no per-second event.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { getTicketIcon, getTicketIconActive, getTicketIconColor } from '../../utils/ticket-utils';

suite('Ticket icons', () => {

  test('the idle icon is a static filled circle', () => {
    const icon = getTicketIcon(2);
    assert.ok(icon instanceof vscode.ThemeIcon);
    assert.strictEqual(icon.id, 'circle-filled');
  });

  test('the active icon is a self-animating codicon', () => {
    const icon = getTicketIconActive(2);
    assert.ok(icon instanceof vscode.ThemeIcon);
    // Проверяем instanceof + id, а не снапшот: снапшот ThemeIcon хрупок.
    assert.strictEqual(icon.id, 'loading~spin');
    assert.ok(icon.id.endsWith('~spin'), 'анимация должна быть встроена в codicon');
  });

  test('a ticket keeps its priority colour when it becomes active', () => {
    for (const priority of [1, 2, 3, 5]) {
      const idle = getTicketIcon(priority) as vscode.ThemeIcon & { color?: { id: string } };
      const active = getTicketIconActive(priority) as vscode.ThemeIcon & { color?: { id: string } };
      assert.strictEqual(
        active.color?.id,
        idle.color?.id,
        `приоритет ${priority}: цвет не должен меняться при переходе в работу`
      );
    }
  });

  test('priority maps to distinct colours', () => {
    const ids = [1, 2, 3, 5].map(p => (getTicketIconColor(p) as unknown as { id: string }).id);
    assert.strictEqual(new Set(ids).size, ids.length, 'каждому приоритету — свой цвет');
  });
});

suite('Pulse mechanics', () => {

  test('no timer is created when a ticket becomes active', async () => {
    // Импорт внутри теста: модуль держит общее состояние на уровне модуля.
    const provider = await import('../../ui/kanban-tree-provider.js');

    const realSetInterval = global.setInterval;
    let intervalsCreated = 0;
    (global as unknown as { setInterval: typeof setInterval }).setInterval = ((
      ...args: Parameters<typeof setInterval>
    ) => {
      intervalsCreated++;
      return realSetInterval(...args);
    }) as typeof setInterval;

    try {
      provider.setPulseTicketId('IMPL-1');
      assert.strictEqual(provider.getPulseTicketId(), 'IMPL-1');
      assert.strictEqual(intervalsCreated, 0, 'анимация не должна заводить setInterval');
    } finally {
      (global as unknown as { setInterval: typeof setInterval }).setInterval = realSetInterval;
      provider.setPulseTicketId(undefined);
    }
  });

  test('setting the same ticket twice is a no-op', async () => {
    const provider = await import('../../ui/kanban-tree-provider.js');

    provider.setPulseTicketId('IMPL-2');
    provider.setPulseTicketId('IMPL-2');
    assert.strictEqual(provider.getPulseTicketId(), 'IMPL-2');

    provider.setPulseTicketId(undefined);
    assert.strictEqual(provider.getPulseTicketId(), undefined);
  });
});
