/**
 * Guards the Command Palette prefix.
 *
 * Every command shows up as `<category>: <title>`, and the auto-generated
 * "Focus on … View" entries take their prefix from the view container title.
 * Miss a `category` on one command, or translate `category.workflow` in one
 * locale, and the palette splits into `WF: …` and something else — which is
 * exactly the inconsistency users reported.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

function readJson(relative: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, relative), 'utf8'));
}

const LOCALES = ['de', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'pt-br', 'ru', 'zh', 'zh-cn', 'zh-tw'];

suite('Command palette prefixes', () => {

  test('every contributed command carries the workflow category', () => {
    const pkg = readJson('package.json') as {
      contributes: { commands: Array<{ command: string; category?: string }> };
    };

    const offenders = pkg.contributes.commands
      .filter(command => command.category !== '%category.workflow%')
      .map(command => command.command);

    assert.deepStrictEqual(
      offenders,
      [],
      `команды без "category": "%category.workflow%": ${offenders.join(', ')}`
    );
  });

  test('there is at least one command, so the check above cannot pass vacuously', () => {
    const pkg = readJson('package.json') as { contributes: { commands: unknown[] } };
    assert.ok(pkg.contributes.commands.length > 0);
  });

  test('category.workflow is "WF" in the source locale', () => {
    const nls = readJson('package.nls.json');
    assert.strictEqual(nls['category.workflow'], 'WF');
  });

  test('category.workflow is untranslated in every locale', () => {
    const offenders: string[] = [];

    for (const locale of LOCALES) {
      const file = `package.nls.${locale}.json`;
      if (!fs.existsSync(path.join(PROJECT_ROOT, file))) { continue; }
      const nls = readJson(file);
      if (nls['category.workflow'] !== 'WF') {
        offenders.push(`${locale}="${String(nls['category.workflow'])}"`);
      }
    }

    assert.deepStrictEqual(offenders, [], `локали с переведённым префиксом: ${offenders.join(', ')}`);
  });

  test('view container and panel titles are untranslated too', () => {
    // От них берут префикс автогенерируемые команды «Focus on … View».
    const expectations: Record<string, string> = {
      'views.activitybar.workflow.title': 'WF',
      'views.panel.kanban.title': 'WF: Kanban'
    };

    const offenders: string[] = [];
    for (const locale of ['', ...LOCALES]) {
      const file = locale ? `package.nls.${locale}.json` : 'package.nls.json';
      if (!fs.existsSync(path.join(PROJECT_ROOT, file))) { continue; }
      const nls = readJson(file);
      for (const [key, expected] of Object.entries(expectations)) {
        if (key in nls && nls[key] !== expected) {
          offenders.push(`${locale || 'en'}:${key}="${String(nls[key])}"`);
        }
      }
    }

    assert.deepStrictEqual(offenders, [], offenders.join(', '));
  });
});
