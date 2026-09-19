/**
 * Unit tests for WorkflowStore.parseReviews.
 *
 * The first suite is the reproduction of the reported bug: badges vanished for
 * certain tickets. Scanning 840 real tickets across the four projects found 21
 * with review rows the old regex could not read. The shapes below are taken
 * verbatim from those tickets — the old parser returned nothing for every one
 * of them.
 */

import * as assert from 'assert';
import { WorkflowStore } from '../../data/workflow-store';

function section(rows: string[], header = '| Дата | Статус | Самари |'): string {
  return ['## Ревью', '', header, '|------|--------|--------|', ...rows, '', '## Результат выполнения', ''].join('\n');
}

suite('parseReviews — reproduction of the reported bug', () => {

  test('4 columns with the agent second (workflowAiVsCode/ADMIN-10)', () => {
    const body = section(
      ['| 2026-05-02 | claude-sonnet | ✅ passed | DOCS-13.md в done/, все 3 пункта DoD выполнены. |'],
      '| Дата | Статус | Самари | Агент |'
    );
    const reviews = WorkflowStore.parseReviews(body);

    assert.strictEqual(reviews.length, 1);
    assert.strictEqual(reviews[0].icon, '✅');
    assert.strictEqual(reviews[0].status, 'passed');
    assert.strictEqual(reviews[0].summary, 'DOCS-13.md в done/, все 3 пункта DoD выполнены.');
  });

  test('4 columns with the agent last (workflowAiVsCode/ADMIN-10)', () => {
    const body = section(
      ['| 2026-05-01 10:50 | ✅ passed | YAML валиден. | human |'],
      '| Дата | Статус | Самари | Агент |'
    );
    const reviews = WorkflowStore.parseReviews(body);

    assert.strictEqual(reviews.length, 1);
    assert.strictEqual(reviews[0].status, 'passed');
    assert.strictEqual(reviews[0].summary, 'YAML валиден.');
  });

  test('ISO date with T and no seconds (workflowAiVsCode/FIX-62)', () => {
    const reviews = WorkflowStore.parseReviews(section(
      ['| 2026-05-01T23:41 | ✅ passed | ESLint: 0 errors, DoD 5/5 выполнен |']
    ));

    assert.strictEqual(reviews.length, 1);
    assert.strictEqual(reviews[0].date, '2026-05-01T23:41');
  });

  test('time with a trailing Z (workflowAi/QA-23)', () => {
    const reviews = WorkflowStore.parseReviews(section(
      ['| 2026-04-21 14:53Z | ✅ PASS | manual-testing: все 3 пункта DoD подтверждены |']
    ));

    assert.strictEqual(reviews.length, 1);
    assert.strictEqual(reviews[0].status, 'PASS');
  });

  test('full ISO timestamp with seconds and Z (PulseProxy/ADMIN-003)', () => {
    const reviews = WorkflowStore.parseReviews(section(
      ['| 2026-04-21T22:15:00Z | ✅ passed | Оба пункта DoD выполнены |']
    ));

    assert.strictEqual(reviews.length, 1);
    assert.strictEqual(reviews[0].date, '2026-04-21T22:15:00Z');
  });

  test('verdict carrying a parenthetical (workflowAi/QA-48)', () => {
    const reviews = WorkflowStore.parseReviews(section(
      ['| 2026-04-30 | ✅ passed (attempt 2) | Тесты повторно верифицированы: 12/12 pass |']
    ));

    assert.strictEqual(reviews.length, 1);
    assert.strictEqual(reviews[0].icon, '✅');
    assert.strictEqual(reviews[0].status, 'passed (attempt 2)');
  });

  test('note after the date (workflowAiVsCode/QA-52)', () => {
    const reviews = WorkflowStore.parseReviews(section(
      ['| 2026-05-02 (attempt 6) | ✅ passed | Переверификация: lint exit code 0 |']
    ));

    assert.strictEqual(reviews.length, 1);
    assert.strictEqual(reviews[0].date, '2026-05-02');
  });

  test('non-standard verdict wording (PulseProxy/IMPL-010)', () => {
    const reviews = WorkflowStore.parseReviews(section(
      ['| 2026-03-11 | ⏳ in review | ModalHelper создан и применён в 5 функциях |']
    ));

    assert.strictEqual(reviews.length, 1);
    assert.strictEqual(reviews[0].icon, '⏳');
    assert.strictEqual(reviews[0].status, 'in review');
  });

  test('verdict without an icon (workflowAiVsCode/ARCH-002)', () => {
    const reviews = WorkflowStore.parseReviews(section(
      ['| 2026-03-04 | fixed | Счётчик PLAN в config.yaml исправлен: 3 → 4. |']
    ));

    assert.strictEqual(reviews.length, 1);
    assert.strictEqual(reviews[0].icon, '');
    assert.strictEqual(reviews[0].status, 'fixed');
  });

  test('mixed shapes inside one table are all read', () => {
    // Даты намеренно разнесены по дням: этот тест про распознавание форм строк,
    // а не про сортировку — её проверяет отдельный тест ниже.
    const body = section(
      [
        '| 2026-05-01 | ✅ passed | агент-в-конце | human |',
        '| 2026-05-02 | ❌ failed | три-колонки |',
        '| 2026-05-03 | claude-sonnet | ✅ passed | агент-вторым |'
      ],
      '| Дата | Статус | Самари | Агент |'
    );
    const reviews = WorkflowStore.parseReviews(body);

    assert.strictEqual(reviews.length, 3);
    assert.deepStrictEqual(
      reviews.map(r => r.summary),
      ['агент-в-конце', 'три-колонки', 'агент-вторым']
    );
    assert.deepStrictEqual(reviews.map(r => r.status), ['passed', 'failed', 'passed']);
  });
});

suite('parseReviews — date formats', () => {

  const dates = [
    '2026-04-25',
    '2026-04-25 12:30',
    '2026-04-25 12:30:45',
    '2026-04-25T12:30:45Z',
    '2026-04-25T12:30:45+03:00'
  ];

  for (const date of dates) {
    test(`accepts ${date}`, () => {
      const reviews = WorkflowStore.parseReviews(section([`| ${date} | ✅ passed | ok |`]));
      assert.strictEqual(reviews.length, 1, `не распознана дата ${date}`);
      assert.strictEqual(reviews[0].date, date);
    });
  }

  test('rejects a row whose first cell is not a date', () => {
    const reviews = WorkflowStore.parseReviews(section(['| скоро | ✅ passed | ok |']));
    assert.strictEqual(reviews.length, 0);
  });

  test('rejects a malformed date', () => {
    const reviews = WorkflowStore.parseReviews(section(['| 25-04-2026 | ✅ passed | ok |']));
    assert.strictEqual(reviews.length, 0);
  });
});

suite('parseReviews — structure', () => {

  test('no review section yields no reviews', () => {
    assert.deepStrictEqual(WorkflowStore.parseReviews('# Ticket\n\nNo reviews here.'), []);
  });

  test('header and separator rows are not mistaken for entries', () => {
    const reviews = WorkflowStore.parseReviews(section(['| 2026-04-25 | ✅ passed | ok |']));
    assert.strictEqual(reviews.length, 1);
  });

  test('reviews are sorted chronologically regardless of row order', () => {
    const reviews = WorkflowStore.parseReviews(section([
      '| 2026-04-27 | ✅ passed | третья |',
      '| 2026-04-25 | ❌ failed | первая |',
      '| 2026-04-26 | ✅ passed | вторая |'
    ]));

    assert.deepStrictEqual(reviews.map(r => r.summary), ['первая', 'вторая', 'третья']);
  });

  test('T and space separators sort together, not apart', () => {
    // «T» по коду больше пробела, поэтому naive localeCompare поставил бы
    // 09:00 после 23:00. Ключ сортировки приводит их к одному виду.
    const reviews = WorkflowStore.parseReviews(section([
      '| 2026-04-25 23:00 | ✅ passed | вечер |',
      '| 2026-04-25T09:00 | ✅ passed | утро |'
    ]));

    assert.deepStrictEqual(reviews.map(r => r.summary), ['утро', 'вечер']);
  });

  test('an English "## Review" heading works the same', () => {
    const body = [
      '## Review', '',
      '| Date | Status | Summary |',
      '|------|--------|---------|',
      '| 2026-04-25 | ✅ passed | ok |',
      ''
    ].join('\n');

    assert.strictEqual(WorkflowStore.parseReviews(body).length, 1);
  });

  test('a free-form phrase in the status column is not invented into a verdict', () => {
    // PulseProxy/QA-65: в колонке статуса фраза «повторная проверка».
    // Придумывать для неё значок нельзя — badge был бы ложью.
    const reviews = WorkflowStore.parseReviews(section([
      '| 2026-04-13 | повторная проверка | Дефекты задокументированы. |'
    ]));

    assert.strictEqual(reviews.length, 0);
  });

  test('prose inside the section is ignored', () => {
    const body = [
      '## Ревью', '',
      'Комментарий ревьюера без таблицы.',
      '| 2026-04-25 | ✅ passed | ok |',
      ''
    ].join('\n');

    assert.strictEqual(WorkflowStore.parseReviews(body).length, 1);
  });
});

suite('parseReviews — section boundaries', () => {

  test('a mention of the section name in prose does not hijack the parse', () => {
    // Реальный случай: 14 тикетов теряли все бейджи, потому что незаякоренный
    // regex цеплялся за упоминание секции в тексте выше настоящей таблицы.
    const body = [
      '## Описание', '',
      'После выполнения вставить запись в таблицу `## Ревью` тикета.', '',
      '## Ревью', '',
      '| Дата | Статус | Самари |',
      '|------|--------|--------|',
      '| 2026-04-25 | ✅ passed | всё хорошо |',
      ''
    ].join('\n');

    const reviews = WorkflowStore.parseReviews(body);
    assert.strictEqual(reviews.length, 1);
    assert.strictEqual(reviews[0].summary, 'всё хорошо');
  });

  test('a deeper heading with the same name is not the section', () => {
    const body = [
      '#### Review iterations', '',
      '| 2026-04-01 | ✅ passed | не отсюда |', '',
      '## Ревью', '',
      '| Дата | Статус | Самари |',
      '|------|--------|--------|',
      '| 2026-04-25 | ✅ passed | отсюда |',
      ''
    ].join('\n');

    const reviews = WorkflowStore.parseReviews(body);
    assert.strictEqual(reviews.length, 1);
    assert.strictEqual(reviews[0].summary, 'отсюда');
  });

  test('a backtick-led summary is not mistaken for a verdict', () => {
    // Класс значков сужен до символов: бэктик, звёздочка и тире больше не
    // считаются иконкой вердикта.
    const reviews = WorkflowStore.parseReviews(section([
      '| 2026-04-25 | `config.yaml` обновлён | ✅ passed | настоящее самари |'
    ], '| Дата | Заметка | Статус | Самари |'));

    assert.strictEqual(reviews.length, 1);
    assert.strictEqual(reviews[0].icon, '✅');
    assert.strictEqual(reviews[0].status, 'passed');
    assert.strictEqual(reviews[0].summary, 'настоящее самари');
  });

  test('a plain check mark counts as a verdict icon', () => {
    // workflowAi/IMPL-048: «✓ resolved», U+2713 — не пиктограф, но символ.
    const reviews = WorkflowStore.parseReviews(section([
      '| 2026-04-24 16:52 | ✓ resolved | Ошибки исправлены. |'
    ]));

    assert.strictEqual(reviews.length, 1);
    assert.strictEqual(reviews[0].icon, '✓');
    assert.strictEqual(reviews[0].status, 'resolved');
  });
});

suite('parseReviews — several sections in one ticket', () => {

  test('rows from a second section are read too', () => {
    // Pipeline-fallback дописывает новую секцию вместо строки в существующую;
    // таких тикетов в проектах полтора десятка, и их строки терялись.
    const body = [
      '## Ревью', '',
      '| Дата | Статус | Самари |',
      '|------|--------|--------|',
      '| 2026-05-01 | ❌ failed | первый проход |',
      '',
      '## Результат выполнения', '',
      'что-то про результат',
      '',
      '## Ревью', '',
      '| Дата | Статус | Самари |',
      '|------|--------|--------|',
      '| 2026-05-02 | ✅ passed | Pipeline fallback: второй проход |',
      ''
    ].join('\n');

    const reviews = WorkflowStore.parseReviews(body);
    assert.strictEqual(reviews.length, 2);
    assert.deepStrictEqual(reviews.map(r => r.status), ['failed', 'passed']);
  });

  test('rows from all sections are merged and sorted together', () => {
    const body = [
      '## Ревью', '', '| 2026-05-03 | ✅ passed | поздняя |', '',
      '## Прочее', '', 'текст', '',
      '## Ревью', '', '| 2026-05-01 | ❌ failed | ранняя |', ''
    ].join('\n');

    const reviews = WorkflowStore.parseReviews(body);
    assert.deepStrictEqual(reviews.map(r => r.summary), ['ранняя', 'поздняя']);
  });
});
