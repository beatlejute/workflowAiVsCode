import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

interface TranslationResult {
  locale: string;
  file: string;
  missingKeys: string[];
  extraKeys: string[];
  hasError: boolean;
  error?: string;
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function getKeys(obj: Record<string, unknown> | null): string[] {
  if (!obj) return [];
  return Object.keys(obj);
}

function findMissingKeys(master: string[], translation: string[]): string[] {
  return master.filter(key => !translation.includes(key));
}

function findExtraKeys(master: string[], translation: string[]): string[] {
  return translation.filter(key => !master.includes(key));
}

function checkBundleCompleteness(
  masterFile: string,
  translationDir: string,
  bundleName: string,
  locales: string[]
): TranslationResult[] {
  const results: TranslationResult[] = [];
  const master = readJsonFile(masterFile);
  
  if (!master) {
    return locales.map(locale => ({
      locale,
      file: '',
      missingKeys: [],
      extraKeys: [],
      hasError: true,
      error: `Failed to read master file: ${masterFile}`
    }));
  }
  
  const masterKeys = getKeys(master);
  
  for (const locale of locales) {
    const translationFile = path.join(translationDir, `${bundleName}.${locale}.json`);
    const translation = readJsonFile(translationFile);
    
    if (!translation) {
      results.push({
        locale,
        file: translationFile,
        missingKeys: masterKeys,
        extraKeys: [],
        hasError: true,
        error: `Failed to read translation file: ${translationFile}`
      });
      continue;
    }
    
    const translationKeys = getKeys(translation);
    const missingKeys = findMissingKeys(masterKeys, translationKeys);
    const extraKeys = findExtraKeys(masterKeys, translationKeys);
    
    results.push({
      locale,
      file: translationFile,
      missingKeys,
      extraKeys,
      hasError: missingKeys.length > 0 || extraKeys.length > 0
    });
  }
  
  return results;
}

const LOCALES = [
  'de', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'pt-br', 'ru', 'zh', 'zh-cn', 'zh-tw'
];

// Use process.cwd() because VSCode test runner changes CWD to dist/unit-test
const PROJECT_ROOT = process.cwd();

suite('L10n Bundle Completeness Tests', () => {
  test('package.nls.json keys should be present in all locales', () => {
    const masterFile = path.join(PROJECT_ROOT, 'package.nls.json');
    const results = checkBundleCompleteness(
      masterFile,
      PROJECT_ROOT,
      'package.nls',
      LOCALES
    );
    
    const failures = results.filter(r => r.hasError);
    
    if (failures.length > 0) {
      const errorMessages = failures.map(f => {
        if (f.error) {
          return `[${f.locale}] ERROR: ${f.error}`;
        }
        const missing = f.missingKeys.length > 0 
          ? `missing keys: ${f.missingKeys.join(', ')}` 
          : '';
        const extra = f.extraKeys.length > 0 
          ? `extra keys: ${f.extraKeys.join(', ')}` 
          : '';
        return `[${f.locale}] ${missing} ${extra}`.trim();
      }).join('\n');
      assert.fail(`package.nls bundle completeness failed:\n${errorMessages}`);
    }
  });
  
  test('l10n/bundle.l10n.json keys should be present in all locales', () => {
    const masterFile = path.join(PROJECT_ROOT, 'l10n/bundle.l10n.json');
    const results = checkBundleCompleteness(
      masterFile,
      path.join(PROJECT_ROOT, 'l10n'),
      'bundle.l10n',
      LOCALES
    );
    
    const failures = results.filter(r => r.hasError);
    
    if (failures.length > 0) {
      const errorMessages = failures.map(f => {
        if (f.error) {
          return `[${f.locale}] ERROR: ${f.error}`;
        }
        const missing = f.missingKeys.length > 0 
          ? `missing keys: ${f.missingKeys.join(', ')}` 
          : '';
        const extra = f.extraKeys.length > 0 
          ? `extra keys: ${f.extraKeys.join(', ')}` 
          : '';
        return `[${f.locale}] ${missing} ${extra}`.trim();
      }).join('\n');
      assert.fail(`l10n/bundle.l10n bundle completeness failed:\n${errorMessages}`);
    }
  });
  
  test('should have same number of keys across all package.nls locales', () => {
    const masterFile = path.join(PROJECT_ROOT, 'package.nls.json');
    const master = readJsonFile(masterFile);
    assert.ok(master, 'Master package.nls.json not found');
    
    const masterKeyCount = getKeys(master).length;
    const keyCounts: { locale: string; count: number }[] = [];
    
    for (const locale of LOCALES) {
      const localeFile = path.join(PROJECT_ROOT, `package.nls.${locale}.json`);
      const localeData = readJsonFile(localeFile);
      if (localeData) {
        keyCounts.push({ locale, count: getKeys(localeData).length });
      }
    }
    
    const mismatches = keyCounts.filter(k => k.count !== masterKeyCount);
    if (mismatches.length > 0) {
      assert.fail(
        `Key count mismatch: master has ${masterKeyCount} keys, but:\n` +
        mismatches.map(m => `  - ${m.locale}: ${m.count} keys`).join('\n')
      );
    }
  });
  
  test('should have same number of keys across all l10n/bundle.l10n locales', () => {
    const masterFile = path.join(PROJECT_ROOT, 'l10n/bundle.l10n.json');
    const master = readJsonFile(masterFile);
    assert.ok(master, 'Master l10n/bundle.l10n.json not found');
    
    const masterKeyCount = getKeys(master).length;
    const keyCounts: { locale: string; count: number }[] = [];
    
    for (const locale of LOCALES) {
      const localeFile = path.join(PROJECT_ROOT, 'l10n', `bundle.l10n.${locale}.json`);
      const localeData = readJsonFile(localeFile);
      if (localeData) {
        keyCounts.push({ locale, count: getKeys(localeData).length });
      }
    }
    
    const mismatches = keyCounts.filter(k => k.count !== masterKeyCount);
    if (mismatches.length > 0) {
      assert.fail(
        `Key count mismatch: master has ${masterKeyCount} keys, but:\n` +
        mismatches.map(m => `  - ${m.locale}: ${m.count} keys`).join('\n')
      );
    }
  });
});