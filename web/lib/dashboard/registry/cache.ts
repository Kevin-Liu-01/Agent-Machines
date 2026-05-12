/**
 * In-memory TTL cache for registry adapter responses.
 *
 * Keyed by `source:query` so the same search doesn't re-hit npm or
 * GitHub on every page load. Default TTL is 5 minutes -- long enough
 * to survive a flurry of filter toggling, short enough that new
 * packages show up reasonably fast.
 */

type CacheEntry<T> = {
	data: T;
	expiresAt: number;
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;

const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | null {
	const entry = store.get(key);
	if (!entry) return null;
	if (Date.now() > entry.expiresAt) {
		store.delete(key);
		return null;
	}
	return entry.data as T;
}

export function cacheSet<T>(
	key: string,
	data: T,
	ttlMs: number = DEFAULT_TTL_MS,
): void {
	store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function cacheKey(source: string, query: string): string {
	return `${source}:${query.trim().toLowerCase()}`;
}

export function cacheClear(): void {
	store.clear();
}
