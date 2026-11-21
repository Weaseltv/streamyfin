/**
 * Registering this phone with the website's push service (plan 5.10 steps 1-2). Pure: the inputs
 * decide whether a registration is wanted, the state remembers what was registered (and what may
 * have been), and each answer moves the state. The wiring sends the calls.
 *
 * `POST /api/v1/weaselplex/push-devices` with `{expoToken, deviceId, platform, appVersion}` and the
 * media-server token in `X-WeaselPlex-Media-Token`; `DELETE` with `{expoToken, deviceId}`.
 * Answers: 204 done; 429 waits for Retry-After; 404 (website switch off) and 503 are quiet and
 * retried next app session; 401 and 409 (device limit) are final for this sign-in.
 */

export const DAILY_REFRESH_MS = 24 * 60 * 60 * 1000;

export interface PushInputs {
  /** Signed in to the WeaselPlex media server (never decided from the request-server URL). */
  weaselPlexServer: boolean;
  /** This session's policy is confirmed and an adult's (owner decision 13). */
  adult: boolean;
  /** The pinned request server is the selected one (or the implicit choice still connecting). */
  pinned: boolean;
  permission: boolean;
  /** Settings → Request notifications. */
  switchOn: boolean;
  expoToken: string | null;
  deviceId: string | null;
  jellyfinUserId: string | null;
}

export interface Registration {
  expoToken: string;
  deviceId: string;
  /** Lower case, no dashes. */
  jellyfinUserId: string;
}

export interface PushState {
  /** Confirmed by a 204, with when. */
  confirmed: (Registration & { at: number }) | null;
  /** Writes whose answer was lost: the website may have applied them. */
  uncertain: Registration[];
  /** A 401 or 409 for this sign-in: no more registration until the next one. */
  finalFor: string | null;
  /** Not before this (429). */
  retryAt: number;
  /** A teardown of the same registration was uncertain: register again even if the day isn't over. */
  forceNext: boolean;
}

export const emptyPushState = (): PushState => ({
  confirmed: null,
  uncertain: [],
  finalFor: null,
  retryAt: 0,
  forceNext: false,
});

const normalize = (id: string | null) =>
  id && /^[a-f0-9-]{32,36}$/i.test(id)
    ? id.replaceAll("-", "").toLowerCase()
    : null;

const same = (a: Registration, b: Registration) =>
  a.expoToken === b.expoToken &&
  a.deviceId === b.deviceId &&
  a.jellyfinUserId === b.jellyfinUserId;

/** The registration this phone should have now, or null for none. */
export function wantedRegistration(i: PushInputs): Registration | null {
  const user = normalize(i.jellyfinUserId);
  if (
    !i.weaselPlexServer ||
    !i.adult ||
    !i.pinned ||
    !i.permission ||
    !i.switchOn
  )
    return null;
  if (!i.expoToken || !i.deviceId || !user) return null;
  return { expoToken: i.expoToken, deviceId: i.deviceId, jellyfinUserId: user };
}

export type PushAction =
  | { kind: "register"; target: Registration }
  | { kind: "unregister"; targets: Registration[] }
  | { kind: "none" };

/**
 * What to send now. `sessionKey` identifies this sign-in (a 401/409 stops it); `foreground`
 * marks a return to the app (the daily refresh, and the forced one after an uncertain teardown).
 */
export function nextAction(
  s: PushState,
  wanted: Registration | null,
  now: number,
  sessionKey: string | null,
  foreground: boolean,
): PushAction {
  if (now < s.retryAt) return { kind: "none" };
  if (!wanted) {
    const targets = [...(s.confirmed ? [s.confirmed] : []), ...s.uncertain];
    return targets.length > 0
      ? { kind: "unregister", targets: dedupe(targets) }
      : { kind: "none" };
  }
  if (sessionKey && s.finalFor === sessionKey) return { kind: "none" };
  const fresh =
    !!s.confirmed &&
    same(s.confirmed, wanted) &&
    now - s.confirmed.at < DAILY_REFRESH_MS;
  if (fresh && !(foreground && s.forceNext)) return { kind: "none" };
  return { kind: "register", target: wanted };
}

const dedupe = (rs: Registration[]) =>
  rs
    .filter((r, i) => rs.findIndex((x) => same(x, r)) === i)
    .map(({ expoToken, deviceId, jellyfinUserId }) => ({
      expoToken,
      deviceId,
      jellyfinUserId,
    }));

/** A POST answered (`status` null: no answer, the write may have been applied). */
export function afterRegister(
  s: PushState,
  target: Registration,
  status: number | null,
  now: number,
  sessionKey: string | null,
  retryAfterMs = 0,
): PushState {
  const others = s.uncertain.filter((u) => !same(u, target));
  if (status === 204) {
    // The website rebinds the token to this person and installation.
    return {
      ...s,
      confirmed: { ...target, at: now },
      uncertain: others,
      forceNext: false,
      retryAt: 0,
    };
  }
  if (status === null) return { ...s, uncertain: [...others, target] };
  if (status === 401 || status === 409) return { ...s, finalFor: sessionKey };
  if (status === 429)
    return { ...s, retryAt: now + Math.max(retryAfterMs, 60_000) };
  // 404 (switch off on the website), 503 and the rest: quiet, tried again next app session.
  return { ...s, retryAt: Number.POSITIVE_INFINITY };
}

/** A DELETE answered. */
export function afterUnregister(
  s: PushState,
  target: Registration,
  status: number | null,
  now: number,
  retryAfterMs = 0,
): PushState {
  const isConfirmed = !!s.confirmed && same(s.confirmed, target);
  if (status === 204 || status === 401) {
    // 204 even when nothing matched; a 401 means this token can't remove anything any more.
    return {
      ...s,
      confirmed: isConfirmed ? null : s.confirmed,
      uncertain: s.uncertain.filter((u) => !same(u, target)),
    };
  }
  if (status === 429)
    return { ...s, retryAt: now + Math.max(retryAfterMs, 60_000) };
  // No answer: keep it as uncertain and register again on the next return if it is wanted again.
  return {
    ...s,
    confirmed: isConfirmed ? null : s.confirmed,
    uncertain: [...s.uncertain.filter((u) => !same(u, target)), target],
    forceNext: true,
  };
}

/** A new app session: quiet failures may be retried. */
export const newAppSession = (s: PushState): PushState => ({
  ...s,
  retryAt: Number.isFinite(s.retryAt) ? s.retryAt : 0,
});

/** Read the stored state defensively. */
export function decodePushState(value: unknown): PushState {
  const empty = emptyPushState();
  if (!value || typeof value !== "object") return empty;
  const v = value as Record<string, unknown>;
  const reg = (x: unknown): Registration | null => {
    if (!x || typeof x !== "object") return null;
    const r = x as Record<string, unknown>;
    return typeof r.expoToken === "string" &&
      typeof r.deviceId === "string" &&
      typeof r.jellyfinUserId === "string"
      ? {
          expoToken: r.expoToken,
          deviceId: r.deviceId,
          jellyfinUserId: r.jellyfinUserId,
        }
      : null;
  };
  const confirmed = reg(v.confirmed);
  const at = (v.confirmed as { at?: unknown } | null)?.at;
  return {
    confirmed:
      confirmed && typeof at === "number" ? { ...confirmed, at } : null,
    uncertain: Array.isArray(v.uncertain)
      ? v.uncertain.map(reg).filter((r): r is Registration => !!r)
      : [],
    finalFor: null,
    retryAt: 0,
    forceNext: v.forceNext === true,
  };
}
