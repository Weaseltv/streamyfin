/**
 * Recovering a request session without costing sign-in strikes (plan 5.3 rules 3 and 6). Pure:
 * state in, decision and next state out; the clock is passed in.
 *
 * Every 401, 403 or 429 on the request server's `/api/v1/auth/*` counts toward NC1's fail2ban
 * ban (5 in 10 minutes bans the home for an hour), so automatic recovery is rationed per account
 * (media-server user plus request-server origin):
 * - the scope's identity check counts as the recovery probe; at most one probe per 15 minutes;
 * - a denied check starts that 15-minute throttle; while it runs, a new scope for the same account
 *   does not check again unless a sign-in exchange has succeeded since;
 * - a 429 pauses every automatic check and reconnect for 15 minutes or the server's longer
 *   Retry-After; a manual refresh never clears it;
 * - the reconnect after a pinned-server mismatch runs at most once per media-server user per app
 *   session.
 */

export const PROBE_INTERVAL_MS = 15 * 60 * 1000;
export const RATE_LIMIT_PAUSE_MS = 15 * 60 * 1000;

export interface AccountRecovery {
  /** Last identity check or probe (successful or not). */
  lastCheckAt?: number;
  /** Last 401/403 from a check or probe. */
  deniedAt?: number;
  /** Last successful sign-in exchange (Quick Connect, password, plugin). */
  exchangeAt?: number;
  /** Automatic auth calls paused until then (429). */
  pausedUntil?: number;
  /** Last 401/403 from the transport proof (5.3 rule 5). */
  proofDeniedAt?: number;
}

export interface RecoveryState {
  accounts: Readonly<Record<string, AccountRecovery>>;
  /** Media-server users whose mismatch reconnect already ran this app session. */
  mismatchTriggered: readonly string[];
}

export const emptyRecovery = (): RecoveryState => ({
  accounts: {},
  mismatchTriggered: [],
});

const account = (s: RecoveryState, key: string): AccountRecovery =>
  s.accounts[key] ?? {};
const withAccount = (
  s: RecoveryState,
  key: string,
  next: AccountRecovery,
): RecoveryState => ({
  ...s,
  accounts: { ...s.accounts, [key]: next },
});

export function isPaused(s: RecoveryState, key: string, now: number): boolean {
  const until = account(s, key).pausedUntil;
  return until !== undefined && now < until;
}

/** Whether a new scope may check its identity with the server now. */
export function canVerify(s: RecoveryState, key: string, now: number): boolean {
  const a = account(s, key);
  if (isPaused(s, key, now)) return false;
  if (a.deniedAt === undefined || now - a.deniedAt >= PROBE_INTERVAL_MS)
    return true;
  return a.exchangeAt !== undefined && a.exchangeAt > a.deniedAt;
}

/** Whether a recovery probe (after a 401/403 on a request read) may run now. */
export function canProbe(s: RecoveryState, key: string, now: number): boolean {
  if (isPaused(s, key, now)) return false;
  const last = account(s, key).lastCheckAt;
  return last === undefined || now - last >= PROBE_INTERVAL_MS;
}

/** An identity check or probe was sent (record before the call, so overlapping triggers merge). */
export function markCheck(
  s: RecoveryState,
  key: string,
  now: number,
): RecoveryState {
  return withAccount(s, key, { ...account(s, key), lastCheckAt: now });
}

/** The check or probe was answered 401/403. */
export function markDenied(
  s: RecoveryState,
  key: string,
  now: number,
): RecoveryState {
  return withAccount(s, key, {
    ...account(s, key),
    lastCheckAt: now,
    deniedAt: now,
  });
}

/** A sign-in exchange succeeded: a new scope may check its identity again. */
export function markExchange(
  s: RecoveryState,
  key: string,
  now: number,
): RecoveryState {
  return withAccount(s, key, { ...account(s, key), exchangeAt: now });
}

/** A 429 from an automated auth call: pause for 15 minutes or the longer Retry-After. */
export function markRateLimited(
  s: RecoveryState,
  key: string,
  now: number,
  retryAfterMs = 0,
): RecoveryState {
  const pause = Math.max(RATE_LIMIT_PAUSE_MS, retryAfterMs);
  const prior = account(s, key).pausedUntil ?? 0;
  return withAccount(s, key, {
    ...account(s, key),
    pausedUntil: Math.max(prior, now + pause),
  });
}

/**
 * The transport proof (5.3 rule 5) may run: not paused, and no proof was denied in the last 15
 * minutes for this account, across scope changes, client rebuilds and manual refreshes.
 */
export function canProve(s: RecoveryState, key: string, now: number): boolean {
  if (isPaused(s, key, now)) return false;
  const denied = account(s, key).proofDeniedAt;
  return denied === undefined || now - denied >= PROBE_INTERVAL_MS;
}

export function markProofDenied(
  s: RecoveryState,
  key: string,
  now: number,
): RecoveryState {
  return withAccount(s, key, { ...account(s, key), proofDeniedAt: now });
}

/** The pinned-server mismatch reconnect may run (once per media-server user per app session). */
export function canTriggerMismatch(
  s: RecoveryState,
  jellyfinUserId: string,
): boolean {
  return !s.mismatchTriggered.includes(jellyfinUserId);
}

export function markMismatchTriggered(
  s: RecoveryState,
  jellyfinUserId: string,
): RecoveryState {
  return canTriggerMismatch(s, jellyfinUserId)
    ? { ...s, mismatchTriggered: [...s.mismatchTriggered, jellyfinUserId] }
    : s;
}

/** `Retry-After` in seconds or an HTTP date, as milliseconds from now (0 when absent or invalid). */
export function retryAfterMs(
  value: string | null | undefined,
  now: number,
): number {
  if (!value) return 0;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Math.min(Number(trimmed), 86_400) * 1000;
  const at = Date.parse(trimmed);
  return Number.isFinite(at) ? Math.max(0, at - now) : 0;
}
