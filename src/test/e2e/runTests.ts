import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    // __dirname is dist/test/test/e2e, so we need to go up 4 levels to reach project root
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../..');

    // The path to the extension test runner .js file
    // Passed to `--extensionTestsPath`
    const extensionTestsPath = path.resolve(__dirname, './suite');

    // Path to the test fixtures workspace
    // From dist/test/test/e2e, go up 4 levels to project root, then into src/test/fixtures
    const testWorkspace = path.resolve(__dirname, '../../../../src/test/fixtures');

    console.log('Extension Development Path:', extensionDevelopmentPath);
    console.log('Extension Tests Path:', extensionTestsPath);
    console.log('Test Workspace:', testWorkspace);

    // Download and use a fresh VS Code instance to avoid update conflicts
    console.log('Downloading fresh VS Code instance for testing...');

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [testWorkspace],
      // Let @vscode/test-electron download and manage VS Code
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
