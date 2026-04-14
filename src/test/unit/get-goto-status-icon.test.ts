/**
 * Unit tests for getGotoStatusIcon function
 *
 * Tests:
 * - All status mappings from goto status to emoji
 * - Stage type patterns: script-*, increment-*, *-report, regular agent
 * - Edge cases: empty agent, conflict priorities, empty statusChange, no arrow, unknown status
 */

import * as assert from 'assert';
import { getGotoStatusIcon } from '../../ui/pipeline-tree-item-builder';

suite('getGotoStatusIcon Tests', () => {

  suite('Status to icon mapping', () => {
    test('found returns 🔍', () => {
      assert.strictEqual(getGotoStatusIcon('→ found', 'agent', 'claude-sonnet'), '🤖🔍');
    });

    test('passed returns ✔️', () => {
      assert.strictEqual(getGotoStatusIcon('→ passed', 'agent', 'claude-sonnet'), '🤖✔️');
    });

    test('relevant returns ✔️', () => {
      assert.strictEqual(getGotoStatusIcon('→ relevant', 'agent', 'claude-sonnet'), '🤖✔️');
    });

    test('completed returns 🏁', () => {
      assert.strictEqual(getGotoStatusIcon('→ completed', 'agent', 'claude-sonnet'), '🤖🏁');
    });

    test('has_ready returns 📋', () => {
      assert.strictEqual(getGotoStatusIcon('→ has_ready', 'agent', 'claude-sonnet'), '🤖📋');
    });

    test('plan_created returns 📝', () => {
      assert.strictEqual(getGotoStatusIcon('→ plan_created', 'agent', 'claude-sonnet'), '🤖📝');
    });

    test('decomposed returns ✔️', () => {
      assert.strictEqual(getGotoStatusIcon('→ decomposed', 'agent', 'claude-sonnet'), '🤖✔️');
    });

    test('completed_in_progress returns ✔️', () => {
      assert.strictEqual(getGotoStatusIcon('→ completed_in_progress', 'agent', 'claude-sonnet'), '🤖✔️');
    });

    test('done returns ✔️', () => {
      assert.strictEqual(getGotoStatusIcon('→ done', 'agent', 'claude-sonnet'), '🤖✔️');
    });

    test('failed returns ✗', () => {
      assert.strictEqual(getGotoStatusIcon('→ failed', 'agent', 'claude-sonnet'), '🤖✗');
    });

    test('irrelevant returns 🚫', () => {
      assert.strictEqual(getGotoStatusIcon('→ irrelevant', 'agent', 'claude-sonnet'), '🤖🚫');
    });

    test('error returns ⚠️', () => {
      assert.strictEqual(getGotoStatusIcon('→ error', 'agent', 'claude-sonnet'), '🤖⚠️');
    });

    test('max_reached returns 🛑', () => {
      assert.strictEqual(getGotoStatusIcon('→ max_reached', 'agent', 'claude-sonnet'), '🤖🛑');
    });

    test('blocked returns 🛑', () => {
      assert.strictEqual(getGotoStatusIcon('→ blocked', 'agent', 'claude-sonnet'), '🤖🛑');
    });

    test('empty returns ∅', () => {
      assert.strictEqual(getGotoStatusIcon('→ empty', 'agent', 'claude-sonnet'), '🤖∅');
    });

    test('no_triggers returns ∅', () => {
      assert.strictEqual(getGotoStatusIcon('→ no_triggers', 'agent', 'claude-sonnet'), '🤖∅');
    });

    test('no_plan returns ∅', () => {
      assert.strictEqual(getGotoStatusIcon('→ no_plan', 'agent', 'claude-sonnet'), '🤖∅');
    });

    test('skipped returns ⏭️', () => {
      assert.strictEqual(getGotoStatusIcon('→ skipped', 'agent', 'claude-sonnet'), '🤖⏭️');
    });

    test('default returns ↩️', () => {
      assert.strictEqual(getGotoStatusIcon('→ default', 'agent', 'claude-sonnet'), '🤖↩️');
    });

    test('in_progress returns ▶️', () => {
      assert.strictEqual(getGotoStatusIcon('→ in_progress', 'agent', 'claude-sonnet'), '🤖▶️');
    });

    test('in-progress returns ▶️', () => {
      assert.strictEqual(getGotoStatusIcon('→ in-progress', 'agent', 'claude-sonnet'), '🤖▶️');
    });

    test('in_review returns 👁️', () => {
      assert.strictEqual(getGotoStatusIcon('→ in_review', 'agent', 'claude-sonnet'), '🤖👁️');
    });

    test('review returns 👁️', () => {
      assert.strictEqual(getGotoStatusIcon('→ review', 'agent', 'claude-sonnet'), '🤖👁️');
    });

    test('ready returns 🔁', () => {
      assert.strictEqual(getGotoStatusIcon('→ ready', 'agent', 'claude-sonnet'), '🤖🔁');
    });

    test('needs_decomposition returns 🔀', () => {
      assert.strictEqual(getGotoStatusIcon('→ needs_decomposition', 'agent', 'claude-sonnet'), '🤖🔀');
    });

    test('has_gaps returns 📉', () => {
      assert.strictEqual(getGotoStatusIcon('→ has_gaps', 'agent', 'claude-sonnet'), '🤖📉');
    });
  });

  suite('Stage type patterns', () => {
    test('script-* returns ⚙️', () => {
      assert.strictEqual(getGotoStatusIcon('→ done', 'check-mcp', 'script-check-mcp'), '⚙️✔️');
    });

    test('increment-* returns 🔄', () => {
      assert.strictEqual(getGotoStatusIcon('→ done', 'increment-retry', 'increment-retry'), '🔄✔️');
    });

    test('*-report returns 📊', () => {
      assert.strictEqual(getGotoStatusIcon('→ done', 'create-report', 'claude-sonnet'), '📊✔️');
    });

    test('regular agent returns 🤖', () => {
      assert.strictEqual(getGotoStatusIcon('→ done', 'execute-task', 'claude-sonnet'), '🤖✔️');
    });

    test('another regular agent returns 🤖', () => {
      assert.strictEqual(getGotoStatusIcon('→ done', 'review-result', 'claude-sonnet'), '🤖✔️');
    });

    test('script-pick returns ⚙️', () => {
      assert.strictEqual(getGotoStatusIcon('→ done', 'pick-next-task', 'script-pick'), '⚙️✔️');
    });

    test('script-move returns ⚙️', () => {
      assert.strictEqual(getGotoStatusIcon('→ done', 'move-to-in-progress', 'script-move'), '⚙️✔️');
    });

    test('qwen-code returns 🤖', () => {
      assert.strictEqual(getGotoStatusIcon('→ done', 'execute-task', 'qwen-code'), '🤖✔️');
    });

    test('analyze-report returns 📊', () => {
      assert.strictEqual(getGotoStatusIcon('→ done', 'analyze-report', 'claude-opus'), '📊✔️');
    });
  });

  suite('Edge cases for agent parameter', () => {
    test('empty agent with report stage returns 📊', () => {
      assert.strictEqual(getGotoStatusIcon('→ done', 'create-report', ''), '📊✔️');
    });

    test('empty agent with non-report stage returns 🤖', () => {
      assert.strictEqual(getGotoStatusIcon('→ done', 'execute-task', ''), '🤖✔️');
    });

    test('script-agent + report-stage: agent wins priority (⚙️)', () => {
      assert.strictEqual(getGotoStatusIcon('→ done', 'create-report', 'script-check-mcp'), '⚙️✔️');
    });

    test('increment-stage + normal-agent: agent not increment, returns 🤖', () => {
      assert.strictEqual(getGotoStatusIcon('→ done', 'increment-retry', 'claude-sonnet'), '🤖✔️');
    });
  });

  suite('Edge cases', () => {
    test('empty statusChange returns ↩️ with type icon', () => {
      assert.strictEqual(getGotoStatusIcon('', 'agent', 'claude-sonnet'), '🤖↩️');
    });

    test('statusChange without arrow (just value)', () => {
      assert.strictEqual(getGotoStatusIcon('done', 'agent', 'claude-sonnet'), '🤖✔️');
    });

    test('unknown status returns ↩️ fallback', () => {
      assert.strictEqual(getGotoStatusIcon('→ unknown_status', 'agent', 'claude-sonnet'), '🤖↩️');
    });

    test('complex statusChange with multiple arrows - uses last segment', () => {
      assert.strictEqual(getGotoStatusIcon('todo → in_progress → done', 'agent', 'claude-sonnet'), '🤖✔️');
    });

    test('statusChange with whitespace', () => {
      assert.strictEqual(getGotoStatusIcon('→  done  ', 'agent', 'claude-sonnet'), '🤖✔️');
    });
  });

  suite('Full label format', () => {
    test('complete label format', () => {
      const result = getGotoStatusIcon('→ done', 'execute-task', 'claude-sonnet');
      assert.ok(result.includes('✔️'));
      assert.ok(result.includes('🤖'));
    });
  });
});
