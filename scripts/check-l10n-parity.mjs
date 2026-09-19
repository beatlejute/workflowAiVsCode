#!/usr/bin/env node

/**
 * i18n Parity Checker
 * 
 * This script checks for key parity and placeholder parity between en (source)
 * and all locale files for both bundle.l10n.*.json and package.nls.*.json.
 * 
 * Exit codes:
 * - 0: All parity checks pass
 * - 1: Mismatch found (missing keys or placeholders)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// 12 locales to check
const LOCALES = ['de', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'pt-br', 'ru', 'zh', 'zh-cn', 'zh-tw'];

const MASTER_FILES = {
    bundle: path.join(PROJECT_ROOT, 'l10n', 'bundle.l10n.json'),
    package: path.join(PROJECT_ROOT, 'package.nls.json')
};

/**
 * Keys whose VALUE must be identical in every locale, not merely present.
 *
 * Command Palette entries are rendered as `<category>: <title>`, and the
 * auto-generated "Focus on … View" commands take their prefix from the view
 * container title. Translate any of these and the palette splits into two
 * groups — `WF: …` in one locale, something else in another — which is the
 * inconsistency this check exists to prevent. Key parity alone does not catch
 * it: the key is present, the value has simply been translated.
 */
const IDENTICAL_VALUE_KEYS = {
    'category.workflow': 'WF',
    'views.activitybar.workflow.title': 'WF',
    'views.panel.kanban.title': 'WF: Kanban'
};

/**
 * Check that non-translatable keys carry the same value in every locale.
 * @param {object} masterData - package.nls.json contents
 * @returns {{violations: Array<{locale: string, key: string, expected: string, actual: string}>}}
 */
function checkIdenticalValues(masterData) {
    const violations = [];

    for (const [key, expected] of Object.entries(IDENTICAL_VALUE_KEYS)) {
        // Ключа может не быть вовсе — это ловит проверка парити, не эта.
        if (masterData && key in masterData && masterData[key] !== expected) {
            violations.push({ locale: 'en', key, expected, actual: masterData[key] });
        }

        for (const locale of LOCALES) {
            const filePath = path.join(PROJECT_ROOT, `package.nls.${locale}.json`);
            if (!fs.existsSync(filePath)) { continue; }
            const data = readJsonFile(filePath);
            if (!data || !(key in data)) { continue; }
            if (data[key] !== expected) {
                violations.push({ locale, key, expected, actual: data[key] });
            }
        }
    }

    return { violations };
}

/**
 * Read and parse a JSON file
 * @param {string} filePath - Path to JSON file
 * @returns {object} - Parsed JSON object
 */
function readJsonFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error(`Error reading ${filePath}: ${error.message}`);
        return null;
    }
}

/**
 * Extract all placeholder tokens from a string
 * Matches patterns like {0}, {1}, {name}, etc.
 * @param {string} str - Input string
 * @returns {Set<string>} - Set of placeholder tokens (without braces)
 */
function extractPlaceholders(str) {
    const placeholders = new Set();
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

/**
 * Recursively get all key-value pairs from a nested object
 * @param {object} obj - The object to flatten
 * @param {string} prefix - Current key prefix
 * @returns {Map<string, string>} - Map of keys to string values
 */
function flattenObject(obj, prefix = '') {
    const result = new Map();
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

/**
 * Find missing keys in locale compared to en
 * @param {Map<string, string>} enKeys - En keys (Map)
 * @param {Map<string, string>} localeKeys - Locale keys (Map)
 * @returns {string[]} - Array of missing keys
 */
function findMissingKeys(enKeys, localeKeys) {
    return [...enKeys.keys()].filter(key => !localeKeys.has(key));
}

/**
 * Find extra keys in locale not present in en
 * @param {Map<string, string>} enKeys - En keys (Map)
 * @param {Map<string, string>} localeKeys - Locale keys (Map)
 * @returns {string[]} - Array of extra keys
 */
function findExtraKeys(enKeys, localeKeys) {
    return [...localeKeys.keys()].filter(key => !enKeys.has(key));
}

/**
 * Find placeholder mismatches for a given key
 * @param {string} enValue - English value
 * @param {string} localeValue - Locale value
 * @param {string} key - Key being checked
 * @returns {object|null} - Mismatch details or null if matching
 */
function findPlaceholderMismatch(enValue, localeValue, key) {
    const enPlaceholders = extractPlaceholders(enValue);
    const localePlaceholders = extractPlaceholders(localeValue);

    if (enPlaceholders.size === 0 && localePlaceholders.size === 0) {
        return null;
    }

    const missingInLocale = [...enPlaceholders].filter(p => !localePlaceholders.has(p));
    const extraInLocale = [...localePlaceholders].filter(p => !enPlaceholders.has(p));

    if (missingInLocale.length > 0 || extraInLocale.length > 0) {
        return {
            key,
            missingInLocale,
            extraInLocale,
            enPlaceholders: [...enPlaceholders],
            localePlaceholders: [...localePlaceholders]
        };
    }

    return null;
}

/**
 * Check parity for a single file type (bundle or package)
 * @param {string} fileType - 'bundle' or 'package'
 * @returns {object} - Check results
 */
function checkParity(fileType) {
    const masterPath = MASTER_FILES[fileType];
    const masterData = readJsonFile(masterPath);
    
    if (!masterData) {
        return {
            fileType,
            hasError: true,
            error: `Failed to read master file: ${masterPath}`
        };
    }

    const enKeys = flattenObject(masterData);
    const results = {
        fileType,
        locales: {},
        hasError: false,
        hasMismatch: false,
        summary: {
            missingKeys: 0,
            extraKeys: 0,
            placeholderMismatches: 0
        }
    };

    for (const locale of LOCALES) {
        const localePath = path.join(
            PROJECT_ROOT,
            fileType === 'bundle' ? 'l10n' : '.',
            fileType === 'bundle' ? `bundle.l10n.${locale}.json` : `package.nls.${locale}.json`
        );

        const localeData = readJsonFile(localePath);
        
        if (!localeData) {
            results.locales[locale] = {
                hasError: true,
                error: `Failed to read locale file: ${localePath}`
            };
            results.hasError = true;
            continue;
        }

        const localeKeys = flattenObject(localeData);
        const missingKeys = findMissingKeys(enKeys, localeKeys);
        const extraKeys = findExtraKeys(enKeys, localeKeys);
        
        // Check placeholder parity for all keys
        const placeholderMismatches = [];
        for (const [key, enValue] of enKeys) {
            const localeValue = localeKeys.get(key);
            if (localeValue !== undefined) {
                const mismatch = findPlaceholderMismatch(enValue, localeValue, key);
                if (mismatch) {
                    placeholderMismatches.push(mismatch);
                }
            }
        }

        const localeHasMismatch = missingKeys.length > 0 || extraKeys.length > 0 || placeholderMismatches.length > 0;
        
        if (localeHasMismatch) {
            results.hasMismatch = true;
            results.summary.missingKeys += missingKeys.length;
            results.summary.extraKeys += extraKeys.length;
            results.summary.placeholderMismatches += placeholderMismatches.length;
        }

        results.locales[locale] = {
            missingKeys,
            extraKeys,
            placeholderMismatches,
            hasMismatch: localeHasMismatch,
            totalKeys: localeKeys.size
        };
    }

    return results;
}

/**
 * Print results
 * @param {object} bundleResults - Bundle parity results
 * @param {object} packageResults - Package parity results
 * @returns {boolean} - True if all checks passed
 */
function printResults(bundleResults, packageResults) {
    console.log('\n========================================');
    console.log('  i18n Parity Check Report');
    console.log('========================================\n');

    let allPassed = true;

    // Print bundle.l10n results
    console.log('📦 bundle.l10n.*.json files:');
    console.log('───────────────────────────────────────');
    if (bundleResults.hasError) {
        console.log(`❌ ERROR: ${bundleResults.error}`);
        allPassed = false;
    } else {
        for (const locale of LOCALES) {
            const result = bundleResults.locales[locale];
            if (result.hasError) {
                console.log(`❌ ${locale}: ERROR - ${result.error}`);
                allPassed = false;
            } else if (result.hasMismatch) {
                console.log(`❌ ${locale}: FAILED`);
                if (result.missingKeys.length > 0) {
                    console.log(`   Missing keys (${result.missingKeys.length}):`);
                    for (const key of result.missingKeys.slice(0, 5)) {
                        console.log(`     - ${key}`);
                    }
                    if (result.missingKeys.length > 5) {
                        console.log(`     ... and ${result.missingKeys.length - 5} more`);
                    }
                }
                if (result.extraKeys.length > 0) {
                    console.log(`   Extra keys (${result.extraKeys.length}):`);
                    for (const key of result.extraKeys.slice(0, 5)) {
                        console.log(`     - ${key}`);
                    }
                    if (result.extraKeys.length > 5) {
                        console.log(`     ... and ${result.extraKeys.length - 5} more`);
                    }
                }
                if (result.placeholderMismatches.length > 0) {
                    console.log(`   Placeholder mismatches (${result.placeholderMismatches.length}):`);
                    for (const mismatch of result.placeholderMismatches.slice(0, 5)) {
                        console.log(`     - ${mismatch.key}`);
                        if (mismatch.missingInLocale.length > 0) {
                            console.log(`       Missing in locale: {${mismatch.missingInLocale.join('}, {')}}`);
                        }
                        if (mismatch.extraInLocale.length > 0) {
                            console.log(`       Extra in locale: {${mismatch.extraInLocale.join('}, {')}}`);
                        }
                    }
                    if (result.placeholderMismatches.length > 5) {
                        console.log(`     ... and ${result.placeholderMismatches.length - 5} more`);
                    }
                }
                allPassed = false;
            } else {
                console.log(`✅ ${locale}: OK (${result.totalKeys} keys)`);
            }
        }
    }

    // Print package.nls results
    console.log('\n📁 package.nls.*.json files:');
    console.log('───────────────────────────────────────');
    if (packageResults.hasError) {
        console.log(`❌ ERROR: ${packageResults.error}`);
        allPassed = false;
    } else {
        for (const locale of LOCALES) {
            const result = packageResults.locales[locale];
            if (result.hasError) {
                console.log(`❌ ${locale}: ERROR - ${result.error}`);
                allPassed = false;
            } else if (result.hasMismatch) {
                console.log(`❌ ${locale}: FAILED`);
                if (result.missingKeys.length > 0) {
                    console.log(`   Missing keys (${result.missingKeys.length}):`);
                    for (const key of result.missingKeys.slice(0, 5)) {
                        console.log(`     - ${key}`);
                    }
                    if (result.missingKeys.length > 5) {
                        console.log(`     ... and ${result.missingKeys.length - 5} more`);
                    }
                }
                if (result.extraKeys.length > 0) {
                    console.log(`   Extra keys (${result.extraKeys.length}):`);
                    for (const key of result.extraKeys.slice(0, 5)) {
                        console.log(`     - ${key}`);
                    }
                    if (result.extraKeys.length > 5) {
                        console.log(`     ... and ${result.extraKeys.length - 5} more`);
                    }
                }
                if (result.placeholderMismatches.length > 0) {
                    console.log(`   Placeholder mismatches (${result.placeholderMismatches.length}):`);
                    for (const mismatch of result.placeholderMismatches.slice(0, 5)) {
                        console.log(`     - ${mismatch.key}`);
                        if (mismatch.missingInLocale.length > 0) {
                            console.log(`       Missing in locale: {${mismatch.missingInLocale.join('}, {')}}`);
                        }
                        if (mismatch.extraInLocale.length > 0) {
                            console.log(`       Extra in locale: {${mismatch.extraInLocale.join('}, {')}}`);
                        }
                    }
                    if (result.placeholderMismatches.length > 5) {
                        console.log(`     ... and ${result.placeholderMismatches.length - 5} more`);
                    }
                }
                allPassed = false;
            } else {
                console.log(`✅ ${locale}: OK (${result.totalKeys} keys)`);
            }
        }
    }

    // Command palette prefixes: same value everywhere, not just same key
    const masterData = readJsonFile(MASTER_FILES.package);
    const { violations } = checkIdenticalValues(masterData);
    if (violations.length > 0) {
        allPassed = false;
        console.log('\n❌ Command palette prefix keys differ between locales:');
        for (const v of violations) {
            console.log(`  ${v.locale}: ${v.key} = "${v.actual}" (expected "${v.expected}")`);
        }
    }

    // Summary
    console.log('\n========================================');
    console.log('  Summary');
    console.log('========================================');
    console.log(`  palette prefixes: ${violations.length === 0 ? '✅ PASS' : `❌ FAIL (${violations.length} differing values)`}`);
    const bundleTotal = bundleResults.summary.missingKeys + bundleResults.summary.extraKeys + bundleResults.summary.placeholderMismatches;
    const packageTotal = packageResults.summary.missingKeys + packageResults.summary.extraKeys + packageResults.summary.placeholderMismatches;
    console.log(`  bundle.l10n: ${bundleTotal === 0 ? '✅ PASS' : '❌ FAIL'} (${bundleResults.summary.missingKeys} missing, ${bundleResults.summary.extraKeys} extra, ${bundleResults.summary.placeholderMismatches} placeholder mismatches)`);
    console.log(`  package.nls: ${packageTotal === 0 ? '✅ PASS' : '❌ FAIL'} (${packageResults.summary.missingKeys} missing, ${packageResults.summary.extraKeys} extra, ${packageResults.summary.placeholderMismatches} placeholder mismatches)`);
    console.log('========================================\n');

    return allPassed;
}

/**
 * Main function
 */
function main() {
    console.log('🔍 Checking i18n key parity and placeholder parity...\n');

    const bundleResults = checkParity('bundle');
    const packageResults = checkParity('package');

    const allPassed = printResults(bundleResults, packageResults);
    process.exit(allPassed ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}

export { readJsonFile, extractPlaceholders, flattenObject, findMissingKeys, findExtraKeys, findPlaceholderMismatch, checkParity, printResults, checkIdenticalValues, IDENTICAL_VALUE_KEYS };