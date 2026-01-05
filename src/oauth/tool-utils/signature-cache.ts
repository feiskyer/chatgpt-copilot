import * as crypto from "crypto";

const SIGNATURE_CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES_PER_SESSION = 100;
const SIGNATURE_TEXT_HASH_HEX_LEN = 16;

interface SignatureEntry {
  signature: string;
  timestamp: number;
}

const signatureCache = new Map<string, Map<string, SignatureEntry>>();

function hashText(text: string): string {
  return crypto
    .createHash("sha256")
    .update(text)
    .digest("hex")
    .slice(0, SIGNATURE_TEXT_HASH_HEX_LEN);
}

function getSessionCache(sessionId: string): Map<string, SignatureEntry> {
  let sessionCache = signatureCache.get(sessionId);
  if (!sessionCache) {
    sessionCache = new Map();
    signatureCache.set(sessionId, sessionCache);
  }
  return sessionCache;
}

function evictOldestEntry(sessionCache: Map<string, SignatureEntry>): void {
  let oldestKey: string | null = null;
  let oldestTimestamp = Infinity;

  for (const [key, entry] of sessionCache) {
    if (entry.timestamp < oldestTimestamp) {
      oldestTimestamp = entry.timestamp;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    sessionCache.delete(oldestKey);
  }
}

export function cacheSignature(
  sessionId: string,
  text: string,
  signature: string,
): void {
  const sessionCache = getSessionCache(sessionId);
  const hash = hashText(text);

  if (sessionCache.size >= MAX_ENTRIES_PER_SESSION && !sessionCache.has(hash)) {
    evictOldestEntry(sessionCache);
  }

  sessionCache.set(hash, {
    signature,
    timestamp: Date.now(),
  });
}

export function getCachedSignature(
  sessionId: string,
  text: string,
): string | undefined {
  const sessionCache = signatureCache.get(sessionId);
  if (!sessionCache) {
    return undefined;
  }

  const hash = hashText(text);
  const entry = sessionCache.get(hash);

  if (!entry) {
    return undefined;
  }

  if (Date.now() - entry.timestamp > SIGNATURE_CACHE_TTL_MS) {
    sessionCache.delete(hash);
    return undefined;
  }

  entry.timestamp = Date.now();
  return entry.signature;
}

export function clearSignatureCache(sessionId?: string): void {
  if (sessionId) {
    signatureCache.delete(sessionId);
  } else {
    signatureCache.clear();
  }
}

export function buildSignatureSessionKey(
  sessionId: string,
  model: string,
  conversationKey?: string,
  projectKey?: string,
): string {
  const parts = [sessionId, model.toLowerCase()];
  if (projectKey) {
    parts.push(projectKey);
  }
  if (conversationKey) {
    parts.push(conversationKey);
  }
  return parts.join(":");
}

export function getSignatureCacheStats(): {
  sessions: number;
  totalEntries: number;
} {
  let totalEntries = 0;
  for (const sessionCache of signatureCache.values()) {
    totalEntries += sessionCache.size;
  }
  return {
    sessions: signatureCache.size,
    totalEntries,
  };
}

export function cleanupExpiredSignatures(): number {
  let cleaned = 0;
  const now = Date.now();

  for (const [sessionId, sessionCache] of signatureCache) {
    for (const [hash, entry] of sessionCache) {
      if (now - entry.timestamp > SIGNATURE_CACHE_TTL_MS) {
        sessionCache.delete(hash);
        cleaned++;
      }
    }
    if (sessionCache.size === 0) {
      signatureCache.delete(sessionId);
    }
  }

  return cleaned;
}
