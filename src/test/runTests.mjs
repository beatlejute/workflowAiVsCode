import { runTests } from '@vscode/test-electron';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '../../');
  // Default to unit tests if no argument provided
  const testType = process.argv[2] || 'unit';
  
  let extensionTestsPath;
  let launchArgs = [];

  if (testType === 'e2e') {
    // E2E tests with fixtures workspace
    extensionTestsPath = path.resolve(__dirname, '../../dist/test/e2e/suite');
    launchArgs = [path.resolve(__dirname, '../fixtures')];
  } else {
    // Unit tests
    extensionTestsPath = path.resolve(__dirname, '../../dist/test/suite');
  }

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs,
  });
}

main().catch((err) => {
  console.error('Failed to run tests:', err);
  process.exit(1);
});
