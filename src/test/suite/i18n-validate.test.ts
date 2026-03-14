/**
 * Unit tests for i18n validation - All languages
 *
 * Run with: npm run test:unit
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const projectRoot = process.cwd();

/**
 * Load JSON file safely
 */
function loadJson(filePath: string): Record<string, string> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Extract placeholders from a string (e.g., {0}, {1})
 */
function extractPlaceholders(str: string): Set<string> {
  const placeholders = new Set<string>();
  const regex = /\{(\d+)\}/g;
  let match;

  while ((match = regex.exec(str)) !== null) {
    placeholders.add(match[0]);
  }

  return placeholders;
}

suite('i18n Validation - All Languages', () => {
  const languages = [
    { code: 'ru', name: 'Russian' },
    { code: 'de', name: 'German' },
    { code: 'fr', name: 'French' },
    { code: 'es', name: 'Spanish' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh-cn', name: 'Chinese (Simplified)' },
    { code: 'zh-tw', name: 'Chinese (Traditional)' },
    { code: 'pt-br', name: 'Portuguese (Brazil)' }
  ];

  suite('package.nls translations', () => {
    for (const lang of languages) {
      test(`All English keys have ${lang.name} translations`, () => {
        const packageNls = loadJson(path.join(projectRoot, 'package.nls.json'));
        const packageNlsLang = loadJson(path.join(projectRoot, `package.nls.${lang.code}.json`));

        assert.ok(packageNls, 'package.nls.json should exist');
        assert.ok(packageNlsLang, `package.nls.${lang.code}.json should exist`);

        const missingKeys = Object.keys(packageNls!).filter(key => !(key in packageNlsLang!));

        assert.strictEqual(
          missingKeys.length,
          0,
          `Missing ${lang.name} translations: ${missingKeys.slice(0, 10).join(', ')}${missingKeys.length > 10 ? ` (+${missingKeys.length - 10} more)` : ''}`
        );
      });
    }
  });

  suite('bundle.l10n translations', () => {
    for (const lang of languages) {
      test(`All English bundle keys have ${lang.name} translations`, () => {
        const bundle = loadJson(path.join(projectRoot, 'l10n/bundle.l10n.json'));
        const bundleLang = loadJson(path.join(projectRoot, `l10n/bundle.l10n.${lang.code}.json`));

        assert.ok(bundle, 'bundle.l10n.json should exist');
        assert.ok(bundleLang, `l10n/bundle.l10n.${lang.code}.json should exist`);

        const missingKeys = Object.keys(bundle!).filter(key => !(key in bundleLang!));

        assert.strictEqual(
          missingKeys.length,
          0,
          `Missing ${lang.name} translations: ${missingKeys.slice(0, 10).join(', ')}${missingKeys.length > 10 ? ` (+${missingKeys.length - 10} more)` : ''}`
        );
      });
    }
  });

  suite('Parameterized strings', () => {
    for (const lang of languages) {
      test(`Parameterized strings in package.nls.${lang.code}.json preserve placeholders`, () => {
        const packageNls = loadJson(path.join(projectRoot, 'package.nls.json'));
        const packageNlsLang = loadJson(path.join(projectRoot, `package.nls.${lang.code}.json`));

        assert.ok(packageNls, 'package.nls.json should exist');
        assert.ok(packageNlsLang, `package.nls.${lang.code}.json should exist`);

        const mismatches: string[] = [];

        for (const [key, enValue] of Object.entries(packageNls!)) {
          if (typeof enValue !== 'string') continue;

          const langValue = packageNlsLang![key];
          if (typeof langValue !== 'string') continue;

          const enPlaceholders = extractPlaceholders(enValue);
          const langPlaceholders = extractPlaceholders(langValue);

          if (enPlaceholders.size > 0) {
            for (const placeholder of enPlaceholders) {
              if (!langPlaceholders.has(placeholder)) {
                mismatches.push(`${key}: missing ${placeholder}`);
              }
            }
          }
        }

        assert.strictEqual(
          mismatches.length,
          0,
          `Placeholder mismatches: ${mismatches.slice(0, 10).join(', ')}${mismatches.length > 10 ? ` (+${mismatches.length - 10} more)` : ''}`
        );
      });

      test(`Parameterized strings in bundle.l10n.${lang.code}.json preserve placeholders`, () => {
        const bundle = loadJson(path.join(projectRoot, 'l10n/bundle.l10n.json'));
        const bundleLang = loadJson(path.join(projectRoot, `l10n/bundle.l10n.${lang.code}.json`));

        assert.ok(bundle, 'bundle.l10n.json should exist');
        assert.ok(bundleLang, `l10n/bundle.l10n.${lang.code}.json should exist`);

        const mismatches: string[] = [];

        for (const [key, enValue] of Object.entries(bundle!)) {
          if (typeof enValue !== 'string') continue;

          const langValue = bundleLang![key];
          if (typeof langValue !== 'string') continue;

          const enPlaceholders = extractPlaceholders(enValue);
          const langPlaceholders = extractPlaceholders(langValue);

          if (enPlaceholders.size > 0) {
            for (const placeholder of enPlaceholders) {
              if (!langPlaceholders.has(placeholder)) {
                mismatches.push(`${key}: missing ${placeholder}`);
              }
            }
          }
        }

        assert.strictEqual(
          mismatches.length,
          0,
          `Placeholder mismatches: ${mismatches.slice(0, 10).join(', ')}${mismatches.length > 10 ? ` (+${mismatches.length - 10} more)` : ''}`
        );
      });
    }
  });

  suite('Translation quality', () => {
    for (const lang of languages) {
      test(`No empty translations in package.nls.${lang.code}.json`, () => {
        const packageNlsLang = loadJson(path.join(projectRoot, `package.nls.${lang.code}.json`));

        assert.ok(packageNlsLang, `package.nls.${lang.code}.json should exist`);

        const emptyTranslations = Object.entries(packageNlsLang!)
          .filter(([_, value]) => typeof value === 'string' && value.trim() === '')
          .map(([key, _]) => key);

        assert.strictEqual(
          emptyTranslations.length,
          0,
          `Empty translations: ${emptyTranslations.slice(0, 10).join(', ')}${emptyTranslations.length > 10 ? ` (+${emptyTranslations.length - 10} more)` : ''}`
        );
      });

      test(`No empty translations in bundle.l10n.${lang.code}.json`, () => {
        const bundleLang = loadJson(path.join(projectRoot, `l10n/bundle.l10n.${lang.code}.json`));

        assert.ok(bundleLang, `l10n/bundle.l10n.${lang.code}.json should exist`);

        const emptyTranslations = Object.entries(bundleLang!)
          .filter(([_, value]) => typeof value === 'string' && value.trim() === '')
          .map(([key, _]) => key);

        assert.strictEqual(
          emptyTranslations.length,
          0,
          `Empty translations: ${emptyTranslations.slice(0, 10).join(', ')}${emptyTranslations.length > 10 ? ` (+${emptyTranslations.length - 10} more)` : ''}`
        );
      });
    }
  });
});
