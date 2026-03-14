/**
 * Unit tests for Tooltip Utilities
 *
 * Tests:
 * - buildTicketTooltip: Creates MarkdownString with ticket details
 * - buildPlanTooltip: Creates MarkdownString with plan details
 * - parseMarkdownFrontmatter: Parses frontmatter from markdown content
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { buildTicketTooltip, buildPlanTooltip, parseMarkdownFrontmatter } from '../../utils/tooltip-utils';
import { Ticket, TicketStatus, Plan } from '../../data/types';

suite('Tooltip Utils Tests', () => {
  suite('buildTicketTooltip', () => {
    test('creates a MarkdownString with basic ticket info', () => {
      const ticket: Ticket = {
        id: 'IMPL-001',
        title: 'Test Ticket',
        status: TicketStatus.InProgress,
        priority: 2,
        type: 'implementation',
        dependencies: [],
        conditions: [],
        context: {},
        tags: ['test'],
        complexity: 'medium',
        parent_plan: 'PLAN-001',
        parent_task: '',
        created_at: '2026-03-10T00:00:00Z',
        updated_at: '2026-03-10T00:00:00Z',
        completed_at: ''
      };

      const result = buildTicketTooltip(ticket);

      assert.ok(result instanceof vscode.MarkdownString);
      assert.strictEqual(result.isTrusted, true);
      assert.strictEqual(result.supportHtml, true);
    });

    test('includes ticket ID and title in tooltip', () => {
      const ticket: Ticket = {
        id: 'IMPL-001',
        title: 'Test Ticket Title',
        status: TicketStatus.InProgress,
        priority: 2,
        type: 'implementation',
        dependencies: [],
        conditions: [],
        context: {},
        tags: ['test'],
        complexity: 'medium',
        parent_plan: 'PLAN-001',
        parent_task: '',
        created_at: '2026-03-10T00:00:00Z',
        updated_at: '2026-03-10T00:00:00Z',
        completed_at: ''
      };

      const result = buildTicketTooltip(ticket);

      // Check that the value contains expected content
      assert.ok(result.value.includes('IMPL-001'));
      assert.ok(result.value.includes('Test Ticket Title'));
    });

    test('includes status, priority, and type in tooltip', () => {
      const ticket: Ticket = {
        id: 'IMPL-001',
        title: 'Test Ticket',
        status: TicketStatus.InProgress,
        priority: 2,
        type: 'implementation',
        dependencies: [],
        conditions: [],
        context: {},
        tags: ['test'],
        complexity: 'medium',
        parent_plan: 'PLAN-001',
        parent_task: '',
        created_at: '2026-03-10T00:00:00Z',
        updated_at: '2026-03-10T00:00:00Z',
        completed_at: ''
      };

      const result = buildTicketTooltip(ticket);

      assert.ok(result.value.includes('in-progress'));
      assert.ok(result.value.includes('High')); // Priority 2 = High
      assert.ok(result.value.includes('implementation'));
    });

    test('includes dependencies when present', () => {
      const ticket: Ticket = {
        id: 'IMPL-001',
        title: 'Test Ticket',
        status: TicketStatus.InProgress,
        priority: 2,
        type: 'implementation',
        dependencies: ['IMPL-000', 'IMPL-002'],
        conditions: [],
        context: {},
        tags: ['test'],
        complexity: 'medium',
        parent_plan: 'PLAN-001',
        parent_task: '',
        created_at: '2026-03-10T00:00:00Z',
        updated_at: '2026-03-10T00:00:00Z',
        completed_at: ''
      };

      const result = buildTicketTooltip(ticket);

      assert.ok(result.value.includes('IMPL-000'));
      assert.ok(result.value.includes('IMPL-002'));
    });

    test('includes parent plan when present', () => {
      const ticket: Ticket = {
        id: 'IMPL-001',
        title: 'Test Ticket',
        status: TicketStatus.InProgress,
        priority: 2,
        type: 'implementation',
        dependencies: [],
        conditions: [],
        context: {},
        tags: ['test'],
        complexity: 'medium',
        parent_plan: 'PLAN-001',
        parent_task: '',
        created_at: '2026-03-10T00:00:00Z',
        updated_at: '2026-03-10T00:00:00Z',
        completed_at: ''
      };

      const result = buildTicketTooltip(ticket);

      assert.ok(result.value.includes('PLAN-001'));
    });

    test('includes notes when present in context', () => {
      const ticket: Ticket = {
        id: 'IMPL-001',
        title: 'Test Ticket',
        status: TicketStatus.InProgress,
        priority: 2,
        type: 'implementation',
        dependencies: [],
        conditions: [],
        context: { notes: 'Test notes for this ticket' },
        tags: ['test'],
        complexity: 'medium',
        parent_plan: 'PLAN-001',
        parent_task: '',
        created_at: '2026-03-10T00:00:00Z',
        updated_at: '2026-03-10T00:00:00Z',
        completed_at: ''
      };

      const result = buildTicketTooltip(ticket);

      assert.ok(result.value.includes('Test notes for this ticket'));
    });

    test('includes reviews when present', () => {
      const ticket: Ticket = {
        id: 'IMPL-001',
        title: 'Test Ticket',
        status: TicketStatus.Review,
        priority: 2,
        type: 'implementation',
        dependencies: [],
        conditions: [],
        context: {},
        tags: ['test'],
        complexity: 'medium',
        parent_plan: 'PLAN-001',
        parent_task: '',
        created_at: '2026-03-10T00:00:00Z',
        updated_at: '2026-03-10T00:00:00Z',
        completed_at: '',
        reviews: [
          { date: '2026-03-10', status: 'passed', icon: '✅', summary: 'Looks good' },
          { date: '2026-03-09', status: 'failed', icon: '❌', summary: 'Needs changes' }
        ]
      };

      const result = buildTicketTooltip(ticket);

      assert.ok(result.value.includes('Review'));
      assert.ok(result.value.includes('✅')); // passed icon
      assert.ok(result.value.includes('❌')); // failed icon
      assert.ok(result.value.includes('Looks good'));
      assert.ok(result.value.includes('Needs changes'));
    });

    test('handles all priority levels correctly', () => {
      const priorities = [
        { level: 1, label: 'Critical' },
        { level: 2, label: 'High' },
        { level: 3, label: 'Medium' },
        { level: 4, label: 'Low' },
        { level: 5, label: 'Trivial' }
      ];

      for (const { level, label } of priorities) {
        const ticket: Ticket = {
          id: `IMPL-00${level}`,
          title: 'Test Ticket',
          status: TicketStatus.Backlog,
          priority: level,
          type: 'implementation',
          dependencies: [],
          conditions: [],
          context: {},
          tags: ['test'],
          complexity: 'medium',
          parent_plan: '',
          parent_task: '',
          created_at: '2026-03-10T00:00:00Z',
          updated_at: '2026-03-10T00:00:00Z',
          completed_at: ''
        };

        const result = buildTicketTooltip(ticket);
        assert.ok(result.value.includes(label), `Priority ${level} should show ${label}`);
      }
    });
  });

  suite('buildPlanTooltip', () => {
    test('creates a MarkdownString with basic plan info', () => {
      const plan: Plan = {
        id: 'PLAN-001',
        title: 'Test Plan',
        status: 'active',
        author: 'Test Author',
        created_at: '2026-03-10T00:00:00Z',
        updated_at: '2026-03-10T00:00:00Z',
        completed_at: '',
        previous_plan: '',
        related_reports: [],
        folder: 'current'
      };

      const result = buildPlanTooltip(plan);

      assert.ok(result instanceof vscode.MarkdownString);
      assert.strictEqual(result.isTrusted, true);
    });

    test('includes plan ID and title in tooltip', () => {
      const plan: Plan = {
        id: 'PLAN-001',
        title: 'Test Plan Title',
        status: 'active',
        author: 'Test Author',
        created_at: '2026-03-10T00:00:00Z',
        updated_at: '2026-03-10T00:00:00Z',
        completed_at: '',
        previous_plan: '',
        related_reports: [],
        folder: 'current'
      };

      const result = buildPlanTooltip(plan);

      assert.ok(result.value.includes('PLAN-001'));
      assert.ok(result.value.includes('Test Plan Title'));
    });

    test('includes status, author, and dates in tooltip', () => {
      const plan: Plan = {
        id: 'PLAN-001',
        title: 'Test Plan',
        status: 'active',
        author: 'John Doe',
        created_at: '2026-03-10T00:00:00Z',
        updated_at: '2026-03-11T00:00:00Z',
        completed_at: '',
        previous_plan: '',
        related_reports: [],
        folder: 'current'
      };

      const result = buildPlanTooltip(plan);

      assert.ok(result.value.includes('active'));
      assert.ok(result.value.includes('John Doe'));
      assert.ok(result.value.includes('2026-03-10T00:00:00Z'));
      assert.ok(result.value.includes('2026-03-11T00:00:00Z'));
    });

    test('includes previous plan when present', () => {
      const plan: Plan = {
        id: 'PLAN-002',
        title: 'Test Plan',
        status: 'active',
        author: 'Test Author',
        created_at: '2026-03-10T00:00:00Z',
        updated_at: '2026-03-10T00:00:00Z',
        completed_at: '',
        previous_plan: 'PLAN-001',
        related_reports: [],
        folder: 'current'
      };

      const result = buildPlanTooltip(plan);

      assert.ok(result.value.includes('PLAN-001'));
    });

    test('includes related reports when present', () => {
      const plan: Plan = {
        id: 'PLAN-001',
        title: 'Test Plan',
        status: 'active',
        author: 'Test Author',
        created_at: '2026-03-10T00:00:00Z',
        updated_at: '2026-03-10T00:00:00Z',
        completed_at: '',
        previous_plan: '',
        related_reports: ['REPORT-001', 'REPORT-002'],
        folder: 'current'
      };

      const result = buildPlanTooltip(plan);

      assert.ok(result.value.includes('REPORT-001'));
      assert.ok(result.value.includes('REPORT-002'));
    });
  });

  suite('parseMarkdownFrontmatter', () => {
    test('parses frontmatter from markdown content', () => {
      const content = `---
id: TEST-001
title: Test Ticket
status: backlog
---

# Test Body

This is the test body content.
`;

      const result = parseMarkdownFrontmatter<{ id: string; title: string; status: string }>(content);

      assert.strictEqual(result.frontmatter.id, 'TEST-001');
      assert.strictEqual(result.frontmatter.title, 'Test Ticket');
      assert.strictEqual(result.frontmatter.status, 'backlog');
      assert.ok(result.body.includes('# Test Body'));
      assert.ok(result.body.includes('This is the test body content.'));
    });

    test('returns empty object when no frontmatter present', () => {
      const content = '# Just a body\n\nNo frontmatter here.';

      const result = parseMarkdownFrontmatter<Record<string, unknown>>(content);

      assert.deepStrictEqual(result.frontmatter, {});
      assert.strictEqual(result.body, content);
    });

    test('parses complex frontmatter with arrays and nested objects', () => {
      const content = `---
id: TEST-002
title: Complex Ticket
dependencies:
  - DEP-001
  - DEP-002
context:
  notes: Test notes
  files:
    - file1.ts
    - file2.ts
---

Body content here.
`;

      interface TestFrontmatter {
        id: string;
        title: string;
        dependencies: string[];
        context: {
          notes: string;
          files: string[];
        };
      }

      const result = parseMarkdownFrontmatter<TestFrontmatter>(content);

      assert.strictEqual(result.frontmatter.id, 'TEST-002');
      assert.strictEqual(result.frontmatter.title, 'Complex Ticket');
      assert.deepStrictEqual(result.frontmatter.dependencies, ['DEP-001', 'DEP-002']);
      assert.strictEqual(result.frontmatter.context.notes, 'Test notes');
      assert.deepStrictEqual(result.frontmatter.context.files, ['file1.ts', 'file2.ts']);
      assert.ok(result.body.includes('Body content here.'));
    });

    test('handles CRLF line endings correctly', () => {
      const content = `---\r\nid: TEST-003\r\ntitle: CRLF Test\r\n---\r\n\r\nBody with CRLF.\r\n`;

      const result = parseMarkdownFrontmatter<{ id: string; title: string }>(content);

      assert.strictEqual(result.frontmatter.id, 'TEST-003');
      assert.strictEqual(result.frontmatter.title, 'CRLF Test');
      assert.ok(result.body.includes('Body with CRLF.'));
    });
  });
});
