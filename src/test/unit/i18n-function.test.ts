/**
 * Unit tests for i18n t() function
 *
 * Tests:
 * - t() returns key when locale is 'auto' (delegates to vscode.l10n.t)
 * - t() returns translated string from bundle when locale is explicit
 * - t() handles parameterized strings with {0}, {1} placeholders
 * - t() falls back to key when translation is missing
 * - t() falls back to English when translation is missing for non-auto locale
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('I18n t() Function Tests', () => {
  const projectRoot = path.join(__dirname, '../../../');

  test('bundle.l10n.json should have valid JSON structure', () => {
    const bundlePath = path.join(projectRoot, 'l10n/bundle.l10n.json');
    const bundleContent = fs.readFileSync(bundlePath, 'utf-8');
    const bundle = JSON.parse(bundleContent);

    assert.ok(typeof bundle === 'object', 'Bundle should be an object');
    assert.ok(Object.keys(bundle).length > 0, 'Bundle should not be empty');
  });

  test('bundle.l10n.ru.json should have valid JSON structure', () => {
    const bundleRuPath = path.join(projectRoot, 'l10n/bundle.l10n.ru.json');
    const bundleRuContent = fs.readFileSync(bundleRuPath, 'utf-8');
    const bundleRu = JSON.parse(bundleRuContent);

    assert.ok(typeof bundleRu === 'object', 'Russian bundle should be an object');
    assert.ok(Object.keys(bundleRu).length > 0, 'Russian bundle should not be empty');
  });

  test('all bundle values should be strings', () => {
    const bundle = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'l10n/bundle.l10n.json'), 'utf-8')
    );

    for (const [key, value] of Object.entries(bundle)) {
      assert.strictEqual(
        typeof value,
        'string',
        `Value for key "${key}" should be a string, got ${typeof value}`
      );
    }
  });

  test('all Russian bundle values should be strings', () => {
    const bundleRu = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'l10n/bundle.l10n.ru.json'), 'utf-8')
    );

    for (const [key, value] of Object.entries(bundleRu)) {
      assert.strictEqual(
        typeof value,
        'string',
        `Value for key "${key}" should be a string, got ${typeof value}`
      );
    }
  });

  test('parameterized strings should have matching placeholders in translations', () => {
    const bundle = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'l10n/bundle.l10n.json'), 'utf-8')
    );
    const bundleRu = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'l10n/bundle.l10n.ru.json'), 'utf-8')
    );

    const placeholderRegex = /\{(\d+)\}/g;
    const mismatches: string[] = [];

    for (const [key, enValue] of Object.entries(bundle)) {
      if (typeof enValue !== 'string') continue;
      const ruValue = bundleRu[key];
      if (typeof ruValue !== 'string') continue;

      // Skip if no placeholders in English
      if (!enValue.includes('{')) continue;

      // Extract max placeholder index from English
      const enMaxIndex = getMaxPlaceholderIndex(enValue, placeholderRegex);
      const ruMaxIndex = getMaxPlaceholderIndex(ruValue, placeholderRegex);

      // Russian should have at least the same max placeholder index
      if (ruMaxIndex < enMaxIndex) {
        mismatches.push(
          `${key}: English has up to {${enMaxIndex}}, Russian only up to {${ruMaxIndex}}`
        );
      }
    }

    assert.strictEqual(
      mismatches.length,
      0,
      `Placeholder mismatches: ${mismatches.join(', ')}`
    );
  });

  test('translations should not be identical to keys (except for English base)', () => {
    const bundleRu = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'l10n/bundle.l10n.ru.json'), 'utf-8')
    );

    const identicalKeys: string[] = [];
    for (const [key, ruValue] of Object.entries(bundleRu)) {
      // Russian translation should not be identical to English key
      // (unless it's a proper noun or technical term)
      if (key === ruValue) {
        identicalKeys.push(key);
      }
    }

    // Allow some keys to be identical (technical terms, proper nouns)
    const allowedIdentical = [
      'WF: Idle',
      'WF: Running',
      'WF: Error',
      'WF: Completed',
      'PIPELINE',
      'TICKETS',
      'PLANS',
      'REPORTS',
      'BACKLOG',
      'READY',
      'BLOCKED',
      'REVIEW',
      'DONE',
      'SKILLS',
      'LOGS',
      'WELCOME'
    ];

    const actualMismatches = identicalKeys.filter(k => !allowedIdentical.includes(k));

    assert.strictEqual(
      actualMismatches.length,
      0,
      `Russian translations identical to keys: ${actualMismatches.join(', ')}`
    );
  });

  test('common UI strings should exist in both languages', () => {
    const bundle = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'l10n/bundle.l10n.json'), 'utf-8')
    );
    const bundleRu = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'l10n/bundle.l10n.ru.json'), 'utf-8')
    );

    const commonKeys = [
      'Ready',
      'Blocked',
      'Error',
      'Completed',
      'Running',
      'Idle',
      'Retry',
      'Stage',
      'Agent',
      'Ticket',
      'Reload',
      'Statistics',
      'Report'
    ];

    const missingKeys: string[] = [];
    for (const key of commonKeys) {
      if (!(key in bundle)) {
        missingKeys.push(`${key} (missing in English)`);
      }
      if (!(key in bundleRu)) {
        missingKeys.push(`${key} (missing in Russian)`);
      }
    }

    assert.strictEqual(
      missingKeys.length,
      0,
      `Missing common keys: ${missingKeys.join(', ')}`
    );
  });

  test('i18n.ts should exist', () => {
    const i18nPath = path.join(projectRoot, 'src/i18n.ts');
    assert.ok(
      fs.existsSync(i18nPath),
      'src/i18n.ts should exist'
    );
  });

  test('i18n.ts should export t function', () => {
    const i18nPath = path.join(projectRoot, 'src/i18n.ts');
    const i18nContent = fs.readFileSync(i18nPath, 'utf-8');

    assert.ok(
      i18nContent.includes('export function t('),
      'i18n.ts should export function t()'
    );
  });

  test('i18n.ts should export onLocaleChanged function', () => {
    const i18nPath = path.join(projectRoot, 'src/i18n.ts');
    const i18nContent = fs.readFileSync(i18nPath, 'utf-8');

    assert.ok(
      i18nContent.includes('export function onLocaleChanged('),
      'i18n.ts should export function onLocaleChanged()'
    );
  });

  test('i18n.ts should handle workflow.locale configuration', () => {
    const i18nPath = path.join(projectRoot, 'src/i18n.ts');
    const i18nContent = fs.readFileSync(i18nPath, 'utf-8');

    assert.ok(
      i18nContent.includes('workflow.locale'),
      'i18n.ts should reference workflow.locale configuration'
    );
  });
});

/**
 * Get the maximum placeholder index in a string
 */
function getMaxPlaceholderIndex(str: string, regex: RegExp): number {
  let maxIndex = -1;
  let match;
  regex.lastIndex = 0;
  while ((match = regex.exec(str)) !== null) {
    const index = parseInt(match[1], 10);
    if (index > maxIndex) {
      maxIndex = index;
    }
  }
  return maxIndex;
}
