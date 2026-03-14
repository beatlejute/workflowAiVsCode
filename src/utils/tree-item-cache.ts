/**
 * TreeItemCache<T> - Generic cache for TreeItem memoization
 *
 * Provides a reusable cache implementation for TreeProvider components
 * to avoid recreating TreeItems for the same data.
 *
 * Features:
 * - Generic type parameter for flexibility
 * - LRU eviction with configurable max size
 * - Cache statistics for performance monitoring
 * - Clear and invalidate methods for cache management
 *
 * @template T - The type of items being cached (typically TreeItem subclasses)
 */

export class TreeItemCache<T> {
  private cache: Map<string, T>;
  private accessOrder: string[];
  private readonly maxSize: number;
  private hits: number = 0;
  private misses: number = 0;

  /**
   * Create a new TreeItemCache
   * @param maxSize - Maximum number of items to keep in cache (default: 500)
   */
  constructor(maxSize: number = 500) {
    this.cache = new Map<string, T>();
    this.accessOrder = [];
    this.maxSize = maxSize;
  }

  /**
   * Get an item from the cache
   * Updates access order for LRU eviction
   * @param key - The cache key
   * @returns The cached item or undefined if not found
   */
  get(key: string): T | undefined {
    const item = this.cache.get(key);
    if (item !== undefined) {
      this.hits++;
      // Update access order for LRU
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
        this.accessOrder.push(key);
      }
    } else {
      this.misses++;
    }
    return item;
  }

  /**
   * Set an item in the cache
   * Evicts least recently used item if cache is at max capacity
   * @param key - The cache key
   * @param value - The item to cache
   */
  set(key: string, value: T): void {
    // If key already exists, update access order and value
    if (this.cache.has(key)) {
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
        this.accessOrder.push(key); // Move to end (most recently used)
      }
      this.cache.set(key, value);
    } else {
      // Evict LRU item if at capacity
      if (this.cache.size >= this.maxSize) {
        const lruKey = this.accessOrder.shift();
        if (lruKey !== undefined) {
          this.cache.delete(lruKey);
        }
      }
      this.accessOrder.push(key);
      this.cache.set(key, value);
    }
  }

  /**
   * Check if an item exists in the cache
   * @param key - The cache key
   * @returns True if the item is cached, false otherwise
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Remove an item from the cache
   * @param key - The cache key
   * @returns True if the item was removed, false if it didn't exist
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
    }
    return deleted;
  }

  /**
   * Invalidate cache entries matching a prefix
   * Useful for invalidating all entries for a specific ticket/entity
   * @param prefix - The key prefix to match
   */
  invalidateByPrefix(prefix: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.delete(key);
    }
  }

  /**
   * Clear all items from the cache
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Get the number of items in the cache
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics for performance monitoring
   * @returns Object containing hits, misses, size, and hit rate
   */
  getStats(): {
    hits: number;
    misses: number;
    size: number;
    maxSize: number;
    hitRate: number;
  } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: total > 0 ? (this.hits / total) * 100 : 0
    };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }
}
