/**
 * FIX-71 (DEFECT-004): раздел 4 product-ui-map.md — реестр команд Command Palette —
 * дрейфовал относительно package.json и отставал на ~30 команд. Карта служит
 * source-of-truth для regression sweep'ов (раздел 13a), поэтому каждый sweep
 * фиксировал одно и то же расхождение заново — три отчёта подряд.
 *
 * Тест закрывает цикл: расхождение карты с манифестом падает здесь, а не всплывает
 * в ручном тестировании.
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const PACKAGE_JSON = path.join(REPO_ROOT, 'package.json');
const UI_MAP = path.join(REPO_ROOT, '.workflow/src/skills/shared/product-ui-map.md');

interface PackageManifest {
  contributes: {
    commands: Array<{ command: string; title: string; category?: string }>;
    menus?: { commandPalette?: Array<{ command: string; when?: string }> };
  };
}

/** Строки вида `| \`workflow.foo\` | …` из указанного раздела карты. */
function commandsInSection(map: string, from: string, to: string): string[] {
  const start = map.indexOf(from);
  const end = map.indexOf(to);
  assert.ok(start >= 0, `в карте нет раздела "${from}"`);
  assert.ok(end > start, `в карте нет раздела "${to}"`);

  const section = map.slice(start, end);
  return [...section.matchAll(/^\| `(workflow\.[A-Za-z0-9._]+)`/gm)].map(m => m[1]);
}

/** Числа из сводной таблицы 4.1: `| Показатель | **N** | …`. */
function summaryNumbers(map: string): Record<string, number> {
  const start = map.indexOf('### 4.1.');
  const end = map.indexOf('### 4.2.');
  const section = map.slice(start, end);

  const result: Record<string, number> = {};
  for (const m of section.matchAll(/^\| ([^|]+?) \| \*\*(\d+)\*\* \|/gm)) {
    result[m[1].trim()] = Number(m[2]);
  }
  return result;
}

suite('product-ui-map: раздел 4 (Command Palette)', () => {
  let pkg: PackageManifest;
  let map: string;
  let declared: string[];
  let palette: Map<string, string | undefined>;
  let mapped: string[];

  suiteSetup(function () {
    // Карта лежит в каноне скилов (`.workflow/src/skills/shared/`), который
    // ставится рядом с проектом, а в репозиторий не входит: на CI файла нет и
    // все семь проверок падали с ENOENT. Проверять нечего — пропускаем.
    if (!fs.existsSync(UI_MAP)) {
      this.skip();
      return;
    }

    pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
    map = fs.readFileSync(UI_MAP, 'utf8');

    declared = pkg.contributes.commands.map(c => c.command);
    palette = new Map(
      (pkg.contributes.menus?.commandPalette ?? []).map(e => [e.command, e.when])
    );
    mapped = commandsInSection(map, '## 4. Команды (Command Palette)', '## 5. ');
  });

  test('карта перечисляет все объявленные команды', () => {
    const missing = declared.filter(c => !mapped.includes(c));
    assert.deepStrictEqual(missing, [], `нет в карте: ${missing.join(', ')}`);
  });

  test('в карте нет команд, которых нет в манифесте', () => {
    const extra = mapped.filter(c => !declared.includes(c));
    assert.deepStrictEqual(extra, [], `лишние в карте: ${extra.join(', ')}`);
  });

  test('команда не описана дважды', () => {
    const dupes = mapped.filter((c, i) => mapped.indexOf(c) !== i);
    assert.deepStrictEqual(dupes, [], `дубли: ${dupes.join(', ')}`);
  });

  test('раздел 4.4 перечисляет ровно команды с when: false', () => {
    const hiddenInManifest = declared
      .filter(c => palette.get(c) === 'false')
      .sort();
    const hiddenInMap = commandsInSection(map, '### 4.4.', '### 4.5.').sort();

    assert.deepStrictEqual(hiddenInMap, hiddenInManifest);
  });

  test('сводка 4.1 совпадает с манифестом', () => {
    const whens = [...palette.values()];
    const facts: Record<string, number> = {
      'Объявлено команд': declared.length,
      'Записей в `commandPalette`': palette.size,
      '— из них `when: false`': whens.filter(w => w === 'false').length,
      '— из них Условных (контекст-ключи)': whens.filter(w => w && w !== 'false').length,
      'Без записи в `commandPalette`': declared.filter(c => !palette.has(c)).length
    };

    const claimed = summaryNumbers(map);
    for (const [label, expected] of Object.entries(facts)) {
      assert.strictEqual(claimed[label], expected, `сводка 4.1, строка "${label}"`);
    }
  });

  test('число «видно в нормальном режиме» сходится с условиями манифеста', () => {
    // Нормальный режим: CLI установлен, .workflow/ найден, pipeline idle.
    const visible = declared.filter(cmd => {
      if (!palette.has(cmd)) {
        return true; // без записи — видна всегда
      }
      const when = palette.get(cmd);
      if (!when || when === 'false') {
        return false;
      }
      if (when.includes('!workflow.cliInstalled') || when.includes('!workflow.workflowFound')) {
        return false; // условия-отрицания: онбординг
      }
      if (when.includes('&& workflow.pipelineRunning')) {
        return false; // pipeline idle
      }
      return true;
    });

    assert.strictEqual(
      summaryNumbers(map)['**Видно в нормальном режиме**'],
      visible.length
    );
  });

  test('все команды объявлены с категорией WF', () => {
    const wrong = pkg.contributes.commands
      .filter(c => c.category !== '%category.workflow%')
      .map(c => c.command);

    assert.deepStrictEqual(wrong, [], `без категории WF: ${wrong.join(', ')}`);
  });
});
