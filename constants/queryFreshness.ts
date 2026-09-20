/**
 * Named `staleTime` durations, in milliseconds.
 *
 * These exist because several queries were written as `staleTime: 60`, which
 * React Query reads as 60 *milliseconds* — effectively "always stale", so every
 * mount refetched. The values below state the intent explicitly; a bare numeric
 * literal in a query is almost always that same bug.
 */
export const Freshness = {
  /** Library list and season lists: cheap to refetch, but not every mount. */
  catalog: 60 * 1000,
  /** People/cast metadata: effectively static for the length of a session. */
  person: 5 * 60 * 1000,
} as const;
