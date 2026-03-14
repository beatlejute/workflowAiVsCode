/**
 * UI utility functions shared across UI components
 */

import { ReviewEntry } from '../data/types';
import { TreeItemCache } from '../utils/tree-item-cache';

/**
 * Extract a plan ID (e.g. "PLAN-013") from a parent_plan field value,
 * which may be a bare ID, a relative path, or a full path ending in .md.
 */
export function extractPlanId(parentPlan: string): string {
  if (!parentPlan) { return ''; }
  const basename = parentPlan.replace(/\\/g, '/').split('/').pop() || parentPlan;
  return basename.replace(/\.md$/, '');
}

/**
 * Cache key generator for review badges
 * Creates a unique key based on the reviews array
 */
function getReviewCacheKey(reviews?: ReviewEntry[]): string {
  if (!reviews || reviews.length === 0) {
    return 'empty';
  }
  // Create a hash based on review count and statuses
  return `${reviews.length}:${reviews.map(r => r.status).join(',')}`;
}

/**
 * Cache for review badges results
 * Maps cache key to precomputed badge string
 */
const reviewBadgesCache = new TreeItemCache<string>();

/**
 * Generate review badges string for a ticket.
 * Shows ✅ for passed, ❌ for failed. Max 4 most recent badges, prefixed with … if truncated.
 *
 * Uses memoization to avoid recomputing badges for identical review arrays.
 */
export function getReviewBadges(reviews?: ReviewEntry[]): string {
  const cacheKey = getReviewCacheKey(reviews);

  // Check cache first
  if (reviewBadgesCache.has(cacheKey)) {
    return reviewBadgesCache.get(cacheKey)!;
  }

  if (!reviews || reviews.length === 0) {
    reviewBadgesCache.set(cacheKey, '');
    return '';
  }

  const maxBadges = 4;
  let badges = '';
  const start = Math.max(0, reviews.length - maxBadges);

  if (reviews.length > maxBadges) {
    badges += '…';
  }

  for (let i = start; i < reviews.length; i++) {
    badges += reviews[i].icon;
  }

  reviewBadgesCache.set(cacheKey, badges);
  return badges;
}

/**
 * Clear the review badges cache
 * Call this when reviews are updated to invalidate stale entries
 */
export function clearReviewBadgesCache(): void {
  reviewBadgesCache.clear();
}

/**
 * Get cache statistics for debugging
 */
export function getReviewBadgesCacheStats(): { hits: number; misses: number; size: number } {
  const stats = reviewBadgesCache.getStats();
  return {
    hits: stats.hits,
    misses: stats.misses,
    size: stats.size
  };
}
