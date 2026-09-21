/**
 * Frontmatter Parser Unit Tests
 * 
 * Tests for parsing and serializing YAML frontmatter from markdown files.
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { parse, serialize, updateFrontmatter, extractFrontmatterRaw } from '../../data/frontmatter-parser';
import { Ticket, Plan, TicketStatus } from '../../data/types';

/** Слепок доски: настоящий тикет и план, но из репозитория, а не из `process.cwd()`. */
const FIXTURE_WORKFLOW = path.join(__dirname, '__fixtures__', 'workflow');

suite('FrontmatterParser Suite', () => {
  
  suite('parse<T>() function', () => {
    
    test('should parse a real ticket from IMPL-001.md', () => {
      const ticketPath = path.join(FIXTURE_WORKFLOW, 'tickets', 'archive', 'IMPL-001.md');
      const content = fs.readFileSync(ticketPath, 'utf-8');
      
      const result = parse<Ticket>(content);
      
      assert.ok(result.frontmatter, 'Frontmatter should be parsed');
      assert.strictEqual(result.frontmatter.id, 'IMPL-001', 'ID should match');
      assert.strictEqual(result.frontmatter.title, 'Базовая активация расширения и onboarding flow', 'Title should match');
      assert.strictEqual(result.frontmatter.status, TicketStatus.Done, 'Status should be done');
      assert.strictEqual(result.frontmatter.priority, 1, 'Priority should be 1');
      assert.ok(result.body.length > 0, 'Body should not be empty');
      assert.ok(result.body.includes('## Описание'), 'Body should contain markdown content');
    });
    
    test('should parse a real plan from PLAN-004.md', () => {
      const planPath = path.join(FIXTURE_WORKFLOW, 'plans', 'archive', 'PLAN-004.md');
      const content = fs.readFileSync(planPath, 'utf-8');
      
      const result = parse<Plan>(content);
      
      assert.ok(result.frontmatter, 'Frontmatter should be parsed');
      assert.strictEqual(result.frontmatter.id, 'PLAN-004', 'ID should match');
      assert.strictEqual(result.frontmatter.title, 'Фаза 1 — Data Layer + Core Services', 'Title should match');
      assert.ok(result.body.length > 0, 'Body should not be empty');
      assert.ok(result.body.includes('# План: Фаза 1'), 'Body should contain markdown content');
    });
    
    test('should parse frontmatter with nested objects', () => {
      const content = `---
id: TEST-001
title: Test Ticket
context:
  files:
    - src/test.ts
    - src/test2.ts
  references:
    - docs/ref.md
  notes: Some notes here
---
## Body content
`;
      
      const result = parse<Ticket>(content);
      
      assert.strictEqual(result.frontmatter.id, 'TEST-001');
      assert.ok(result.frontmatter.context, 'Context should be parsed');
      assert.strictEqual(result.frontmatter.context.files?.length, 2);
      assert.strictEqual(result.frontmatter.context.files?.[0], 'src/test.ts');
      assert.strictEqual(result.frontmatter.context.notes, 'Some notes here');
    });
    
    test('should return empty object when no frontmatter present', () => {
      const content = '# Just a body\n\nNo frontmatter here.';
      
      const result = parse<Record<string, unknown>>(content);
      
      assert.deepStrictEqual(result.frontmatter, {}, 'Frontmatter should be empty object');
      assert.strictEqual(result.body, content, 'Body should be the full content');
    });
    
    test('should handle empty frontmatter block', () => {
      const content = `---
---

Body content`;
      
      const result = parse<Record<string, unknown>>(content);
      
      assert.deepStrictEqual(result.frontmatter, {}, 'Frontmatter should be empty object');
      assert.ok(result.body.includes('Body content'), 'Body should contain content');
    });
    
    test('should handle special characters in YAML values', () => {
      const content = `---
title: "Title with: colon and 'quotes'"
description: "Line with \\\\n newline and \\\\t tab"
special: "Русский текст"
---
Body`;
      
      const result = parse<Record<string, string>>(content);
      
      assert.strictEqual(result.frontmatter.title, "Title with: colon and 'quotes'");
      assert.ok(result.frontmatter.description.includes('n'), 'Should contain escaped n character');
      assert.strictEqual(result.frontmatter.special, 'Русский текст');
    });
    
    test('should throw on invalid YAML syntax', () => {
      const content = `---
title: "Unclosed quote
invalid: yaml: here
---
Body`;
      
      assert.throws(() => {
        parse<Record<string, unknown>>(content);
      }, 'Should throw YAML exception for invalid YAML');
    });
  });
  
  suite('serialize() function', () => {
    
    test('should serialize frontmatter and body', () => {
      const frontmatter = {
        id: 'TEST-001',
        title: 'Test Ticket',
        status: 'backlog',
        priority: 2
      };
      const body = '## Description\n\nThis is a test.';
      
      const result = serialize(frontmatter, body);
      
      assert.ok(result.startsWith('---\n'), 'Should start with frontmatter marker');
      assert.ok(result.includes('id: TEST-001'), 'Should contain id');
      assert.ok(result.includes('title: Test Ticket'), 'Should contain title');
      assert.ok(result.endsWith('This is a test.'), 'Should end with body content');
    });
    
    test('should serialize nested objects', () => {
      const frontmatter = {
        id: 'TEST-002',
        context: {
          files: ['src/a.ts', 'src/b.ts'],
          notes: 'Test notes'
        }
      };
      const body = '';
      
      const result = serialize(frontmatter, body);
      
      assert.ok(result.includes('context:'), 'Should serialize nested object');
      assert.ok(result.includes('files:'), 'Should serialize array');
    });
    
    test('should serialize with proper YAML formatting', () => {
      const frontmatter = {
        id: 'TEST-003',
        tags: ['typescript', 'parser', 'yaml']
      };
      const body = 'Body text';
      
      const result = serialize(frontmatter, body);
      const parsed = parse<Record<string, unknown>>(result);
      
      assert.deepStrictEqual(parsed.frontmatter.id, 'TEST-003');
      assert.ok(Array.isArray(parsed.frontmatter.tags));
      assert.strictEqual(parsed.frontmatter.tags.length, 3);
    });
  });
  
  suite('Roundtrip tests', () => {
    
    test('roundtrip: parse → serialize → parse should produce identical result for ticket', () => {
      const ticketPath = path.join(FIXTURE_WORKFLOW, 'tickets', 'archive', 'IMPL-001.md');
      const originalContent = fs.readFileSync(ticketPath, 'utf-8');
      
      const first = parse<Ticket>(originalContent);
      const serialized = serialize(first.frontmatter as unknown as Record<string, unknown>, first.body);
      const second = parse<Ticket>(serialized);
      
      assert.deepStrictEqual(
        first.frontmatter,
        second.frontmatter,
        'Frontmatter should be identical after roundtrip'
      );
      assert.strictEqual(first.body, second.body, 'Body should be identical after roundtrip');
    });
    
    test('roundtrip: parse → serialize → parse should produce identical result for plan', () => {
      const planPath = path.join(FIXTURE_WORKFLOW, 'plans', 'archive', 'PLAN-004.md');
      const originalContent = fs.readFileSync(planPath, 'utf-8');
      
      const first = parse<Plan>(originalContent);
      const serialized = serialize(first.frontmatter as unknown as Record<string, unknown>, first.body);
      const second = parse<Plan>(serialized);
      
      assert.deepStrictEqual(
        first.frontmatter,
        second.frontmatter,
        'Frontmatter should be identical after roundtrip'
      );
      assert.strictEqual(first.body, second.body, 'Body should be identical after roundtrip');
    });
  });
  
  suite('updateFrontmatter() function', () => {
    
    test('should update specific fields while preserving others', () => {
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
      
      assert.strictEqual(result.frontmatter.id, 'TEST-001', 'ID should be preserved');
      assert.strictEqual(result.frontmatter.title, 'Original Title', 'Title should be preserved');
      assert.strictEqual(result.frontmatter.status, 'ready', 'Status should be updated');
      assert.strictEqual(result.frontmatter.priority, 2, 'Priority should be preserved');
      assert.strictEqual(result.frontmatter.updated_at, '2026-03-04T12:00:00Z', 'New field should be added');
    });
    
    test('should preserve body content when updating frontmatter', () => {
      const content = `---
id: TEST-001
title: Title
---
## Original Body
This should not change.`;
      
      const updated = updateFrontmatter(content, { status: 'done' });
      const result = parse<Record<string, unknown>>(updated);
      
      assert.ok(result.body.includes('## Original Body'), 'Body header should be preserved');
      assert.ok(result.body.includes('This should not change.'), 'Body content should be preserved');
    });
  });
  
  suite('extractFrontmatterRaw() function', () => {
    
    test('should extract raw YAML string without markers', () => {
      const content = `---
id: TEST-001
title: Test
---
Body`;
      
      const raw = extractFrontmatterRaw(content);
      
      assert.ok(raw, 'Should return non-null');
      assert.ok(raw.includes('id: TEST-001'), 'Should contain YAML content');
      assert.ok(!raw.includes('---'), 'Should not contain markers');
    });
    
    test('should return null when no frontmatter', () => {
      const content = '# No frontmatter';
      
      const raw = extractFrontmatterRaw(content);
      
      assert.strictEqual(raw, null, 'Should return null');
    });
  });
  
  suite('Edge cases', () => {
    
    test('should handle Windows line endings (CRLF)', () => {
      const content = `---\r\nid: TEST-001\r\ntitle: Windows\r\n---\r\nBody`;
      
      const result = parse<Record<string, string>>(content);
      
      assert.strictEqual(result.frontmatter.id, 'TEST-001');
      assert.strictEqual(result.frontmatter.title, 'Windows');
    });
    
    test('should handle multiline strings in YAML', () => {
      const content = `---
notes: |
  This is a
  multiline string
  in YAML
---
Body`;
      
      const result = parse<Record<string, string>>(content);
      
      assert.strictEqual(result.frontmatter.notes, 'This is a\nmultiline string\nin YAML\n');
    });
    
    test('should handle null values in YAML', () => {
      const content = `---
id: TEST-001
completed_at: null
parent_task: ~
---
Body`;
      
      const result = parse<Record<string, unknown>>(content);
      
      assert.strictEqual(result.frontmatter.id, 'TEST-001');
      assert.strictEqual(result.frontmatter.completed_at, null);
      assert.strictEqual(result.frontmatter.parent_task, null);
    });
    
    test('should handle boolean values in YAML', () => {
      const content = `---
enabled: true
disabled: false
---
Body`;
      
      const result = parse<Record<string, boolean>>(content);
      
      assert.strictEqual(result.frontmatter.enabled, true);
      assert.strictEqual(result.frontmatter.disabled, false);
    });
  });
});
