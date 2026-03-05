/**
 * Unit tests for scripts/check-i18n.js
 *
 * Tests:
 * - check-i18n.js script finds missing keys
 * - check-i18n.js script passes when all translations are complete
 * - Helper functions work correctly
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Import the check-i18n module using ES module syntax
// The module is CommonJS but ts-node handles the interop
import * as checkI18n from '../../../scripts/check-i18n.js';

suite('check-i18n.js Unit Tests', () => {
  let tempDir: string;

  setup(() => {
    // Create a temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-test-'));
  });

  teardown(() => {
    // Clean up temporary directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  suite('Helper Functions', () => {
    test('readJsonFile should read and parse valid JSON', () => {
      const testFile = path.join(tempDir, 'test.json');
      const testData = { key1: 'value1', key2: 'value2' };
      fs.writeFileSync(testFile, JSON.stringify(testData));

      const result = checkI18n.readJsonFile(testFile);
      assert.deepStrictEqual(result, testData);
    });

    test('readJsonFile should return null for non-existent file', () => {
      const result = checkI18n.readJsonFile(path.join(tempDir, 'nonexistent.json'));
      assert.strictEqual(result, null);
    });

    test('readJsonFile should return null for invalid JSON', () => {
      const testFile = path.join(tempDir, 'invalid.json');
      fs.writeFileSync(testFile, '{ invalid json }');

      const result = checkI18n.readJsonFile(testFile);
      assert.strictEqual(result, null);
    });

    test('getKeys should return all keys from an object', () => {
      const obj = { key1: 'value1', key2: 'value2', key3: 'value3' };
      const keys = checkI18n.getKeys(obj);
      assert.deepStrictEqual(keys, ['key1', 'key2', 'key3']);
    });

    test('getKeys should return empty array for null', () => {
      const keys = checkI18n.getKeys(null);
      assert.deepStrictEqual(keys, []);
    });

    test('findMissingKeys should find keys in master but not in translation', () => {
      const master = { key1: 'value1', key2: 'value2', key3: 'value3' };
      const translation = { key1: 'translated1', key3: 'translated3' };

      const missing = checkI18n.findMissingKeys(master, translation);
      assert.deepStrictEqual(missing, ['key2']);
    });

    test('findMissingKeys should return empty array if all keys present', () => {
      const master = { key1: 'value1', key2: 'value2' };
      const translation = { key1: 'translated1', key2: 'translated2' };

      const missing = checkI18n.findMissingKeys(master, translation);
      assert.deepStrictEqual(missing, []);
    });

    test('findMissingKeys should handle empty translation', () => {
      const master = { key1: 'value1', key2: 'value2' };
      const translation = {};

      const missing = checkI18n.findMissingKeys(master, translation);
      assert.deepStrictEqual(missing, ['key1', 'key2']);
    });
  });

  suite('checkTranslationFile', () => {
    test('should return complete status when all keys present', () => {
      const masterFile = path.join(tempDir, 'master.json');
      const translationFile = path.join(tempDir, 'translation.json');

      fs.writeFileSync(masterFile, JSON.stringify({ key1: 'v1', key2: 'v2' }));
      fs.writeFileSync(translationFile, JSON.stringify({ key1: 't1', key2: 't2' }));

      const result = checkI18n.checkTranslationFile(masterFile, translationFile, 'test', 'test');

      assert.strictEqual(result.hasError, false);
      assert.strictEqual(result.isComplete, true);
      assert.deepStrictEqual(result.missingKeys, []);
    });

    test('should return missing keys when translation is incomplete', () => {
      const masterFile = path.join(tempDir, 'master.json');
      const translationFile = path.join(tempDir, 'translation.json');

      fs.writeFileSync(masterFile, JSON.stringify({ key1: 'v1', key2: 'v2', key3: 'v3' }));
      fs.writeFileSync(translationFile, JSON.stringify({ key1: 't1', key2: 't2' }));

      const result = checkI18n.checkTranslationFile(masterFile, translationFile, 'test', 'test');

      assert.strictEqual(result.hasError, false);
      assert.strictEqual(result.isComplete, false);
      assert.deepStrictEqual(result.missingKeys, ['key3']);
    });

    test('should return error when master file not found', () => {
      const translationFile = path.join(tempDir, 'translation.json');
      fs.writeFileSync(translationFile, JSON.stringify({ key1: 't1' }));

      const result = checkI18n.checkTranslationFile(
        path.join(tempDir, 'nonexistent.json'),
        translationFile,
        'test',
        'test'
      );

      assert.strictEqual(result.hasError, true);
      assert.ok(result.error?.includes('Failed to read master file'));
    });

    test('should return error when translation file not found', () => {
      const masterFile = path.join(tempDir, 'master.json');
      fs.writeFileSync(masterFile, JSON.stringify({ key1: 'v1' }));

      const result = checkI18n.checkTranslationFile(
        masterFile,
        path.join(tempDir, 'nonexistent.json'),
        'test',
        'test'
      );

      assert.strictEqual(result.hasError, true);
      assert.ok(result.error?.includes('Failed to read translation file'));
    });
  });

  suite('checkAllTranslations', () => {
    test('should check all supported locales', () => {
      // Use tempDir as the project root for this test
      const masterFile = path.join(tempDir, 'master.json');
      fs.writeFileSync(masterFile, JSON.stringify({ key1: 'v1' }));

      // Create translation files for some locales
      fs.writeFileSync(
        path.join(tempDir, 'translation.de.json'),
        JSON.stringify({ key1: 't1' })
      );
      fs.writeFileSync(
        path.join(tempDir, 'translation.fr.json'),
        JSON.stringify({ key1: 't1' })
      );

      // Use tempDir as baseDir so the function looks for files in tempDir
      const results = checkI18n.checkAllTranslations(
        masterFile,
        'translation',
        'test',
        '', // empty subDir
        tempDir // use tempDir as baseDir
      );

      assert.strictEqual(results.length, checkI18n.SUPPORTED_LOCALES.length);

      // Check that German and French are complete
      const deResult = results.find((r: any) => r.locale === 'de');
      const frResult = results.find((r: any) => r.locale === 'fr');
      const esResult = results.find((r: any) => r.locale === 'es');

      assert.ok(deResult);
      assert.strictEqual(deResult?.isComplete, true);

      assert.ok(frResult);
      assert.strictEqual(frResult?.isComplete, true);

      // Spanish should have error (file not found)
      assert.ok(esResult);
      assert.strictEqual(esResult?.hasError, true);
    });
  });

  suite('Integration Test - Missing Keys Detection', () => {
    test('should detect missing keys in incomplete translation', () => {
      const masterFile = path.join(tempDir, 'package.nls.json');
      const translationFile = path.join(tempDir, 'package.nls.de.json');

      // Create master with 5 keys
      const masterData = {
        'key1': 'Value 1',
        'key2': 'Value 2',
        'key3': 'Value 3',
        'key4': 'Value 4',
        'key5': 'Value 5'
      };
      fs.writeFileSync(masterFile, JSON.stringify(masterData));

      // Create translation missing 2 keys
      const translationData = {
        'key1': 'Wert 1',
        'key3': 'Wert 3',
        'key5': 'Wert 5'
      };
      fs.writeFileSync(translationFile, JSON.stringify(translationData));

      const result = checkI18n.checkTranslationFile(masterFile, translationFile, 'de', 'package.nls');

      assert.strictEqual(result.isComplete, false);
      assert.strictEqual(result.missingKeys.length, 2);
      assert.deepStrictEqual(result.missingKeys, ['key2', 'key4']);
    });
  });

  suite('Integration Test - Complete Translations', () => {
    test('should pass when all translations are complete', () => {
      const masterFile = path.join(tempDir, 'package.nls.json');
      const translationFile = path.join(tempDir, 'package.nls.de.json');

      // Create master with 3 keys
      const masterData = {
        'greeting': 'Hello',
        'farewell': 'Goodbye',
        'welcome': 'Welcome'
      };
      fs.writeFileSync(masterFile, JSON.stringify(masterData));

      // Create complete translation
      const translationData = {
        'greeting': 'Hallo',
        'farewell': 'Auf Wiedersehen',
        'welcome': 'Willkommen'
      };
      fs.writeFileSync(translationFile, JSON.stringify(translationData));

      const result = checkI18n.checkTranslationFile(masterFile, translationFile, 'de', 'package.nls');

      assert.strictEqual(result.isComplete, true);
      assert.strictEqual(result.missingKeys.length, 0);
      assert.strictEqual(result.hasError, false);
    });
  });

  suite('SUPPORTED_LOCALES', () => {
    test('should include all 8 required locales', () => {
      const locales = checkI18n.SUPPORTED_LOCALES;
      assert.strictEqual(locales.length, 8);
      assert.ok(locales.includes('zh-cn'));
      assert.ok(locales.includes('zh-tw'));
      assert.ok(locales.includes('ja'));
      assert.ok(locales.includes('ko'));
      assert.ok(locales.includes('de'));
      assert.ok(locales.includes('fr'));
      assert.ok(locales.includes('es'));
      assert.ok(locales.includes('pt-br'));
    });
  });
});
