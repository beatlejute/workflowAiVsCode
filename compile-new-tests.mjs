/**
 * Compile new unit test TypeScript files using esbuild
 * This script compiles new test files that were added after the last tsc compilation
 */
import * as esbuild from 'esbuild';
import { resolve, dirname, relative, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const newTestFiles = [
  'src/test/unit/commands-index.test.ts',
  'src/test/unit/status-bar.test.ts',
  'src/test/unit/notifications.test.ts',
];

// Also compile the source files they depend on
const srcFiles = [
  'src/commands/index.ts',
  'src/ui/status-bar.ts',
  'src/ui/notifications.ts',
];

const allFiles = [...newTestFiles, ...srcFiles];

console.log('Compiling new test files with esbuild...');

for (const file of allFiles) {
  const inputPath = resolve(__dirname, file);
  const outputPath = resolve(__dirname, 'dist/unit-test', file.replace(/\.ts$/, '.js'));

  mkdirSync(dirname(outputPath), { recursive: true });

  try {
    await esbuild.build({
      entryPoints: [inputPath],
      outfile: outputPath,
      bundle: false,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      sourcemap: true,
      external: ['vscode', 'mocha'],
      // Resolve imports relative to their location
      absWorkingDir: __dirname,
    });
    console.log(`✓ ${file}`);
  } catch (err) {
    console.error(`✗ ${file}: ${err.message}`);
    process.exit(1);
  }
}

console.log('Done! New test files compiled successfully.');
