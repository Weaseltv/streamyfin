/**
 * Confirming this session's parental-rating policy before any request access (plan 5.3 rule 8).
 * Pure: the runner feeds events and does what the result says.
 *
 * A user restored from storage may draw the media screens, but only a policy confirmed for this
 * media server, user and session decides request access. The provider asks for the current user
 * once at startup and only logs a failure, so a phone that starts offline would never confirm.
 * Therefore: one attempt at a time per session, each bounded by a 15-second timeout; after a
 * failure, asked again when the network returns, on the next return to the foreground and when
 * Retry is pressed, at most once a minute. A trigger inside that minute or during an attempt is
 * kept as one pending retry, run at the first allowed time.
 */

export const POLICY_TIMEOUT_MS = 15_000;
export const POLICY_RETRY_GAP_MS = 60_000;

export type PolicyStatus = "unconfirmed" | "checking" | "confirmed";

export interface PolicyRunner {
  /** The live media-server session (server, token, user); null when signed out. */
  sessionKey: string | null;
  status: PolicyStatus;
  lastAttemptAt?: number;
  /** A trigger arrived while an attempt ran or too soon after one. */
  pending: boolean;
}

export const idleRunner = (): PolicyRunner => ({
  sessionKey: null,
  status: "unconfirmed",
  pending: false,
});

export type PolicyTrigger = "session" | "network" | "foreground" | "retry";

export interface PolicyStep {
  runner: PolicyRunner;
  /** Start an attempt now. */
  attempt: boolean;
  /** Retry was pressed too soon: say it is still checking. */
  tooSoon: boolean;
  /** Run `tick` after this many ms to send the pending retry. */
  wakeInMs?: number;
}

const step = (
  runner: PolicyRunner,
  extra: Partial<PolicyStep> = {},
): PolicyStep => ({
  runner,
  attempt: false,
  tooSoon: false,
  ...extra,
});

/** The session changed (sign-in, sign-out, account switch). */
export function sessionChanged(
  r: PolicyRunner,
  sessionKey: string | null,
  now: number,
): PolicyStep {
  if (sessionKey === r.sessionKey) return step(r);
  if (!sessionKey) return step(idleRunner());
  return step(
    { sessionKey, status: "checking", lastAttemptAt: now, pending: false },
    { attempt: true },
  );
}

/** The policy is known for this session (a sign-in answer, the startup refresh, or an attempt). */
export function confirmed(r: PolicyRunner, sessionKey: string): PolicyStep {
  if (sessionKey !== r.sessionKey) return step(r);
  return step({ ...r, status: "confirmed", pending: false });
}

/** An attempt for this session failed or timed out. */
export function failed(
  r: PolicyRunner,
  sessionKey: string,
  now: number,
): PolicyStep {
  if (sessionKey !== r.sessionKey || r.status === "confirmed") return step(r);
  const next: PolicyRunner = { ...r, status: "unconfirmed" };
  return next.pending ? tick(next, now) : step(next);
}

/** The network came back, the app returned to the foreground, or Retry was pressed. */
export function trigger(
  r: PolicyRunner,
  reason: Exclude<PolicyTrigger, "session">,
  now: number,
): PolicyStep {
  if (!r.sessionKey || r.status === "confirmed") return step(r);
  if (r.status === "checking")
    return step({ ...r, pending: true }, { tooSoon: reason === "retry" });
  const wait = waitMs(r, now);
  if (wait <= 0)
    return step(
      { ...r, status: "checking", lastAttemptAt: now, pending: false },
      { attempt: true },
    );
  return step(
    { ...r, pending: true },
    { tooSoon: reason === "retry", wakeInMs: wait },
  );
}

/** Time passed: send a kept retry if it is allowed now. */
export function tick(r: PolicyRunner, now: number): PolicyStep {
  if (!r.pending || !r.sessionKey || r.status !== "unconfirmed") return step(r);
  const wait = waitMs(r, now);
  if (wait > 0) return step(r, { wakeInMs: wait });
  return step(
    { ...r, status: "checking", lastAttemptAt: now, pending: false },
    { attempt: true },
  );
}

const waitMs = (r: PolicyRunner, now: number) =>
  r.lastAttemptAt === undefined
    ? 0
    : r.lastAttemptAt + POLICY_RETRY_GAP_MS - now;

/** The key for one media-server session: server, token and user. */
export function policySessionKey(
  basePath: string | null | undefined,
  accessToken: string | null | undefined,
  userId: string | null | undefined,
): string | null {
  if (!basePath || !accessToken || !userId) return null;
  return `${basePath.replace(/\/+$/, "").toLowerCase()}|${accessToken}|${userId.replaceAll("-", "").toLowerCase()}`;
}
