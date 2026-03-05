import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../');

    // The path to the extension test runner .js file
    // Passed to `--extensionTestsPath`
    const extensionTestsPath = path.resolve(__dirname, './suite');

    // Path to the test fixtures workspace
    const testWorkspace = path.resolve(__dirname, '../../../src/test/fixtures');

    console.log('Extension Development Path:', extensionDevelopmentPath);
    console.log('Extension Tests Path:', extensionTestsPath);
    console.log('Test Workspace:', testWorkspace);

    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [testWorkspace],
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
