import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Patch product.json to disable InnoSetup mutex check.
 * Prevents "Code is currently being updated" errors when running tests
 * while VS Code is open or its update mutex is stuck (Windows only).
 */
function patchMutexCheck(vscodeExecutablePath) {
  // vscodeExecutablePath is like .../Code.exe, product.json is in .../resources/app/
  const exeDir = path.dirname(vscodeExecutablePath);
  const candidates = [
    path.join(exeDir, 'resources/app/product.json'),
  ];

  // Also check one level deeper (commit-hash subfolder structure)
  try {
    const entries = fs.readdirSync(exeDir);
    for (const entry of entries) {
      candidates.push(path.join(exeDir, entry, 'resources/app/product.json'));
    }
  } catch { /* ignore */ }

  for (const pjPath of candidates) {
    try {
      if (!fs.existsSync(pjPath)) continue;
      const product = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
      if (product.win32MutexName) {
        delete product.win32MutexName;
        fs.writeFileSync(pjPath, JSON.stringify(product, null, '\t'), 'utf8');
      }
    } catch { /* skip */ }
  }
}

async function main() {
  // ELECTRON_RUN_AS_NODE makes Code.exe behave as plain Node.js, breaking VS Code test runner
  delete process.env.ELECTRON_RUN_AS_NODE;

  const extensionDevelopmentPath = path.resolve(__dirname, '../../');
  // Default to unit tests if no argument provided
  const testType = process.argv[2] || 'unit';

  let extensionTestsPath;
  let launchArgs = [];

  if (testType === 'e2e') {
    // E2E tests with fixtures workspace
    extensionTestsPath = path.resolve(__dirname, '../../dist/test/test/e2e/suite');
    launchArgs = [path.resolve(__dirname, '../fixtures')];
  } else {
    // Unit tests
    extensionTestsPath = path.resolve(__dirname, '../../dist/test/test/suite');
  }

  // Download VS Code first, then patch mutex before running
  const vscodeExecutablePath = await downloadAndUnzipVSCode();

  if (process.platform === 'win32') {
    patchMutexCheck(vscodeExecutablePath);
  }

  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: ['--disable-updates', '--user-data-dir', path.resolve(__dirname, '../../.vscode-test/user-data'), ...launchArgs],
  });
}

main().catch((err) => {
  console.error('Failed to run tests:', err);
  process.exit(1);
});
