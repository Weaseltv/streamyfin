/**
 * When the request list is read (plan 5.5, the TV's `runForeground` :213-280). Pure.
 *
 * Every 60 s while the app is active, online and a scope exists; also at launch, on return to the
 * foreground, when the queue opens and after a submit or cancel. Failures back off 1, 2, 5 and 10
 * minutes.
 */

export const SYNC_INTERVAL_MS = 60_000;
const BACKOFF_MS = [60_000, 120_000, 300_000, 600_000] as const;

/** Consecutive failures, capped as on the TV. */
export const nextFailures = (failures: number, ok: boolean): number =>
  ok ? 0 : Math.min(failures + 1, BACKOFF_MS.length);

/** Wait before the next read. */
export const syncDelayMs = (failures: number): number =>
  failures <= 0
    ? SYNC_INTERVAL_MS
    : BACKOFF_MS[Math.min(failures, BACKOFF_MS.length) - 1];
