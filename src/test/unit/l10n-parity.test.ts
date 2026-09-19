import * as assert from 'assert';
import { execSync } from 'child_process';
import * as path from 'path';

const PROJECT_ROOT = process.cwd();

suite('L10n Parity Tests (via check-l10n-parity.mjs)', () => {
  test('check-l10n-parity.mjs should exit with code 0 when all locales have parity', () => {
    const scriptPath = path.join(PROJECT_ROOT, 'scripts', 'check-l10n-parity.mjs');

    try {
      const _result = execSync(`node "${scriptPath}"`, {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      // If we get here, exit code was 0
      assert.ok(true, 'check-l10n-parity.mjs passed with exit code 0');
    } catch (error: any) {
      // execSync throws if exit code is non-zero
      if (error.status !== 0) {
        // Extract stdout for better error message
        const output = error.stdout ? error.stdout.toString() : '';
        assert.fail(`check-l10n-parity.mjs failed with exit code ${error.status}:\n${output}`);
      }
      throw error;
    }
  });
});
