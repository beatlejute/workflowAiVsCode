/**
 * Unit tests for Frontmatter Parser
 */

import * as assert from 'assert';
import { parse, serialize, updateFrontmatter, extractFrontmatterRaw } from '../../data/frontmatter-parser';

suite('FrontmatterParser Unit Tests', () => {
  suite('parse', () => {
    test('parses simple frontmatter', () => {
      const content = `---
id: TEST-001
title: Test Ticket
status: backlog
---
## Body content
`;
      const result = parse<Record<string, unknown>>(content);
      assert.strictEqual(result.frontmatter.id, 'TEST-001');
      assert.strictEqual(result.frontmatter.title, 'Test Ticket');
      assert.strictEqual(result.frontmatter.status, 'backlog');
    });

    test('returns empty object when no frontmatter', () => {
      const content = '# Just a body\n\nNo frontmatter here.';
      const result = parse<Record<string, unknown>>(content);
      assert.deepStrictEqual(result.frontmatter, {});
      assert.strictEqual(result.body, content);
    });

    test('handles empty frontmatter block', () => {
      const content = `---
---

Body content`;
      const result = parse<Record<string, unknown>>(content);
      assert.deepStrictEqual(result.frontmatter, {});
      assert.ok(result.body.includes('Body content'));
    });
  });

  suite('serialize', () => {
    test('serializes frontmatter and body', () => {
      const frontmatter = {
        id: 'TEST-001',
        title: 'Test Ticket',
        status: 'backlog'
      };
      const body = '## Description\n\nThis is a test.';
      const result = serialize(frontmatter, body);
      assert.ok(result.startsWith('---\n'));
      assert.ok(result.includes('id: TEST-001'));
      assert.ok(result.includes('title: Test Ticket'));
      assert.ok(result.endsWith(body));
    });

    test('serializes nested objects', () => {
      const frontmatter = {
        id: 'TEST-002',
        context: {
          files: ['src/a.ts', 'src/b.ts'],
          notes: 'Test notes'
        }
      };
      const body = '';
      const result = serialize(frontmatter, body);
      assert.ok(result.includes('context:'));
      assert.ok(result.includes('files:'));
    });
  });

  suite('updateFrontmatter', () => {
    test('updates specific fields while preserving others', () => {
      const content = `---
id: TEST-001
title: Original Title
status: backlog
priority: 2
---
## Body
`;
      const updated = updateFrontmatter(content, {
        status: 'ready',
        updated_at: '2026-03-04T12:00:00Z'
      });
      const result = parse<Record<string, unknown>>(updated);
      assert.strictEqual(result.frontmatter.id, 'TEST-001');
      assert.strictEqual(result.frontmatter.title, 'Original Title');
      assert.strictEqual(result.frontmatter.status, 'ready');
      assert.strictEqual(result.frontmatter.priority, 2);
      assert.strictEqual(result.frontmatter.updated_at, '2026-03-04T12:00:00Z');
    });

    test('preserves body content when updating frontmatter', () => {
      const content = `---
id: TEST-001
title: Title
---
## Original Body
This should not change.`;
      const updated = updateFrontmatter(content, { status: 'done' });
      const result = parse<Record<string, unknown>>(updated);
      assert.ok(result.body.includes('## Original Body'));
      assert.ok(result.body.includes('This should not change.'));
    });
  });

  suite('extractFrontmatterRaw', () => {
    test('extracts raw YAML string without markers', () => {
      const content = `---
id: TEST-001
title: Test
---
Body`;
      const raw = extractFrontmatterRaw(content);
      assert.ok(raw);
      assert.ok(raw.includes('id: TEST-001'));
      assert.ok(!raw.includes('---'));
    });

    test('returns null when no frontmatter', () => {
      const content = '# No frontmatter';
      const raw = extractFrontmatterRaw(content);
      assert.strictEqual(raw, null);
    });
  });
});
