/**
 * Unit tests for getGotoStatusIcon function
 *
 * Tests:
 * - All status mappings from goto status to emoji
 * - Stage type patterns: script-*, increment-*, *-report, regular agent
 * - Fallback agent case (fallback-* → 🔀)
 * - Edge cases: empty statusChange, no arrow, unknown status
 */

import * as assert from 'assert';
import { getGotoStatusIcon } from '../../ui/pipeline-tree-item-builder';

suite('getGotoStatusIcon Tests', () => {

  suite('Status to icon mapping', () => {
    test('found returns 🔍', () => {
      assert.strictEqual(getGotoStatusIcon('→ found', 'agent'), '🔍🤖');
    });

    test('passed returns ✔️', () => {
      assert.strictEqual(getGotoStatusIcon('→ passed', 'agent'), '✔️🤖');
    });

    test('relevant returns ✔️', () => {
      assert.strictEqual(getGotoStatusIcon('→ relevant', 'agent'), '✔️🤖');
    });

    test('completed returns 🏁', () => {
      assert.strictEqual(getGotoStatusIcon('→ completed', 'agent'), '🏁🤖');
    });

    test('has_ready returns 📋', () => {
      assert.strictEqual(getGotoStatusIcon('→ has_ready', 'agent'), '📋🤖');
    });

    test('plan_created returns 📝', () => {
      assert.strictEqual(getGotoStatusIcon('→ plan_created', 'agent'), '📝🤖');
    });

    test('decomposed returns ✔️', () => {
      assert.strictEqual(getGotoStatusIcon('→ decomposed', 'agent'), '✔️🤖');
    });

    test('completed_in_progress returns ✔️', () => {
      assert.strictEqual(getGotoStatusIcon('→ completed_in_progress', 'agent'), '✔️🤖');
    });

    test('done returns ✔️', () => {
      assert.strictEqual(getGotoStatusIcon('→ done', 'agent'), '✔️🤖');
    });

    test('failed returns ✗', () => {
      assert.strictEqual(getGotoStatusIcon('→ failed', 'agent'), '✗🤖');
    });

    test('irrelevant returns 🚫', () => {
      assert.strictEqual(getGotoStatusIcon('→ irrelevant', 'agent'), '🚫🤖');
    });

    test('error returns ⚠️', () => {
      assert.strictEqual(getGotoStatusIcon('→ error', 'agent'), '⚠️🤖');
    });

    test('max_reached returns 🛑', () => {
      assert.strictEqual(getGotoStatusIcon('→ max_reached', 'agent'), '🛑🤖');
    });

    test('blocked returns 🛑', () => {
      assert.strictEqual(getGotoStatusIcon('→ blocked', 'agent'), '🛑🤖');
    });

    test('empty returns ∅', () => {
      assert.strictEqual(getGotoStatusIcon('→ empty', 'agent'), '∅🤖');
    });

    test('no_triggers returns ∅', () => {
      assert.strictEqual(getGotoStatusIcon('→ no_triggers', 'agent'), '∅🤖');
    });

    test('no_plan returns ∅', () => {
      assert.strictEqual(getGotoStatusIcon('→ no_plan', 'agent'), '∅🤖');
    });

    test('skipped returns ⏭️', () => {
      assert.strictEqual(getGotoStatusIcon('→ skipped', 'agent'), '⏭️🤖');
    });

    test('default returns ↩️', () => {
      assert.strictEqual(getGotoStatusIcon('→ default', 'agent'), '↩️🤖');
    });

    test('in_progress returns ▶️', () => {
      assert.strictEqual(getGotoStatusIcon('→ in_progress', 'agent'), '▶️🤖');
    });

    test('in-progress returns ▶️', () => {
      assert.strictEqual(getGotoStatusIcon('→ in-progress', 'agent'), '▶️🤖');
    });

    test('in_review returns 👁️', () => {
      assert.strictEqual(getGotoStatusIcon('→ in_review', 'agent'), '👁️🤖');
    });

    test('review returns 👁️', () => {
      assert.strictEqual(getGotoStatusIcon('→ review', 'agent'), '👁️🤖');
    });

    test('ready returns 🔁', () => {
      assert.strictEqual(getGotoStatusIcon('→ ready', 'agent'), '🔁🤖');
    });

    test('needs_decomposition returns 🔀', () => {
      assert.strictEqual(getGotoStatusIcon('→ needs_decomposition', 'agent'), '🔀🤖');
    });

    test('has_gaps returns 📉', () => {
      assert.strictEqual(getGotoStatusIcon('→ has_gaps', 'agent'), '📉🤖');
    });
  });

  suite('Stage type patterns', () => {
    test('script-* returns ⚙️', () => {
      assert.strictEqual(getGotoStatusIcon('→ done', 'script-pick'), '✔️⚙️');
    });

    test('increment-* returns 🔄', () => {
      assert.strictEqual(getGotoStatusIcon('→ done', 'increment-counter'), '✔️🔄');
    });

    test('*-report returns 📊', () => {
      assert.strictEqual(getGotoStatusIcon('→ done', 'create-report'), '✔️📊');
    });

    test('regular agent returns 🤖', () => {
      assert.strictEqual(getGotoStatusIcon('→ done', 'execute-task'), '✔️🤖');
    });

    test('another regular agent returns 🤖', () => {
      assert.strictEqual(getGotoStatusIcon('→ done', 'review-result'), '✔️🤖');
    });
  });

  suite('Fallback agent', () => {
    test('fallback-* returns 🔀 instead of 🤖', () => {
      assert.strictEqual(getGotoStatusIcon('→ done', 'fallback-agent'), '✔️🔀');
    });

    test('fallback-* with other status returns correct status icon + 🔀', () => {
      assert.strictEqual(getGotoStatusIcon('→ failed', 'fallback-execute'), '✗🔀');
    });
  });

  suite('Edge cases', () => {
    test('empty statusChange returns ↩️ with type icon', () => {
      assert.strictEqual(getGotoStatusIcon('', 'agent'), '↩️🤖');
    });

    test('statusChange without arrow (just value)', () => {
      assert.strictEqual(getGotoStatusIcon('done', 'agent'), '✔️🤖');
    });

    test('unknown status returns ↩️ fallback', () => {
      assert.strictEqual(getGotoStatusIcon('→ unknown_status', 'agent'), '↩️🤖');
    });

    test('complex statusChange with multiple arrows - uses last segment', () => {
      assert.strictEqual(getGotoStatusIcon('todo → in_progress → done', 'agent'), '✔️🤖');
    });

    test('statusChange with whitespace', () => {
      assert.strictEqual(getGotoStatusIcon('→  done  ', 'agent'), '✔️🤖');
    });
  });

  suite('Full label format', () => {
    test('complete label format', () => {
      const result = getGotoStatusIcon('→ done', 'execute-task');
      assert.ok(result.includes('✔️'));
      assert.ok(result.includes('🤖'));
    });
  });
});
