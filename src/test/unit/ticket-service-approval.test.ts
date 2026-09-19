/**
 * Открытие manual-gate при перемещении тикета из расширения.
 *
 * Раннер ждёт решения в `.workflow/approvals/<id>_manual-gate-*_<attempt>.json`
 * до `manual-gate-human.timeout` (86400 с), после чего уводит тикет в blocked.
 * Хук, который переводит гейт в `approved`, жил только в CLI-скрипте
 * `move-ticket.js`, поэтому кнопка «Move to review» в уведомлении о созревшем
 * human-тикете двигала файл, но гейт не открывала — задача молча умирала
 * через сутки.
 *
 * Расширение не импортирует workflow-ai, поэтому пишет тот же словарь само;
 * эти тесты держат совпадение контракта.
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { WorkflowStore } from '../../data/workflow-store';
import { TicketService } from '../../services/ticket-service';
import { TicketStatus } from '../../data/types';

suite('TicketService: manual-gate approvals', () => {
  let store: WorkflowStore;
  let ticketService: TicketService;
  let testDir: string;
  let workflowRoot: string;

  const COLUMNS = ['backlog', 'ready', 'in-progress', 'blocked', 'review', 'done', 'archive'];

  setup(() => {
    store = new WorkflowStore();
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-vscode-approval-'));
    workflowRoot = path.join(testDir, '.workflow');

    for (const column of COLUMNS) {
      fs.mkdirSync(path.join(workflowRoot, 'tickets', column), { recursive: true });
    }
    fs.mkdirSync(path.join(workflowRoot, 'approvals'), { recursive: true });

    ticketService = new TicketService(store, workflowRoot);
  });

  teardown(() => {
    store.clear();
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /** Кладёт тикет в колонку и регистрирует его в store. */
  function seedTicket(id: string, status: TicketStatus): void {
    fs.writeFileSync(
      path.join(workflowRoot, 'tickets', status, `${id}.md`),
      `---\nid: ${id}\ntitle: Human task\nstatus: ${status}\npriority: 1\ntype: human\n---\n\nBody\n`,
      'utf-8'
    );
    store.addTicket({
      id,
      title: 'Human task',
      status,
      priority: 1,
      type: 'human',
      dependencies: [],
      conditions: [],
      context: {},
      tags: [],
      complexity: 'medium',
      parent_plan: '',
      parent_task: '',
      created_at: '2026-09-19T00:00:00Z',
      updated_at: '2026-09-19T00:00:00Z',
      completed_at: ''
    });
  }

  function writeApproval(name: string, payload: Record<string, unknown>): void {
    fs.writeFileSync(
      path.join(workflowRoot, 'approvals', name),
      JSON.stringify(payload, null, 2),
      'utf-8'
    );
  }

  function readApproval(name: string): Record<string, unknown> {
    return JSON.parse(
      fs.readFileSync(path.join(workflowRoot, 'approvals', name), 'utf-8')
    ) as Record<string, unknown>;
  }

  test('перемещение тикета переводит его pending-гейт в approved', async () => {
    seedTicket('HUMAN-1', TicketStatus.InProgress);
    writeApproval('HUMAN-1_manual-gate-human_1.json', {
      ticket_id: 'HUMAN-1',
      stage_id: 'manual-gate-human',
      status: 'pending'
    });

    await ticketService.move('HUMAN-1', TicketStatus.Review);

    const decided = readApproval('HUMAN-1_manual-gate-human_1.json');
    assert.strictEqual(decided.status, 'approved', 'гейт должен открыться');
    assert.strictEqual(decided.decided_by, 'move-ticket', 'словарь должен совпадать с CLI');
    assert.match(String(decided.comment), /review/);
    assert.ok(decided.updated_at, 'должна проставиться метка времени');
  });

  test('гейт чужого тикета не трогается', async () => {
    seedTicket('HUMAN-1', TicketStatus.InProgress);
    writeApproval('HUMAN-2_manual-gate-human_1.json', { status: 'pending' });

    await ticketService.move('HUMAN-1', TicketStatus.Review);

    assert.strictEqual(readApproval('HUMAN-2_manual-gate-human_1.json').status, 'pending');
  });

  test('уже принятое решение не переписывается', async () => {
    seedTicket('HUMAN-1', TicketStatus.InProgress);
    writeApproval('HUMAN-1_manual-gate-human_1.json', {
      status: 'rejected',
      decided_by: 'human',
      comment: 'не надо'
    });

    await ticketService.move('HUMAN-1', TicketStatus.Review);

    const untouched = readApproval('HUMAN-1_manual-gate-human_1.json');
    assert.strictEqual(untouched.status, 'rejected', 'отказ человека важнее автоматики');
    assert.strictEqual(untouched.comment, 'не надо');
  });

  test('открываются все попытки одного гейта', async () => {
    seedTicket('HUMAN-1', TicketStatus.InProgress);
    writeApproval('HUMAN-1_manual-gate-human_1.json', { status: 'pending' });
    writeApproval('HUMAN-1_manual-gate-human_2.json', { status: 'pending' });

    await ticketService.move('HUMAN-1', TicketStatus.Review);

    assert.strictEqual(readApproval('HUMAN-1_manual-gate-human_1.json').status, 'approved');
    assert.strictEqual(readApproval('HUMAN-1_manual-gate-human_2.json').status, 'approved');
  });

  test('файлы не-гейтов игнорируются', async () => {
    seedTicket('HUMAN-1', TicketStatus.InProgress);
    // Не подходит под шаблон `<id>_manual-gate-*_<attempt>.json`.
    writeApproval('HUMAN-1_review-result_1.json', { status: 'pending' });

    await ticketService.move('HUMAN-1', TicketStatus.Review);

    assert.strictEqual(readApproval('HUMAN-1_review-result_1.json').status, 'pending');
  });

  test('ID с regex-символами не задевает соседний тикет', async () => {
    // Без экранирования точка в `HUMAN.1` означает «любой символ», и шаблон
    // начинает совпадать ещё и с гейтом HUMAN-1 — чужой тикет открывается сам.
    seedTicket('HUMAN.1', TicketStatus.InProgress);
    writeApproval('HUMAN.1_manual-gate-human_1.json', { status: 'pending' });
    writeApproval('HUMAN-1_manual-gate-human_1.json', { status: 'pending' });

    await ticketService.move('HUMAN.1', TicketStatus.Review);

    assert.strictEqual(readApproval('HUMAN.1_manual-gate-human_1.json').status, 'approved');
    assert.strictEqual(
      readApproval('HUMAN-1_manual-gate-human_1.json').status,
      'pending',
      'гейт соседнего тикета обязан остаться нетронутым'
    );
  });

  test('битый JSON не ломает перемещение', async () => {
    seedTicket('HUMAN-1', TicketStatus.InProgress);
    fs.writeFileSync(
      path.join(workflowRoot, 'approvals', 'HUMAN-1_manual-gate-human_1.json'),
      '{ это не json',
      'utf-8'
    );

    await ticketService.move('HUMAN-1', TicketStatus.Review);

    const moved = path.join(workflowRoot, 'tickets', 'review', 'HUMAN-1.md');
    assert.ok(fs.existsSync(moved), 'тикет всё равно должен переехать');
  });

  test('отсутствие каталога approvals не ломает перемещение', async () => {
    fs.rmSync(path.join(workflowRoot, 'approvals'), { recursive: true, force: true });
    seedTicket('IMPL-1', TicketStatus.InProgress);

    await ticketService.move('IMPL-1', TicketStatus.Review);

    const moved = path.join(workflowRoot, 'tickets', 'review', 'IMPL-1.md');
    assert.ok(fs.existsSync(moved), 'тикет всё равно должен переехать');
  });
});
