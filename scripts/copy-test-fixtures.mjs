#!/usr/bin/env node
/**
 * Копирует каталоги `__fixtures__` из `src/` в сборку тестов.
 *
 * `tsc` переносит только то, что компилирует: `.ts` становится `.js`, а лежащие
 * рядом `.log`, `.json` и прочие данные остаются в исходниках. Тест ищет
 * фикстуру через `__dirname`, то есть внутри `dist/`, и падал с
 * `ENOENT: … dist\unit-test\src\test\unit\__fixtures__\…`.
 *
 * Скрипт зовётся из `test:compile-tests` и `test:compile` — после `tsc`,
 * иначе копию затрёт следующая сборка.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Куда `tsc` кладёт соответствующий проект. */
const TARGETS = [
  path.join(root, 'dist', 'unit-test', 'src'),
  path.join(root, 'dist', 'test')
];

/** @returns {string[]} каталоги `__fixtures__` внутри `src/` */
function findFixtureDirs(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) { continue; }
    const full = path.join(dir, entry.name);
    if (entry.name === '__fixtures__') { found.push(full); } else { found.push(...findFixtureDirs(full)); }
  }
  return found;
}

const srcRoot = path.join(root, 'src');
if (!fs.existsSync(srcRoot)) {
  console.error(`[copy-test-fixtures] нет каталога ${srcRoot}`);
  process.exit(1);
}

let copied = 0;
for (const fixtureDir of findFixtureDirs(srcRoot)) {
  const relative = path.relative(srcRoot, fixtureDir);
  for (const target of TARGETS) {
    // Целевой каталог появляется только после `tsc` соответствующего проекта:
    // для `test:compile-tests` это `dist/unit-test/src`, для `test:compile` —
    // `dist/test`. Отсутствует — значит этот проект сейчас не собирали.
    if (!fs.existsSync(target)) { continue; }
    const destination = path.join(target, relative);
    fs.mkdirSync(destination, { recursive: true });
    for (const file of fs.readdirSync(fixtureDir, { withFileTypes: true })) {
      if (!file.isFile()) { continue; }
      fs.copyFileSync(path.join(fixtureDir, file.name), path.join(destination, file.name));
      copied++;
    }
  }
}

console.log(`[copy-test-fixtures] скопировано файлов: ${copied}`);
