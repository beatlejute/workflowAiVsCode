import * as assert from 'assert';
import { TreeItemCache } from '../../utils/tree-item-cache';

suite('TreeItemCache', () => {
  let cache: TreeItemCache<string>;

  setup(() => {
    cache = new TreeItemCache<string>(500);
  });

  suite('constructor', () => {
    test('creates cache with default max size', () => {
      const defaultCache = new TreeItemCache<string>();
      const stats = defaultCache.getStats();
      assert.strictEqual(stats.maxSize, 500);
    });

    test('creates cache with custom max size', () => {
      const customCache = new TreeItemCache<string>(50);
      const stats = customCache.getStats();
      assert.strictEqual(stats.maxSize, 50);
    });
  });

  suite('get', () => {
    test('returns undefined for non-existent key', () => {
      const result = cache.get('nonexistent');
      assert.strictEqual(result, undefined);
    });

    test('returns cached value for existing key', () => {
      cache.set('key1', 'value1');
      const result = cache.get('key1');
      assert.strictEqual(result, 'value1');
    });

    test('updates access order on get (LRU)', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Access key1 to make it recently used
      cache.get('key1');

      // Access order should be: key2, key3, key1
      cache.set('key4', 'value4');
      cache.set('key5', 'value5');

      // Fill cache to exactly capacity (500), then add one more to trigger eviction of key2 (LRU)
      for (let i = 6; i <= 501; i++) {
        cache.set(`key${i}`, `value${i}`);
      }

      // key2 should be evicted (least recently used)
      assert.strictEqual(cache.get('key2'), undefined);
      // key1 should still exist (was accessed recently)
      assert.strictEqual(cache.get('key1'), 'value1');
    });
  });

  suite('set', () => {
    test('stores key-value pair', () => {
      cache.set('key1', 'value1');
      assert.strictEqual(cache.get('key1'), 'value1');
    });

    test('updates existing key', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'updatedValue');
      assert.strictEqual(cache.get('key1'), 'updatedValue');
    });

    test('evicts LRU item when at max capacity', () => {
      const smallCache = new TreeItemCache<string>(3);
      
      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');
      
      // Adding 4th item should evict key1 (LRU)
      smallCache.set('key4', 'value4');
      
      assert.strictEqual(smallCache.get('key1'), undefined);
      assert.strictEqual(smallCache.get('key2'), 'value2');
      assert.strictEqual(smallCache.get('key3'), 'value3');
      assert.strictEqual(smallCache.get('key4'), 'value4');
    });
  });

  suite('has', () => {
    test('returns false for non-existent key', () => {
      assert.strictEqual(cache.has('nonexistent'), false);
    });

    test('returns true for existing key', () => {
      cache.set('key1', 'value1');
      assert.strictEqual(cache.has('key1'), true);
    });
  });

  suite('delete', () => {
    test('returns false for non-existent key', () => {
      const result = cache.delete('nonexistent');
      assert.strictEqual(result, false);
    });

    test('returns true and removes existing key', () => {
      cache.set('key1', 'value1');
      const result = cache.delete('key1');
      assert.strictEqual(result, true);
      assert.strictEqual(cache.get('key1'), undefined);
    });

    test('updates access order on delete', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.delete('key1');
      cache.set('key3', 'value3');
      
      // After deletion, key1 is removed from access order
      assert.strictEqual(cache.has('key1'), false);
    });
  });

  suite('invalidateByPrefix', () => {
    test('removes all keys with matching prefix', () => {
      cache.set('ticket:1:v1', 'item1');
      cache.set('ticket:1:v2', 'item2');
      cache.set('ticket:2:v1', 'item3');
      cache.set('plan:1:v1', 'item4');
      
      cache.invalidateByPrefix('ticket:1:');
      
      assert.strictEqual(cache.get('ticket:1:v1'), undefined);
      assert.strictEqual(cache.get('ticket:1:v2'), undefined);
      assert.strictEqual(cache.get('ticket:2:v1'), 'item3');
      assert.strictEqual(cache.get('plan:1:v1'), 'item4');
    });

    test('does nothing if no keys match prefix', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      cache.invalidateByPrefix('nonexistent:');
      
      assert.strictEqual(cache.get('key1'), 'value1');
      assert.strictEqual(cache.get('key2'), 'value2');
    });
  });

  suite('clear', () => {
    test('removes all items from cache', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      cache.clear();
      
      assert.strictEqual(cache.size, 0);
      assert.strictEqual(cache.get('key1'), undefined);
      assert.strictEqual(cache.get('key2'), undefined);
      assert.strictEqual(cache.get('key3'), undefined);
    });

    test('resets access order', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      
      const stats = cache.getStats();
      assert.strictEqual(stats.size, 0);
    });
  });

  suite('size', () => {
    test('returns 0 for empty cache', () => {
      assert.strictEqual(cache.size, 0);
    });

    test('returns correct count after adding items', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      assert.strictEqual(cache.size, 3);
    });

    test('returns correct count after deletion', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.delete('key1');
      
      assert.strictEqual(cache.size, 1);
    });
  });

  suite('getStats', () => {
    test('returns correct statistics', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('key3'); // miss

      const stats = cache.getStats();

      assert.strictEqual(stats.hits, 2);
      assert.strictEqual(stats.misses, 1);
      assert.strictEqual(stats.size, 2);
      assert.strictEqual(stats.maxSize, 500);
      assert.strictEqual(stats.hitRate, (2 / 3) * 100);
    });

    test('returns 0 hit rate for empty cache', () => {
      const stats = cache.getStats();
      assert.strictEqual(stats.hitRate, 0);
    });
  });

  suite('resetStats', () => {
    test('resets hits and misses to 0', () => {
      cache.set('key1', 'value1');
      cache.get('key1'); // hit
      cache.get('key2'); // miss
      
      cache.resetStats();
      
      const stats = cache.getStats();
      assert.strictEqual(stats.hits, 0);
      assert.strictEqual(stats.misses, 0);
      assert.strictEqual(stats.size, 1); // size should not be affected
    });
  });

  suite('integration', () => {
    test('handles complex access patterns correctly', () => {
      const lruCache = new TreeItemCache<string>(5);

      // Add items
      for (let i = 1; i <= 5; i++) {
        lruCache.set(`key${i}`, `value${i}`);
      }

      // Access key1 and key3 to make them recently used
      lruCache.get('key1');
      lruCache.get('key3');

      // Add 3 new items to trigger 3 evictions (key2, key4, key5 in LRU order)
      lruCache.set('key6', 'value6');
      lruCache.set('key7', 'value7');
      lruCache.set('key8', 'value8');

      // key2, key4, key5 should be evicted (in order)
      assert.strictEqual(lruCache.get('key2'), undefined);
      assert.strictEqual(lruCache.get('key4'), undefined);
      assert.strictEqual(lruCache.get('key5'), undefined);

      // key1, key3, key6, key7, key8 should exist
      assert.strictEqual(lruCache.get('key1'), 'value1');
      assert.strictEqual(lruCache.get('key3'), 'value3');
      assert.strictEqual(lruCache.get('key6'), 'value6');
      assert.strictEqual(lruCache.get('key7'), 'value7');
      assert.strictEqual(lruCache.get('key8'), 'value8');
    });

    test('maintains cache consistency after multiple operations', () => {
      for (let round = 0; round < 10; round++) {
        cache.set(`round${round}:key1`, 'value1');
        cache.set(`round${round}:key2`, 'value2');
        cache.get(`round${round}:key1`);
        cache.delete(`round${round}:key2`);
      }

      // Verify final state
      assert.strictEqual(cache.get('round9:key1'), 'value1');
      assert.strictEqual(cache.get('round9:key2'), undefined);
    });

    test('evicts LRU items when cache reaches maxSize=500', () => {
      const limitedCache = new TreeItemCache<string>(500);

      // Fill cache to exactly maxSize
      for (let i = 0; i < 500; i++) {
        limitedCache.set(`key${i}`, `value${i}`);
      }

      // Verify cache is at capacity
      assert.strictEqual(limitedCache.size, 500);

      // Add one more item to trigger eviction
      limitedCache.set('key500', 'value500');

      // Size should not exceed maxSize
      assert.strictEqual(limitedCache.size, 500);

      // First item (key0) should be evicted (LRU)
      assert.strictEqual(limitedCache.get('key0'), undefined);

      // Last item should exist
      assert.strictEqual(limitedCache.get('key500'), 'value500');
    });

    test('access updates LRU order with maxSize=500', () => {
      const limitedCache = new TreeItemCache<string>(500);

      // Fill cache
      for (let i = 0; i < 500; i++) {
        limitedCache.set(`key${i}`, `value${i}`);
      }

      // Access key100 to make it recently used
      limitedCache.get('key100');

      // Add new item to trigger eviction
      limitedCache.set('key500', 'value500');

      // key0 should be evicted (LRU, never accessed after creation)
      assert.strictEqual(limitedCache.get('key0'), undefined);

      // key100 should still exist (was accessed recently)
      assert.strictEqual(limitedCache.get('key100'), 'value100');
    });

    test('never exceeds maxSize under stress', () => {
      const limitedCache = new TreeItemCache<string>(500);

      // Add 1000 items (2x maxSize)
      for (let i = 0; i < 1000; i++) {
        limitedCache.set(`stress-key${i}`, `value${i}`);
      }

      // Cache size should never exceed maxSize
      assert.strictEqual(limitedCache.size, 500);

      // Verify some recent items exist
      assert.strictEqual(limitedCache.get('stress-key999'), 'value999');
      assert.strictEqual(limitedCache.get('stress-key950'), 'value950');

      // Old items should be evicted
      assert.strictEqual(limitedCache.get('stress-key0'), undefined);
      assert.strictEqual(limitedCache.get('stress-key400'), undefined);
    });
  });
});
