import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = process.cwd();
const LOCALES = ['de', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'pt-br', 'ru', 'zh', 'zh-cn', 'zh-tw'];

function readJsonFile(filePath: string): Record<string, any> | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function extractPlaceholders(str: string): Set<string> {
  const placeholders = new Set<string>();
  if (typeof str !== 'string') {
    return placeholders;
  }
  const matches = str.match(/\{[^}]+\}/g);
  if (matches) {
    for (const match of matches) {
      placeholders.add(match.slice(1, -1)); // Remove braces
    }
  }
  return placeholders;
}

function flattenObject(obj: any, prefix = ''): Map<string, string> {
  const result = new Map<string, string>();
  if (!obj || typeof obj !== 'object') {
    return result;
  }
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      result.set(fullKey, value);
    } else if (typeof value === 'object' && value !== null) {
      const nested = flattenObject(value, fullKey);
      for (const [k, v] of nested) {
        result.set(k, v);
      }
    }
  }
  return result;
}

function checkPlaceholderParity(
  bundleType: string,
  masterFile: string,
  localeFilePattern: (locale: string) => string
): { hasError: boolean; errors: string[] } {
  const errors: string[] = [];
  const master = readJsonFile(masterFile);

  if (!master) {
    return {
      hasError: true,
      errors: [`Failed to read master file: ${masterFile}`]
    };
  }

  const masterFlat = flattenObject(master);

  for (const locale of LOCALES) {
    const localeFile = localeFilePattern(locale);
    const localeData = readJsonFile(localeFile);

    if (!localeData) {
      errors.push(`[${bundleType}] Failed to read locale file: ${localeFile}`);
      continue;
    }

    const localeFlat = flattenObject(localeData);

    // Check placeholders for all keys in master
    for (const [key, masterValue] of masterFlat) {
      const localeValue = localeFlat.get(key);
      if (localeValue === undefined) {
        // Key is missing in locale - this is a different check (completeness)
        continue;
      }

      const masterPlaceholders = extractPlaceholders(masterValue);
      const localePlaceholders = extractPlaceholders(localeValue);

      // Skip if no placeholders
      if (masterPlaceholders.size === 0 && localePlaceholders.size === 0) {
        continue;
      }

      // Check for missing placeholders in locale
      const missingInLocale = [...masterPlaceholders].filter(p => !localePlaceholders.has(p));
      if (missingInLocale.length > 0) {
        errors.push(
          `[${bundleType}] Locale "${locale}" key "${key}" missing placeholders: {${missingInLocale.join('}, {')}}`
        );
      }

      // Check for extra placeholders in locale
      const extraInLocale = [...localePlaceholders].filter(p => !masterPlaceholders.has(p));
      if (extraInLocale.length > 0) {
        errors.push(
          `[${bundleType}] Locale "${locale}" key "${key}" has extra placeholders: {${extraInLocale.join('}, {')}}`
        );
      }
    }
  }

  return {
    hasError: errors.length > 0,
    errors
  };
}

suite('L10n Placeholder Consistency Tests', () => {
  test('package.nls.json placeholders should be consistent across all locales', () => {
    const masterFile = path.join(PROJECT_ROOT, 'package.nls.json');
    const result = checkPlaceholderParity('package.nls', masterFile, (locale) =>
      path.join(PROJECT_ROOT, `package.nls.${locale}.json`)
    );

    if (result.hasError) {
      assert.fail(`Placeholder parity check failed:\n${result.errors.join('\n')}`);
    }
  });

  test('l10n/bundle.l10n.json placeholders should be consistent across all locales', () => {
    const masterFile = path.join(PROJECT_ROOT, 'l10n', 'bundle.l10n.json');
    const result = checkPlaceholderParity('bundle.l10n', masterFile, (locale) =>
      path.join(PROJECT_ROOT, 'l10n', `bundle.l10n.${locale}.json`)
    );

    if (result.hasError) {
      assert.fail(`Placeholder parity check failed:\n${result.errors.join('\n')}`);
    }
  });
});
