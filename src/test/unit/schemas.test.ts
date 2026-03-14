/**
 * Unit tests for schema exports
 */

import * as assert from 'assert';
import { CONFIG_SCHEMA, PIPELINE_SCHEMA } from '../../schemas';

suite('Schemas Export Tests', () => {
  test('should export CONFIG_SCHEMA', () => {
    assert.ok(CONFIG_SCHEMA);
    assert.strictEqual(typeof CONFIG_SCHEMA, 'object');
  });

  test('should export PIPELINE_SCHEMA', () => {
    assert.ok(PIPELINE_SCHEMA);
    assert.strictEqual(typeof PIPELINE_SCHEMA, 'object');
  });
});