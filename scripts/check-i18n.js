#!/usr/bin/env node

/**
 * i18n Translation Completeness Checker
 * 
 * This script checks if all translation files contain all keys from the master files.
 * It verifies:
 * - package.nls.*.json files against package.nls.json
 * - l10n/bundle.l10n.*.json files against l10n/bundle.l10n.json
 * 
 * Exit codes:
 * - 0: All translations are complete
 * - 1: Missing keys found
 */

const fs = require('fs');
const path = require('path');

// Configuration
const SUPPORTED_LOCALES = ['zh-cn', 'zh-tw', 'ja', 'ko', 'de', 'fr', 'es', 'pt-br'];
const PROJECT_ROOT = path.resolve(__dirname, '..');
const PACKAGE_NLS_MASTER = path.join(PROJECT_ROOT, 'package.nls.json');
const BUNDLE_L10N_MASTER = path.join(PROJECT_ROOT, 'l10n', 'bundle.l10n.json');

/**
 * Read and parse a JSON file
 * @param {string} filePath - Path to the JSON file
 * @returns {object|null} - Parsed JSON object or null if error
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
 * Get all keys from an object
 * @param {object} obj - The object to extract keys from
 * @returns {string[]} - Array of keys
 */
function getKeys(obj) {
    return obj ? Object.keys(obj) : [];
}

/**
 * Find missing keys in a translation file compared to master
 * @param {object} master - Master translation object
 * @param {object} translation - Translation object to check
 * @returns {string[]} - Array of missing keys
 */
function findMissingKeys(master, translation) {
    const masterKeys = getKeys(master);
    const translationKeys = getKeys(translation);
    return masterKeys.filter(key => !translationKeys.includes(key));
}

/**
 * Check a single translation file
 * @param {string} masterPath - Path to master file
 * @param {string} translationPath - Path to translation file
 * @param {string} locale - Locale identifier
 * @param {string} fileType - Type of file (package.nls or bundle.l10n)
 * @returns {object} - Result object with missing keys and status
 */
function checkTranslationFile(masterPath, translationPath, locale, fileType) {
    const master = readJsonFile(masterPath);
    const translation = readJsonFile(translationPath);
    
    if (!master) {
        return {
            locale,
            fileType,
            error: `Failed to read master file: ${masterPath}`,
            missingKeys: [],
            hasError: true
        };
    }
    
    if (!translation) {
        return {
            locale,
            fileType,
            error: `Failed to read translation file: ${translationPath}`,
            missingKeys: [],
            hasError: true
        };
    }
    
    const missingKeys = findMissingKeys(master, translation);
    
    return {
        locale,
        fileType,
        missingKeys,
        hasError: false,
        isComplete: missingKeys.length === 0
    };
}

/**
 * Check all translations for a specific file type
 * @param {string} masterPath - Path to master file
 * @param {string} filePrefix - Prefix for translation files
 * @param {string} fileType - Type identifier
 * @param {string} subDir - Subdirectory (optional, relative to PROJECT_ROOT)
 * @param {string} baseDir - Base directory for paths (optional, defaults to PROJECT_ROOT)
 * @returns {object[]} - Array of results
 */
function checkAllTranslations(masterPath, filePrefix, fileType, subDir = '', baseDir = PROJECT_ROOT) {
    const results = [];
    const rootDir = baseDir || PROJECT_ROOT;

    for (const locale of SUPPORTED_LOCALES) {
        const translationPath = path.join(
            rootDir,
            subDir,
            `${filePrefix}.${locale}.json`
        );

        const result = checkTranslationFile(masterPath, translationPath, locale, fileType);
        results.push(result);
    }

    return results;
}

/**
 * Format and print results
 * @param {object[]} results - Array of result objects
 * @returns {boolean} - True if all translations are complete
 */
function printResults(results) {
    let hasErrors = false;
    let hasMissingKeys = false;
    
    console.log('\n=== i18n Translation Completeness Report ===\n');
    
    // Group results by file type
    const packageNlsResults = results.filter(r => r.fileType === 'package.nls');
    const bundleL10nResults = results.filter(r => r.fileType === 'bundle.l10n');
    
    // Print package.nls results
    console.log('📦 package.nls.*.json files:');
    console.log('─'.repeat(50));
    
    for (const result of packageNlsResults) {
        if (result.hasError) {
            console.log(`❌ ${result.locale}: ERROR - ${result.error}`);
            hasErrors = true;
        } else if (result.isComplete) {
            console.log(`✅ ${result.locale}: Complete (${getKeys(readJsonFile(path.join(PROJECT_ROOT, `package.nls.${result.locale}.json`))).length} keys)`);
        } else {
            console.log(`⚠️  ${result.locale}: Missing ${result.missingKeys.length} keys`);
            for (const key of result.missingKeys.slice(0, 5)) {
                console.log(`   - ${key}`);
            }
            if (result.missingKeys.length > 5) {
                console.log(`   ... and ${result.missingKeys.length - 5} more`);
            }
            hasMissingKeys = true;
        }
    }
    
    console.log('\n📁 l10n/bundle.l10n.*.json files:');
    console.log('─'.repeat(50));
    
    for (const result of bundleL10nResults) {
        if (result.hasError) {
            console.log(`❌ ${result.locale}: ERROR - ${result.error}`);
            hasErrors = true;
        } else if (result.isComplete) {
            console.log(`✅ ${result.locale}: Complete (${getKeys(readJsonFile(path.join(PROJECT_ROOT, 'l10n', `bundle.l10n.${result.locale}.json`))).length} keys)`);
        } else {
            console.log(`⚠️  ${result.locale}: Missing ${result.missingKeys.length} keys`);
            for (const key of result.missingKeys.slice(0, 5)) {
                console.log(`   - ${key}`);
            }
            if (result.missingKeys.length > 5) {
                console.log(`   ... and ${result.missingKeys.length - 5} more`);
            }
            hasMissingKeys = true;
        }
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('Summary:');
    
    const completeCount = results.filter(r => !r.hasError && r.isComplete).length;
    const incompleteCount = results.filter(r => !r.hasError && !r.isComplete).length;
    const errorCount = results.filter(r => r.hasError).length;
    
    console.log(`  ✅ Complete: ${completeCount}`);
    console.log(`  ⚠️  Incomplete: ${incompleteCount}`);
    console.log(`  ❌ Errors: ${errorCount}`);
    console.log('='.repeat(50));
    
    if (hasErrors) {
        console.log('\n❌ FAILED: Errors occurred while checking translations');
        return false;
    }
    
    if (hasMissingKeys) {
        console.log('\n❌ FAILED: Missing keys found in translation files');
        return false;
    }
    
    console.log('\n✅ SUCCESS: All translations are complete!');
    return true;
}

/**
 * Main function
 */
function main() {
    console.log('🔍 Checking i18n translation completeness...\n');
    
    // Check package.nls translations
    const packageNlsResults = checkAllTranslations(
        PACKAGE_NLS_MASTER,
        'package.nls',
        'package.nls'
    );
    
    // Check bundle.l10n translations
    const bundleL10nResults = checkAllTranslations(
        BUNDLE_L10N_MASTER,
        'l10n/bundle.l10n',
        'bundle.l10n'
    );
    
    // Combine results
    const allResults = [...packageNlsResults, ...bundleL10nResults];
    
    // Print results and exit with appropriate code
    const allComplete = printResults(allResults);
    process.exit(allComplete ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
    main();
}

// Export for testing
module.exports = {
    readJsonFile,
    getKeys,
    findMissingKeys,
    checkTranslationFile,
    checkAllTranslations,
    SUPPORTED_LOCALES
};
