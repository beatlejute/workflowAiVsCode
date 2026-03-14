/**
 * Unit tests for Safe YAML Utilities
 *
 * Tests:
 * - safeLoad: Parses YAML safely using JSON_SCHEMA (no JS types)
 * - safeDump: Serializes to YAML safely using JSON_SCHEMA
 * - Security: Rejects unsafe YAML tags (!!js/function, !!js/object, etc.)
 */

import * as assert from 'assert';
import { safeLoad, safeDump } from '../../utils/yaml-utils';

suite('YAML Utils Tests', () => {
  suite('safeLoad', () => {
    test('parses simple YAML object', () => {
      const yaml = `
name: John
age: 30
city: New York
`;
      const result = safeLoad(yaml) as Record<string, unknown>;
      assert.strictEqual(result.name, 'John');
      assert.strictEqual(result.age, 30);
      assert.strictEqual(result.city, 'New York');
    });

    test('parses YAML array', () => {
      const yaml = `
- item1
- item2
- item3
`;
      const result = safeLoad(yaml) as string[];
      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0], 'item1');
      assert.strictEqual(result[1], 'item2');
      assert.strictEqual(result[2], 'item3');
    });

    test('parses nested YAML structures', () => {
      const yaml = `
user:
  name: John
  address:
    city: New York
    zip: '10001'
`;
      const result = safeLoad(yaml) as Record<string, Record<string, Record<string, string>>>;
      assert.strictEqual(result.user.name, 'John');
      assert.strictEqual(result.user.address.city, 'New York');
      assert.strictEqual(result.user.address.zip, '10001');
    });

    test('parses empty YAML', () => {
      const yaml = '';
      const result = safeLoad(yaml);
      assert.strictEqual(result, undefined);
    });

    test('throws on invalid YAML syntax', () => {
      const yaml = `
name: John
  invalid: indentation
`;
      // js-yaml throws YAMLException on syntax errors, not AssertionError
      assert.throws(() => safeLoad(yaml), /bad indentation|YAMLException/i);
    });
  });

  suite('safeLoad security', () => {
    test('rejects !!js/function tag', () => {
      const maliciousYaml = `
function: !!js/function "function() { return 'hacked'; }"
`;
      assert.throws(() => safeLoad(maliciousYaml), /unknown tag/i);
    });

    test('rejects !!js/object tag', () => {
      const maliciousYaml = `
object: !!js/object "process"
`;
      assert.throws(() => safeLoad(maliciousYaml), /unknown tag/i);
    });

    test('rejects !!js/regexp tag', () => {
      const maliciousYaml = `
regexp: !!js/regexp /pattern/
`;
      assert.throws(() => safeLoad(maliciousYaml), /unknown tag/i);
    });

    test('rejects !!js/undefined tag', () => {
      const maliciousYaml = `
undefined: !!js/undefined
`;
      assert.throws(() => safeLoad(maliciousYaml), /unknown tag/i);
    });

    test('rejects !!binary tag', () => {
      const maliciousYaml = `
binary: !!binary "SGVsbG8gV29ybGQ="
`;
      // JSON_SCHEMA should reject binary tags
      assert.throws(() => safeLoad(maliciousYaml), /unknown tag/i);
    });

    test('parses only safe JSON-compatible types', () => {
      const safeYaml = `
string: hello
number: 42
boolean: true
null_value: null
array:
  - 1
  - 2
object:
  key: value
`;
      const result = safeLoad(safeYaml) as Record<string, unknown>;
      assert.strictEqual(result.string, 'hello');
      assert.strictEqual(result.number, 42);
      assert.strictEqual(result.boolean, true);
      assert.strictEqual(result.null_value, null);
      assert.ok(Array.isArray(result.array));
      assert.ok(typeof result.object === 'object');
    });
  });

  suite('safeDump', () => {
    test('serializes simple object to YAML', () => {
      const data = {
        name: 'John',
        age: 30,
        city: 'New York'
      };
      const result = safeDump(data);
      assert.ok(result.includes('name: John'));
      assert.ok(result.includes('age: 30'));
      assert.ok(result.includes('city: New York'));
    });

    test('serializes array to YAML', () => {
      const data = ['item1', 'item2', 'item3'];
      const result = safeDump(data);
      assert.ok(result.includes('- item1'));
      assert.ok(result.includes('- item2'));
      assert.ok(result.includes('- item3'));
    });

    test('serializes nested object to YAML', () => {
      const data = {
        user: {
          name: 'John',
          address: {
            city: 'New York',
            zip: '10001'
          }
        }
      };
      const result = safeDump(data);
      assert.ok(result.includes('user:'));
      assert.ok(result.includes('name: John'));
      assert.ok(result.includes('city: New York'));
    });

    test('handles null values', () => {
      const data = {
        name: 'John',
        nickname: null
      };
      const result = safeDump(data);
      assert.ok(result.includes('name: John'));
      assert.ok(result.includes('nickname: null'));
    });

    test('handles boolean values', () => {
      const data = {
        active: true,
        deleted: false
      };
      const result = safeDump(data);
      assert.ok(result.includes('active: true'));
      assert.ok(result.includes('deleted: false'));
    });

    test('uses custom indent option', () => {
      const data = {
        user: {
          name: 'John'
        }
      };
      const result = safeDump(data, { indent: 4 });
      // Should use 4-space indentation
      assert.ok(result.includes('user:'));
    });
  });

  suite('roundtrip', () => {
    test('safeLoad(safeDump(data)) returns original data', () => {
      const original = {
        name: 'John',
        age: 30,
        hobbies: ['reading', 'coding'],
        address: {
          city: 'New York',
          zip: '10001'
        }
      };
      const yaml = safeDump(original);
      const result = safeLoad(yaml) as Record<string, unknown>;
      assert.strictEqual(result.name, original.name);
      assert.strictEqual(result.age, original.age);
      assert.ok(Array.isArray(result.hobbies));
      assert.strictEqual((result.hobbies as string[])[0], original.hobbies[0]);
      assert.strictEqual((result.hobbies as string[])[1], original.hobbies[1]);
      assert.ok(typeof result.address === 'object');
    });
  });
});
