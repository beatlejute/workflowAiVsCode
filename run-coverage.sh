#!/bin/bash
# Run coverage without TypeScript compilation (tests already compiled)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
C8="$SCRIPT_DIR/node_modules/.bin/c8"
MOCHA="$SCRIPT_DIR/node_modules/.bin/mocha"

TEST_FILES_UNIT=$(find "$SCRIPT_DIR/dist/unit-test/src/test/unit" -name "*.test.js" | sort | tr '\n' ' ')
TEST_FILES_CMD=$(find "$SCRIPT_DIR/dist/unit-test/src/test/commands" -name "*.test.js" 2>/dev/null | sort | tr '\n' ' ')

exec "$C8" --clean "$MOCHA" --ui tdd $TEST_FILES_UNIT $TEST_FILES_CMD
