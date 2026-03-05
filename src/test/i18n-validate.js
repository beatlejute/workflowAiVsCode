/**
 * Standalone i18n validation script
 * Run with: node src/test/i18n-validate.js
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '../../');

function validateI18n() {
  const result = {
    passed: true,
    errors: [],
    warnings: []
  };

  // Check if files exist
  const files = {
    packageNls: path.join(projectRoot, 'package.nls.json'),
    packageNlsRu: path.join(projectRoot, 'package.nls.ru.json'),
    bundle: path.join(projectRoot, 'l10n/bundle.l10n.json'),
    bundleRu: path.join(projectRoot, 'l10n/bundle.l10n.ru.json'),
    packageJson: path.join(projectRoot, 'package.json')
  };

  for (const [name, filePath] of Object.entries(files)) {
    if (!fs.existsSync(filePath)) {
      result.errors.push(`${name} does not exist: ${filePath}`);
      result.passed = false;
    }
  }

  if (!result.passed) {
    return result;
  }

  // Load JSON files
  const packageNls = JSON.parse(fs.readFileSync(files.packageNls, 'utf-8'));
  const packageNlsRu = JSON.parse(fs.readFileSync(files.packageNlsRu, 'utf-8'));
  const bundle = JSON.parse(fs.readFileSync(files.bundle, 'utf-8'));
  const bundleRu = JSON.parse(fs.readFileSync(files.bundleRu, 'utf-8'));
  const packageJson = JSON.parse(fs.readFileSync(files.packageJson, 'utf-8'));

  console.log('📦 package.nls.json keys:', Object.keys(packageNls).length);
  console.log('📦 package.nls.ru.json keys:', Object.keys(packageNlsRu).length);
  console.log('📦 l10n/bundle.l10n.json keys:', Object.keys(bundle).length);
  console.log('📦 l10n/bundle.l10n.ru.json keys:', Object.keys(bundleRu).length);
  console.log('');

  // Test 1: All package.nls.json keys have Russian translations
  const missingPackageNlsKeys = [];
  for (const key of Object.keys(packageNls)) {
    if (!(key in packageNlsRu)) {
      missingPackageNlsKeys.push(key);
    }
  }

  if (missingPackageNlsKeys.length > 0) {
    result.errors.push(
      `Missing Russian translations in package.nls.ru.json: ${missingPackageNlsKeys.slice(0, 10).join(', ')}${missingPackageNlsKeys.length > 10 ? ` (+${missingPackageNlsKeys.length - 10} more)` : ''}`
    );
    result.passed = false;
  } else {
    console.log('✅ All package.nls.json keys have Russian translations');
  }

  // Test 2: All bundle.l10n.json keys have Russian translations
  const missingBundleKeys = [];
  for (const key of Object.keys(bundle)) {
    if (!(key in bundleRu)) {
      missingBundleKeys.push(key);
    }
  }

  if (missingBundleKeys.length > 0) {
    result.errors.push(
      `Missing Russian translations in bundle.l10n.ru.json: ${missingBundleKeys.slice(0, 10).join(', ')}${missingBundleKeys.length > 10 ? ` (+${missingBundleKeys.length - 10} more)` : ''}`
    );
    result.passed = false;
  } else {
    console.log('✅ All bundle.l10n.json keys have Russian translations');
  }

  // Test 3: package.nls.ru.json should not have extra keys
  const extraPackageNlsKeys = [];
  for (const key of Object.keys(packageNlsRu)) {
    if (!(key in packageNls)) {
      extraPackageNlsKeys.push(key);
    }
  }

  if (extraPackageNlsKeys.length > 0) {
    result.warnings.push(
      `Extra keys in package.nls.ru.json: ${extraPackageNlsKeys.slice(0, 5).join(', ')}${extraPackageNlsKeys.length > 5 ? ` (+${extraPackageNlsKeys.length - 5} more)` : ''}`
    );
  } else {
    console.log('✅ package.nls.ru.json has no extra keys');
  }

  // Test 4: bundle.l10n.ru.json should not have extra keys
  const extraBundleKeys = [];
  for (const key of Object.keys(bundleRu)) {
    if (!(key in bundle)) {
      extraBundleKeys.push(key);
    }
  }

  if (extraBundleKeys.length > 0) {
    result.warnings.push(
      `Extra keys in bundle.l10n.ru.json: ${extraBundleKeys.slice(0, 5).join(', ')}${extraBundleKeys.length > 5 ? ` (+${extraBundleKeys.length - 5} more)` : ''}`
    );
  } else {
    console.log('✅ bundle.l10n.ru.json has no extra keys');
  }

  // Test 5: Parameterized strings should have consistent placeholders
  const placeholderRegex = /\{(\d+)\}/g;
  const mismatchedStrings = [];

  for (const [key, enValue] of Object.entries(bundle)) {
    if (typeof enValue !== 'string') continue;

    const ruValue = bundleRu[key];
    if (typeof ruValue !== 'string') continue;

    const enPlaceholders = new Set();
    let match;
    while ((match = placeholderRegex.exec(enValue)) !== null) {
      enPlaceholders.add(match[0]);
    }

    const ruPlaceholders = new Set();
    placeholderRegex.lastIndex = 0;
    while ((match = placeholderRegex.exec(ruValue)) !== null) {
      ruPlaceholders.add(match[0]);
    }

    if (enPlaceholders.size > 0) {
      for (const placeholder of enPlaceholders) {
        if (!ruPlaceholders.has(placeholder)) {
          mismatchedStrings.push(`${key}: missing ${placeholder} in Russian`);
        }
      }
    }
  }

  if (mismatchedStrings.length > 0) {
    result.errors.push(
      `Mismatched placeholders: ${mismatchedStrings.slice(0, 5).join(', ')}${mismatchedStrings.length > 5 ? ` (+${mismatchedStrings.length - 5} more)` : ''}`
    );
    result.passed = false;
  } else {
    console.log('✅ Parameterized strings have consistent placeholders');
  }

  // Test 6: Russian translations should not be empty
  const emptyTranslations = [];

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

  if (emptyTranslations.length > 0) {
    result.errors.push(
      `Empty translations: ${emptyTranslations.slice(0, 5).join(', ')}${emptyTranslations.length > 5 ? ` (+${emptyTranslations.length - 5} more)` : ''}`
    );
    result.passed = false;
  } else {
    console.log('✅ No empty Russian translations');
  }

  // Test 7: Check package.json uses %key% syntax
  const hardcodedStrings = [];

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

  if (hardcodedStrings.length > 0) {
    result.errors.push(
      `Hardcoded strings in package.json: ${hardcodedStrings.slice(0, 5).join(', ')}${hardcodedStrings.length > 5 ? ` (+${hardcodedStrings.length - 5} more)` : ''}`
    );
    result.passed = false;
  } else {
    console.log('✅ package.json uses %key% syntax for all translatable strings');
  }

  return result;
}

// Run validation
console.log('🔍 Validating i18n implementation...\n');

const result = validateI18n();

console.log('');
if (result.passed) {
  console.log('✅ All i18n validation checks passed!');
} else {
  console.log('❌ i18n validation failed:');
  for (const error of result.errors) {
    console.log(`  - ${error}`);
  }
}

if (result.warnings.length > 0) {
  console.log('\n⚠️ Warnings:');
  for (const warning of result.warnings) {
    console.log(`  - ${warning}`);
  }
}

process.exit(result.passed ? 0 : 1);
