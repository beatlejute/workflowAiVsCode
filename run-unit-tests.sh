#!/bin/bash
# Run unit tests:
# 1. Compile TypeScript to CJS JS (needed for Node 25 which treats .ts as ESM natively)
# 2. Run mocha on compiled JS files
# NODE_OPTIONS cleared to avoid global ESM loader conflicts

unset NODE_OPTIONS

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Compiling TypeScript unit tests..."
"$SCRIPT_DIR/node_modules/.bin/tsc" -p "$SCRIPT_DIR/tsconfig.unit-test.json" --noEmit false 2>&1
if [ $? -ne 0 ]; then
  echo "TypeScript compilation failed"
  exit 1
fi

echo "Running unit tests..."
MOCHA="$SCRIPT_DIR/node_modules/.bin/mocha"
# Use find to collect test files (avoids glob quoting issues)
TEST_FILES=$(find "$SCRIPT_DIR/dist/unit-test/src/test/unit" -name "*.test.js" | sort)
exec "$MOCHA" --ui tdd $TEST_FILES "$@"
