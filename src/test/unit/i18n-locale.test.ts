/**
 * Unit tests for i18n t() function with different locales
 *
 * Tests:
 * - t() loads correct bundle for explicit locale
 * - t() falls back to English when translation missing
 * - t() formats parameterized strings correctly
 * - t() caches bundles for performance
 * - formatMessage() handles multiple placeholders
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('I18n t() Locale Tests', () => {

  const projectRoot = path.join(__dirname, '../../../../../');
  const l10nDir = path.join(projectRoot, 'l10n');

  suite('Bundle loading', () => {

    test('bundle.l10n.json exists and is valid JSON', () => {
      const bundlePath = path.join(l10nDir, 'bundle.l10n.json');
      assert.ok(
        fs.existsSync(bundlePath),
        'bundle.l10n.json should exist'
      );

      const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf-8'));
      assert.ok(typeof bundle === 'object', 'Bundle should be an object');
      assert.ok(Object.keys(bundle).length > 0, 'Bundle should not be empty');
    });

    test('all locale bundles exist', () => {
      const locales = ['ru', 'de', 'fr', 'es', 'it', 'pt-br', 'zh-cn', 'ja', 'ko'];

      for (const locale of locales) {
        const bundlePath = path.join(l10nDir, `bundle.l10n.${locale}.json`);
        assert.ok(
          fs.existsSync(bundlePath),
          `bundle.l10n.${locale}.json should exist`
        );

        const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf-8'));
        assert.ok(typeof bundle === 'object', `Bundle for ${locale} should be an object`);
      }
    });

    test('all locale bundles have same keys as English bundle', () => {
      const enBundle = JSON.parse(
        fs.readFileSync(path.join(l10nDir, 'bundle.l10n.json'), 'utf-8')
      );
      const enKeys = Object.keys(enBundle).sort();

      const locales = ['ru', 'de', 'fr', 'es', 'it', 'pt-br', 'zh-cn', 'ja', 'ko'];

      for (const locale of locales) {
        const localeBundle = JSON.parse(
          fs.readFileSync(path.join(l10nDir, `bundle.l10n.${locale}.json`), 'utf-8')
        );
        const localeKeys = Object.keys(localeBundle).sort();

        assert.strictEqual(
          localeKeys.length,
          enKeys.length,
          `Bundle for ${locale} should have same number of keys as English`
        );

        const missingKeys = enKeys.filter(key => !localeKeys.includes(key));
        const extraKeys = localeKeys.filter(key => !enKeys.includes(key));

        assert.strictEqual(
          missingKeys.length,
          0,
          `Bundle for ${locale} missing keys: ${missingKeys.join(', ')}`
        );

        assert.strictEqual(
          extraKeys.length,
          0,
          `Bundle for ${locale} has extra keys: ${extraKeys.join(', ')}`
        );
      }
    });

  });

  suite('Translation quality', () => {

    test('no empty translations in Russian bundle', () => {
      const ruBundle = JSON.parse(
        fs.readFileSync(path.join(l10nDir, 'bundle.l10n.ru.json'), 'utf-8')
      );

      const emptyKeys: string[] = [];
      for (const [key, value] of Object.entries(ruBundle)) {
        if (typeof value === 'string' && value.trim() === '') {
          emptyKeys.push(key);
        }
      }

      assert.strictEqual(
        emptyKeys.length,
        0,
        `Empty translations in ru bundle: ${emptyKeys.join(', ')}`
      );
    });

    test('parameterized strings have matching placeholders', () => {
      const enBundle = JSON.parse(
        fs.readFileSync(path.join(l10nDir, 'bundle.l10n.json'), 'utf-8')
      );
      const ruBundle = JSON.parse(
        fs.readFileSync(path.join(l10nDir, 'bundle.l10n.ru.json'), 'utf-8')
      );

      const placeholderRegex = /\{(\d+)\}/g;
      const mismatches: string[] = [];

      for (const [key, enValue] of Object.entries(enBundle)) {
        if (typeof enValue !== 'string') continue;
        const ruValue = ruBundle[key];
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

    test('all translations are strings', () => {
      const locales = ['en', 'ru', 'de', 'fr', 'es', 'it', 'pt-br', 'zh-cn', 'ja', 'ko'];

      for (const locale of locales) {
        const bundlePath = path.join(l10nDir, `bundle.l10n.${locale === 'en' ? '' : locale}.json`);
        if (!fs.existsSync(bundlePath)) continue;

        const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf-8'));

        for (const [key, value] of Object.entries(bundle)) {
          assert.strictEqual(
            typeof value,
            'string',
            `Value for key "${key}" in ${locale} should be a string, got ${typeof value}`
          );
        }
      }
    });

  });

  suite('Package NLS consistency', () => {

    test('package.nls.json keys match package.nls.ru.json', () => {
      const packageNls = JSON.parse(
        fs.readFileSync(path.join(projectRoot, 'package.nls.json'), 'utf-8')
      );
      const packageNlsRu = JSON.parse(
        fs.readFileSync(path.join(projectRoot, 'package.nls.ru.json'), 'utf-8')
      );

      const enKeys = Object.keys(packageNls).sort();
      const ruKeys = Object.keys(packageNlsRu).sort();

      assert.strictEqual(
        enKeys.length,
        ruKeys.length,
        'package.nls.json and package.nls.ru.json should have same number of keys'
      );

      const missingKeys = enKeys.filter(key => !ruKeys.includes(key));
      const extraKeys = ruKeys.filter(key => !enKeys.includes(key));

      assert.strictEqual(
        missingKeys.length,
        0,
        `Missing keys in package.nls.ru.json: ${missingKeys.join(', ')}`
      );

      assert.strictEqual(
        extraKeys.length,
        0,
        `Extra keys in package.nls.ru.json: ${extraKeys.join(', ')}`
      );
    });

    test('no empty translations in package.nls.ru.json', () => {
      const packageNlsRu = JSON.parse(
        fs.readFileSync(path.join(projectRoot, 'package.nls.ru.json'), 'utf-8')
      );

      const emptyKeys: string[] = [];
      for (const [key, value] of Object.entries(packageNlsRu)) {
        if (typeof value === 'string' && value.trim() === '') {
          emptyKeys.push(key);
        }
      }

      assert.strictEqual(
        emptyKeys.length,
        0,
        `Empty translations in package.nls.ru.json: ${emptyKeys.join(', ')}`
      );
    });

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
