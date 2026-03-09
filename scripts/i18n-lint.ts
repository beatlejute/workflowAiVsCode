/**
 * i18n lint script - checks completeness of i18n translations
 * 
 * Usage: 
 *   npx ts-node scripts/i18n-lint.ts
 *   npm run i18n:lint
 * 
 * Exit codes:
 *   0 - All translations are complete
 *   1 - Missing translations found
 */

import * as fs from 'fs';
import * as path from 'path';

const projectRoot = path.join(__dirname, '../');

interface LintResult {
  passed: boolean;
  missingKeys: Record<string, string[]>;  // language -> missing keys
  extraKeys: Record<string, string[]>;    // language -> extra keys
  placeholderMismatches: Record<string, string[]>;  // language -> mismatched keys
}

/**
 * Get all language codes from i18n files
 */
function getLanguageCodes(basePattern: string, dir: string): string[] {
  const files = fs.readdirSync(dir);
  const langCodes: string[] = [];
  
  for (const file of files) {
    const match = file.match(basePattern.replace('*', '([a-z]{2}(?:-[A-Z]{2})?)') + '$');
    if (match) {
      langCodes.push(match[1]);
    }
  }
  
  return langCodes;
}

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
  } catch (error) {
    console.error(`Error loading ${filePath}: ${error}`);
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

/**
 * Lint i18n files for a specific type (package.nls or bundle.l10n)
 */
function lintI18nFiles(
  baseFile: string,
  pattern: string,
  dir: string
): LintResult {
  const result: LintResult = {
    passed: true,
    missingKeys: {},
    extraKeys: {},
    placeholderMismatches: {}
  };

  // Load base (English) file
  const basePath = path.join(dir, baseFile);
  const baseData = loadJson(basePath);
  
  if (!baseData) {
    console.error(`Base file not found: ${basePath}`);
    result.passed = false;
    return result;
  }

  const baseKeys = Object.keys(baseData);
  console.log(`\n📦 Base file: ${baseFile}`);
  console.log(`   Keys: ${baseKeys.length}`);

  // Get all language files
  const langFiles = fs.readdirSync(dir).filter(f => 
    f.startsWith(pattern.split('*')[0]) && 
    f !== baseFile && 
    f.endsWith('.json')
  );

  for (const langFile of langFiles) {
    const langPath = path.join(dir, langFile);
    const langData = loadJson(langPath);
    
    if (!langData) {
      console.warn(`⚠️  Skipping ${langFile} (not found or invalid JSON)`);
      continue;
    }

    const langKeys = Object.keys(langData);
    console.log(`\n📦 ${langFile}:`);
    console.log(`   Keys: ${langKeys.length}`);

    // Check for missing keys
    const missing = baseKeys.filter(key => !(key in langData));
    if (missing.length > 0) {
      result.missingKeys[langFile] = missing;
      result.passed = false;
      console.log(`   ❌ Missing: ${missing.length} keys`);
    } else {
      console.log(`   ✅ All keys present`);
    }

    // Check for extra keys
    const extra = langKeys.filter(key => !(key in baseData));
    if (extra.length > 0) {
      result.extraKeys[langFile] = extra;
      console.log(`   ⚠️  Extra: ${extra.length} keys`);
    }

    // Check placeholder consistency
    const placeholderMismatches: string[] = [];
    for (const key of baseKeys) {
      const baseValue = baseData[key];
      const langValue = langData[key];
      
      if (typeof baseValue !== 'string' || typeof langValue !== 'string') {
        continue;
      }

      const basePlaceholders = extractPlaceholders(baseValue);
      const langPlaceholders = extractPlaceholders(langValue);

      if (basePlaceholders.size > 0) {
        for (const placeholder of basePlaceholders) {
          if (!langPlaceholders.has(placeholder)) {
            placeholderMismatches.push(`${key}: missing ${placeholder}`);
          }
        }
      }
    }

    if (placeholderMismatches.length > 0) {
      result.placeholderMismatches[langFile] = placeholderMismatches;
      result.passed = false;
      console.log(`   ❌ Placeholder mismatches: ${placeholderMismatches.length}`);
    } else if (baseKeys.some(k => extractPlaceholders(baseData[k]).size > 0)) {
      console.log(`   ✅ Placeholders consistent`);
    }
  }

  return result;
}

/**
 * Main lint function
 */
function lint(): LintResult {
  const combinedResult: LintResult = {
    passed: true,
    missingKeys: {},
    extraKeys: {},
    placeholderMismatches: {}
  };

  console.log('🔍 Running i18n lint...\n');
  console.log('=' .repeat(50));

  // Lint package.nls files
  const packageResult = lintI18nFiles(
    'package.nls.json',
    'package.nls.*.json',
    path.join(projectRoot)
  );

  // Merge results
  Object.assign(combinedResult.missingKeys, packageResult.missingKeys);
  Object.assign(combinedResult.extraKeys, packageResult.extraKeys);
  Object.assign(combinedResult.placeholderMismatches, packageResult.placeholderMismatches);
  if (!packageResult.passed) {
    combinedResult.passed = false;
  }

  console.log('\n' + '=' .repeat(50));

  // Lint bundle.l10n files
  const bundleResult = lintI18nFiles(
    'bundle.l10n.json',
    'bundle.l10n.*.json',
    path.join(projectRoot, 'l10n')
  );

  // Merge results
  Object.assign(combinedResult.missingKeys, bundleResult.missingKeys);
  Object.assign(combinedResult.extraKeys, bundleResult.extraKeys);
  Object.assign(combinedResult.placeholderMismatches, bundleResult.placeholderMismatches);
  if (!bundleResult.passed) {
    combinedResult.passed = false;
  }

  return combinedResult;
}

/**
 * Print lint results summary
 */
function printSummary(result: LintResult): void {
  console.log('\n' + '=' .repeat(50));
  console.log('📊 Lint Summary');
  console.log('=' .repeat(50));

  if (result.passed) {
    console.log('\n✅ All i18n translations are complete!');
  } else {
    console.log('\n❌ i18n lint failed:\n');

    // Missing keys
    if (Object.keys(result.missingKeys).length > 0) {
      console.log('Missing translations:');
      for (const [file, keys] of Object.entries(result.missingKeys)) {
        console.log(`  ${file}:`);
        for (const key of keys.slice(0, 10)) {
          console.log(`    - ${key}`);
        }
        if (keys.length > 10) {
          console.log(`    ... and ${keys.length - 10} more`);
        }
      }
      console.log('');
    }

    // Placeholder mismatches
    if (Object.keys(result.placeholderMismatches).length > 0) {
      console.log('Placeholder mismatches:');
      for (const [file, mismatches] of Object.entries(result.placeholderMismatches)) {
        console.log(`  ${file}:`);
        for (const mismatch of mismatches.slice(0, 5)) {
          console.log(`    - ${mismatch}`);
        }
        if (mismatches.length > 5) {
          console.log(`    ... and ${mismatches.length - 5} more`);
        }
      }
      console.log('');
    }
  }

  // Extra keys (warnings)
  if (Object.keys(result.extraKeys).length > 0) {
    console.log('⚠️  Extra keys (warnings):');
    for (const [file, keys] of Object.entries(result.extraKeys)) {
      console.log(`  ${file}: ${keys.length} extra keys`);
    }
    console.log('');
  }
}

// Run lint
const result = lint();
printSummary(result);

// Exit with appropriate code
process.exit(result.passed ? 0 : 1);
