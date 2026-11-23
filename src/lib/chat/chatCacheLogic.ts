// Pure helpers for the chat message cache (no browser / Firebase dependencies, unit-testable).

/** Messages kept per chat in the local cache. */
export const CACHE_MESSAGES = 200;

export interface CacheMsg {
  id: string;
  timestamp: number;
  optimistic?: boolean;
}

export function sortByTime<T extends CacheMsg>(list: T[]): T[] {
  return list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}

/**
 * Reconciles a cached list with the first live window (the last `pageSize` messages from RTDB).
 * - live window shorter than a page: it is the whole chat, so it replaces the cache (also drops deleted ones).
 * - live window full: keep cached messages OLDER than the window only if the cache overlaps the window
 *   (so the result is contiguous, no hole); live data always wins for ids it contains.
 */
export function mergeWindow<T extends CacheMsg>(cached: T[], live: T[], pageSize: number): T[] {
  const liveSorted = sortByTime(live.slice());
  if (liveSorted.length < pageSize) return liveSorted;
  const oldest = liveSorted[0];
  const liveIds = new Set(liveSorted.map((m) => m.id));
  const cachedSorted = sortByTime(cached.filter((m) => !m.optimistic));
  const newestCached = cachedSorted[cachedSorted.length - 1];
  const overlaps =
    !!newestCached &&
    (liveIds.has(newestCached.id) ||
      cachedSorted.some((m) => liveIds.has(m.id)) ||
      (newestCached.timestamp || 0) >= (oldest.timestamp || 0));
  if (!overlaps) return liveSorted;
  const older = cachedSorted.filter(
    (m) => !liveIds.has(m.id) && (m.timestamp || 0) < (oldest.timestamp || 0)
  );
  return [...older, ...liveSorted];
}

/** What gets persisted: no optimistic bubbles, last CACHE_MESSAGES only. */
export function trimForStore<T extends CacheMsg>(list: T[]): { messages: T[]; trimmed: boolean } {
  const clean = list.filter((m) => !m.optimistic);
  const trimmed = clean.length > CACHE_MESSAGES;
  return { messages: trimmed ? clean.slice(-CACHE_MESSAGES) : clean, trimmed };
}

export interface IndexEntry {
  k: string;
  lastAccess: number;
  bytes: number;
}

/** LRU eviction: returns the keys to delete so that count <= maxChats and total bytes <= maxBytes. */
export function pickEvictions(entries: IndexEntry[], maxChats: number, maxBytes: number): string[] {
  const byAge = entries.slice().sort((a, b) => a.lastAccess - b.lastAccess);
  let count = byAge.length;
  let bytes = byAge.reduce((s, e) => s + e.bytes, 0);
  const out: string[] = [];
  for (const e of byAge) {
    if (count <= maxChats && bytes <= maxBytes) break;
    out.push(e.k);
    count -= 1;
    bytes -= e.bytes;
  }
  return out;
}
