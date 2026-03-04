import { runTests } from '@vscode/test-electron';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '../../');
  const extensionTestsPath = path.resolve(__dirname, '../../dist/test/test/suite');

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
  });
}

main().catch((err) => {
  console.error('Failed to run tests:', err);
  process.exit(1);
});
