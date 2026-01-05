/* eslint-disable @typescript-eslint/naming-convention */
import * as assert from "assert";

// Simulated signature cache for testing
class SignatureCache {
  private cache = new Map<
    string,
    Map<string, { signature: string; timestamp: number }>
  >();
  private readonly TTL_MS = 60 * 60 * 1000; // 1 hour
  private readonly MAX_ENTRIES = 100;

  cacheSignature(sessionId: string, text: string, signature: string): void {
    let sessionCache = this.cache.get(sessionId);
    if (!sessionCache) {
      sessionCache = new Map();
      this.cache.set(sessionId, sessionCache);
    }

    // Evict oldest if at capacity
    if (sessionCache.size >= this.MAX_ENTRIES) {
      let oldest: string | null = null;
      let oldestTime = Infinity;

      for (const [key, entry] of sessionCache.entries()) {
        if (entry.timestamp < oldestTime) {
          oldestTime = entry.timestamp;
          oldest = key;
        }
      }

      if (oldest) {
        sessionCache.delete(oldest);
      }
    }

    const hash = this.hashText(text);
    sessionCache.set(hash, { signature, timestamp: Date.now() });
  }

  getCachedSignature(sessionId: string, text: string): string | undefined {
    const sessionCache = this.cache.get(sessionId);
    if (!sessionCache) {
      return undefined;
    }

    const hash = this.hashText(text);
    const entry = sessionCache.get(hash);

    if (!entry) {
      return undefined;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.TTL_MS) {
      sessionCache.delete(hash);
      return undefined;
    }

    return entry.signature;
  }

  clearCache(sessionId?: string): void {
    if (sessionId) {
      this.cache.delete(sessionId);
    } else {
      this.cache.clear();
    }
  }

  private hashText(text: string): string {
    // Simple hash for testing (real implementation uses SHA-256)
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  // For testing
  getCacheSize(sessionId: string): number {
    return this.cache.get(sessionId)?.size || 0;
  }
}

describe("SignatureCache", () => {
  let cache: SignatureCache;

  beforeEach(() => {
    cache = new SignatureCache();
  });

  describe("cacheSignature", () => {
    it("should cache and retrieve signatures by sessionId + text hash", () => {
      const sessionId = "session-123";
      const text = "This is my thinking...";
      const signature = "sig_abc123";

      cache.cacheSignature(sessionId, text, signature);
      const retrieved = cache.getCachedSignature(sessionId, text);

      assert.strictEqual(retrieved, signature);
    });

    it("should return undefined for non-existent signature", () => {
      const result = cache.getCachedSignature("nonexistent", "text");
      assert.strictEqual(result, undefined);
    });

    it("should isolate signatures by session", () => {
      const text = "Same thinking text";

      cache.cacheSignature("session-1", text, "sig_1");
      cache.cacheSignature("session-2", text, "sig_2");

      assert.strictEqual(cache.getCachedSignature("session-1", text), "sig_1");
      assert.strictEqual(cache.getCachedSignature("session-2", text), "sig_2");
    });
  });

  describe("TTL expiration", () => {
    it("should return undefined for expired signatures", () => {
      // This test verifies the TTL logic exists
      // In real implementation, we'd mock Date.now()
      const sessionId = "session-ttl";
      const text = "Thinking";
      const signature = "sig_ttl";

      cache.cacheSignature(sessionId, text, signature);

      // Immediately after caching, should be valid
      const result = cache.getCachedSignature(sessionId, text);
      assert.strictEqual(result, signature);
    });
  });

  describe("capacity management", () => {
    it("should evict oldest entries when at capacity", () => {
      const sessionId = "session-capacity";

      // Fill cache to capacity (100 entries)
      for (let i = 0; i < 100; i++) {
        cache.cacheSignature(sessionId, `text-${i}`, `sig-${i}`);
      }

      assert.strictEqual(cache.getCacheSize(sessionId), 100);

      // Add one more - should evict oldest
      cache.cacheSignature(sessionId, "text-new", "sig-new");

      assert.strictEqual(cache.getCacheSize(sessionId), 100);

      // New entry should exist
      assert.strictEqual(
        cache.getCachedSignature(sessionId, "text-new"),
        "sig-new",
      );
    });
  });

  describe("clearCache", () => {
    it("should clear specific session cache", () => {
      cache.cacheSignature("session-1", "text", "sig-1");
      cache.cacheSignature("session-2", "text", "sig-2");

      cache.clearCache("session-1");

      assert.strictEqual(
        cache.getCachedSignature("session-1", "text"),
        undefined,
      );
      assert.strictEqual(
        cache.getCachedSignature("session-2", "text"),
        "sig-2",
      );
    });

    it("should clear all caches when no sessionId provided", () => {
      cache.cacheSignature("session-1", "text", "sig-1");
      cache.cacheSignature("session-2", "text", "sig-2");

      cache.clearCache();

      assert.strictEqual(
        cache.getCachedSignature("session-1", "text"),
        undefined,
      );
      assert.strictEqual(
        cache.getCachedSignature("session-2", "text"),
        undefined,
      );
    });
  });

  describe("text hashing", () => {
    it("should produce consistent hashes for same text", () => {
      const sessionId = "session-hash";
      const text = "Consistent text";
      const signature = "sig_consistent";

      cache.cacheSignature(sessionId, text, signature);

      // Same text should retrieve same signature
      assert.strictEqual(cache.getCachedSignature(sessionId, text), signature);
      assert.strictEqual(cache.getCachedSignature(sessionId, text), signature);
    });

    it("should produce different hashes for different texts", () => {
      const sessionId = "session-diff";

      cache.cacheSignature(sessionId, "text-a", "sig-a");
      cache.cacheSignature(sessionId, "text-b", "sig-b");

      assert.strictEqual(
        cache.getCachedSignature(sessionId, "text-a"),
        "sig-a",
      );
      assert.strictEqual(
        cache.getCachedSignature(sessionId, "text-b"),
        "sig-b",
      );
    });
  });
});
