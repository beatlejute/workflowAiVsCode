/**
 * Unit tests for UI utils functions
 *
 * Tests:
 * - getReviewBadges() returns correct badges for passed/failed reviews
 * - getReviewBadges() shows max 4 badges with +N indicator
 * - getReviewBadges() returns empty string for no reviews
 */

import * as assert from 'assert';
import { getReviewBadges, clearReviewBadgesCache, getReviewBadgesCacheStats } from '../../ui/utils';
import { ReviewEntry } from '../../data/types';

suite('UI Utils Tests', () => {

  suite('getReviewBadges', () => {

    test('returns empty string for undefined reviews', () => {
      const result = getReviewBadges(undefined);
      assert.strictEqual(result, '', 'Should return empty string for undefined');
    });

    test('returns empty string for empty reviews array', () => {
      const result = getReviewBadges([]);
      assert.strictEqual(result, '', 'Should return empty string for empty array');
    });

    test('returns ✅ for single passed review', () => {
      const reviews: ReviewEntry[] = [
        { date: '2026-03-06', status: 'passed', icon: '✅', summary: 'Good work' }
      ];
      const result = getReviewBadges(reviews);
      assert.strictEqual(result, '✅', 'Should show ✅ for passed review');
    });

    test('returns ❌ for single failed review', () => {
      const reviews: ReviewEntry[] = [
        { date: '2026-03-06', status: 'failed', icon: '❌', summary: 'Needs fixes' }
      ];
      const result = getReviewBadges(reviews);
      assert.strictEqual(result, '❌', 'Should show ❌ for failed review');
    });

    test('shows multiple badges in correct order', () => {
      const reviews: ReviewEntry[] = [
        { date: '2026-03-06', status: 'passed', icon: '✅', summary: 'Good' },
        { date: '2026-03-07', status: 'failed', icon: '❌', summary: 'Bad' },
        { date: '2026-03-08', status: 'passed', icon: '✅', summary: 'Good' }
      ];
      const result = getReviewBadges(reviews);
      assert.strictEqual(result, '✅❌✅', 'Should show badges in order');
    });

    test('shows max 4 badges', () => {
      const reviews: ReviewEntry[] = [
        { date: '2026-03-06', status: 'passed', icon: '✅', summary: 'Good' },
        { date: '2026-03-07', status: 'passed', icon: '✅', summary: 'Good' },
        { date: '2026-03-08', status: 'passed', icon: '✅', summary: 'Good' },
        { date: '2026-03-09', status: 'passed', icon: '✅', summary: 'Good' },
        { date: '2026-03-10', status: 'failed', icon: '❌', summary: 'Bad' }
      ];
      const result = getReviewBadges(reviews);
      const badgeCount = (result.match(/✅/g) || []).length + (result.match(/❌/g) || []).length;
      assert.strictEqual(badgeCount, 4, 'Should show max 4 badges');
    });

    test('shows … indicator for more than 4 reviews', () => {
      const reviews: ReviewEntry[] = [
        { date: '2026-03-06', status: 'passed', icon: '✅', summary: 'Good' },
        { date: '2026-03-07', status: 'passed', icon: '✅', summary: 'Good' },
        { date: '2026-03-08', status: 'passed', icon: '✅', summary: 'Good' },
        { date: '2026-03-09', status: 'passed', icon: '✅', summary: 'Good' },
        { date: '2026-03-10', status: 'failed', icon: '❌', summary: 'Bad' },
        { date: '2026-03-11', status: 'passed', icon: '✅', summary: 'Good' }
      ];
      const result = getReviewBadges(reviews);
      assert.ok(result.includes('…'), 'Should show … for truncated reviews');
    });

    test('shows … for exactly 5 reviews', () => {
      const reviews: ReviewEntry[] = [
        { date: '2026-03-06', status: 'passed', icon: '✅', summary: 'Good' },
        { date: '2026-03-07', status: 'passed', icon: '✅', summary: 'Good' },
        { date: '2026-03-08', status: 'passed', icon: '✅', summary: 'Good' },
        { date: '2026-03-09', status: 'passed', icon: '✅', summary: 'Good' },
        { date: '2026-03-10', status: 'passed', icon: '✅', summary: 'Good' }
      ];
      const result = getReviewBadges(reviews);
      assert.ok(result.includes('…'), 'Should show … for truncated reviews');
    });

    test('does not show … for exactly 4 reviews', () => {
      const reviews: ReviewEntry[] = [
        { date: '2026-03-06', status: 'passed', icon: '✅', summary: 'Good' },
        { date: '2026-03-07', status: 'passed', icon: '✅', summary: 'Good' },
        { date: '2026-03-08', status: 'passed', icon: '✅', summary: 'Good' },
        { date: '2026-03-09', status: 'passed', icon: '✅', summary: 'Good' }
      ];
      const result = getReviewBadges(reviews);
      assert.strictEqual(result, '✅✅✅✅', 'Should show exactly 4 badges without …');
      assert.ok(!result.includes('…'), 'Should not show … for exactly 4 reviews');
    });

    test('handles 10+ reviews correctly', () => {
      const reviews: ReviewEntry[] = Array.from({ length: 10 }, (_, i) => ({
        date: `2026-03-${String(i + 1).padStart(2, '0')}`,
        status: i % 2 === 0 ? 'passed' : 'failed',
        icon: i % 2 === 0 ? '✅' : '❌',
        summary: `Review ${i + 1}`
      }));
      const result = getReviewBadges(reviews);
      const badgeCount = (result.match(/✅/g) || []).length + (result.match(/❌/g) || []).length;
      assert.strictEqual(badgeCount, 4, 'Should show max 4 badges');
      assert.ok(result.includes('…'), 'Should show … for truncated reviews');
    });

  });

  suite('clearReviewBadgesCache', () => {
    test('clears the cache', () => {
      const reviews: ReviewEntry[] = [
        { date: '2026-03-06', status: 'passed', icon: '✅', summary: 'Good' }
      ];
      getReviewBadges(reviews);
      clearReviewBadgesCache();
      const stats = getReviewBadgesCacheStats();
      assert.strictEqual(stats.size, 0, 'Cache should be empty after clear');
    });
  });

  suite('getReviewBadgesCacheStats', () => {
    test('returns cache statistics', () => {
      clearReviewBadgesCache();
      const reviews: ReviewEntry[] = [
        { date: '2026-03-06', status: 'passed', icon: '✅', summary: 'Good' }
      ];
      getReviewBadges(reviews);
      const stats = getReviewBadgesCacheStats();
      assert.ok('hits' in stats, 'Stats should have hits');
      assert.ok('misses' in stats, 'Stats should have misses');
      assert.ok('size' in stats, 'Stats should have size');
    });
  });

});
