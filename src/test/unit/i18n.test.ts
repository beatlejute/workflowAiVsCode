/**
 * Unit tests for i18n (Internationalization)
 *
 * Tests:
 * - All keys in package.nls.json have corresponding Russian translations
 * - All keys in l10n/bundle.l10n.json have corresponding Russian translations
 * - Parameterized strings use correct {0}, {1} placeholder format
 * - No missing translations
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('I18n Completeness Tests', () => {
  const projectRoot = path.join(__dirname, '../../../');

  test('package.nls.json should exist', () => {
    const packageNlsPath = path.join(projectRoot, 'package.nls.json');
    assert.ok(
      fs.existsSync(packageNlsPath),
      'package.nls.json should exist'
    );
  });

  test('package.nls.ru.json should exist', () => {
    const packageNlsRuPath = path.join(projectRoot, 'package.nls.ru.json');
    assert.ok(
      fs.existsSync(packageNlsRuPath),
      'package.nls.ru.json should exist'
    );
  });

  test('l10n/bundle.l10n.json should exist', () => {
    const bundlePath = path.join(projectRoot, 'l10n/bundle.l10n.json');
    assert.ok(
      fs.existsSync(bundlePath),
      'l10n/bundle.l10n.json should exist'
    );
  });

  test('l10n/bundle.l10n.ru.json should exist', () => {
    const bundleRuPath = path.join(projectRoot, 'l10n/bundle.l10n.ru.json');
    assert.ok(
      fs.existsSync(bundleRuPath),
      'l10n/bundle.l10n.ru.json should exist'
    );
  });

  test('all package.nls.json keys should have Russian translations', () => {
    const packageNls = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'package.nls.json'), 'utf-8')
    );
    const packageNlsRu = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'package.nls.ru.json'), 'utf-8')
    );

    const missingKeys: string[] = [];
    for (const key of Object.keys(packageNls)) {
      if (!(key in packageNlsRu)) {
        missingKeys.push(key);
      }
    }

    assert.strictEqual(
      missingKeys.length,
      0,
      `Missing Russian translations for keys: ${missingKeys.join(', ')}`
    );
  });

  test('all bundle.l10n.json keys should have Russian translations', () => {
    const bundle = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'l10n/bundle.l10n.json'), 'utf-8')
    );
    const bundleRu = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'l10n/bundle.l10n.ru.json'), 'utf-8')
    );

    const missingKeys: string[] = [];
    for (const key of Object.keys(bundle)) {
      if (!(key in bundleRu)) {
        missingKeys.push(key);
      }
    }

    assert.strictEqual(
      missingKeys.length,
      0,
      `Missing Russian translations for keys: ${missingKeys.join(', ')}`
    );
  });

  test('package.nls.ru.json should not have extra keys', () => {
    const packageNls = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'package.nls.json'), 'utf-8')
    );
    const packageNlsRu = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'package.nls.ru.json'), 'utf-8')
    );

    const extraKeys: string[] = [];
    for (const key of Object.keys(packageNlsRu)) {
      if (!(key in packageNls)) {
        extraKeys.push(key);
      }
    }

    assert.strictEqual(
      extraKeys.length,
      0,
      `Extra keys in package.nls.ru.json: ${extraKeys.join(', ')}`
    );
  });

  test('bundle.l10n.ru.json should not have extra keys', () => {
    const bundle = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'l10n/bundle.l10n.json'), 'utf-8')
    );
    const bundleRu = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'l10n/bundle.l10n.ru.json'), 'utf-8')
    );

    const extraKeys: string[] = [];
    for (const key of Object.keys(bundleRu)) {
      if (!(key in bundle)) {
        extraKeys.push(key);
      }
    }

    assert.strictEqual(
      extraKeys.length,
      0,
      `Extra keys in bundle.l10n.ru.json: ${extraKeys.join(', ')}`
    );
  });

  test('parameterized strings should use consistent placeholders', () => {
    const bundle = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'l10n/bundle.l10n.json'), 'utf-8')
    );
    const bundleRu = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'l10n/bundle.l10n.ru.json'), 'utf-8')
    );

    const placeholderRegex = /\{(\d+)\}/g;
    const mismatchedStrings: string[] = [];

    for (const [key, enValue] of Object.entries(bundle)) {
      if (typeof enValue !== 'string') continue;

      const ruValue = bundleRu[key];
      if (typeof ruValue !== 'string') continue;

      // Extract placeholders from English string
      const enPlaceholders = new Set<string>();
      let match;
      while ((match = placeholderRegex.exec(enValue)) !== null) {
        enPlaceholders.add(match[0]);
      }

      // Extract placeholders from Russian string
      const ruPlaceholders = new Set<string>();
      placeholderRegex.lastIndex = 0; // Reset regex
      while ((match = placeholderRegex.exec(ruValue)) !== null) {
        ruPlaceholders.add(match[0]);
      }

      // Check if all English placeholders exist in Russian
      for (const placeholder of enPlaceholders) {
        if (!ruPlaceholders.has(placeholder)) {
          mismatchedStrings.push(
            `${key}: English has ${placeholder}, Russian missing`
          );
        }
      }
    }

    assert.strictEqual(
      mismatchedStrings.length,
      0,
      `Mismatched placeholders in: ${mismatchedStrings.join(', ')}`
    );
  });

  test('Russian translations should not be empty', () => {
    const packageNlsRu = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'package.nls.ru.json'), 'utf-8')
    );
    const bundleRu = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'l10n/bundle.l10n.ru.json'), 'utf-8')
    );

    const emptyTranslations: string[] = [];

    for (const [key, value] of Object.entries(packageNlsRu)) {
      if (typeof value === 'string' && value.trim() === '') {
        emptyTranslations.push(`package.nls.ru.json: ${key}`);
      }
    }

    for (const [key, value] of Object.entries(bundleRu)) {
      if (typeof value === 'string' && value.trim() === '') {
        emptyTranslations.push(`bundle.l10n.ru.json: ${key}`);
      }
    }

    assert.strictEqual(
      emptyTranslations.length,
      0,
      `Empty translations: ${emptyTranslations.join(', ')}`
    );
  });

  test('package.json should use %key% syntax for all translatable strings', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8')
    );
    const packageNls = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'package.nls.json'), 'utf-8')
    );

    const hardcodedStrings: string[] = [];

    // Check commands
    if (packageJson.contributes?.commands) {
      for (const cmd of packageJson.contributes.commands) {
        if (cmd.title && !cmd.title.startsWith('%') && !cmd.title.includes('$')) {
          hardcodedStrings.push(`command title: ${cmd.title}`);
        }
        if (cmd.category && !cmd.category.startsWith('%')) {
          hardcodedStrings.push(`command category: ${cmd.category}`);
        }
      }
    }

    // Check views
    if (packageJson.contributes?.views) {
      for (const [viewContainer, views] of Object.entries(packageJson.contributes.views)) {
        if (Array.isArray(views)) {
          for (const view of views) {
            if (view.name && !view.name.startsWith('%')) {
              hardcodedStrings.push(`view name: ${view.name}`);
            }
          }
        }
      }
    }

    // Check configuration
    if (packageJson.contributes?.configuration) {
      const config = packageJson.contributes.configuration;
      if (config.title && !config.title.startsWith('%')) {
        hardcodedStrings.push(`config title: ${config.title}`);
      }
      if (config.properties) {
        for (const [propKey, propValue] of Object.entries(config.properties)) {
          const prop = propValue as any;
          if (prop.description && !prop.description.startsWith('%')) {
            hardcodedStrings.push(`property description: ${propKey}`);
          }
        }
      }
    }

    assert.strictEqual(
      hardcodedStrings.length,
      0,
      `Hardcoded strings in package.json: ${hardcodedStrings.join(', ')}`
    );
  });
});
