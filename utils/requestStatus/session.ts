/**
 * Who a request session belongs to (plan 5.3 rules 2 and 3). Pure.
 *
 * The native cookie store holds one request-server session for the host, shared by every call in
 * the app, and it survives sign-out. These checks keep one member's session from ever serving
 * another member's screen.
 */
import { normalizeJellyfinId } from "./visibility";

/** The pinned request server (the TV's `DEFAULT_SEERR_URL`). */
export const PINNED_REQUEST_ORIGIN = "https://requests.theweasel.tv";

/** A request-server URL as an origin: no trailing slash, no `/api/v1`, lower-case scheme and host. */
export function normalizeOrigin(url: string | null | undefined): string {
  const trimmed = (url ?? "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/v1$/i, "");
  const match = /^(https?:\/\/[^/?#]+)(.*)$/i.exec(trimmed);
  return match ? `${match[1].toLowerCase()}${match[2]}` : trimmed;
}

/** The pinned server applies: no other request-server URL is set, or it is the pinned one. */
export function isPinnedOrigin(url: string | null | undefined): boolean {
  const origin = normalizeOrigin(url);
  return origin === "" || origin === PINNED_REQUEST_ORIGIN;
}

/** The journal's storage key, as the TV builds it: one journal per request server and Seerr user. */
export function journalKey(
  url: string | null | undefined,
  seerrUserId: number,
): string {
  const origin = normalizeOrigin(url);
  const server = isPinnedOrigin(origin) ? "weaselplex" : origin;
  return `request_notifications_${server}|${seerrUserId}`;
}

/**
 * The account the recovery throttles and the Settings switch belong to: the media-server user plus
 * the request-server origin, not the Seerr user id, so it survives the stored Seerr user being
 * cleared.
 */
export function accountKey(
  jellyfinUserId: string | null | undefined,
  url: string | null | undefined,
): string | null {
  const id = normalizeJellyfinId(jellyfinUserId);
  if (!id) return null;
  const origin = normalizeOrigin(url);
  return `${id}|${isPinnedOrigin(origin) ? PINNED_REQUEST_ORIGIN : origin}`;
}

/** Saved when this media-server user signs in to another request server by password. */
export interface SeerrBinding {
  jellyfinUserId: string;
  origin: string;
  seerrUserId: number;
}

export interface IdentityInput {
  url: string | null | undefined;
  /** The signed-in media-server user. */
  jellyfinUserId: string | null | undefined;
  /** The Seerr user stored at sign-in. */
  storedSeerrUserId: number;
  /** What `GET /api/v1/auth/me` answered. */
  me: { id?: number | null; jellyfinUserId?: string | null } | null | undefined;
  binding: SeerrBinding | null | undefined;
}

export type IdentityDecision =
  /** Pinned server, same person: request list and, with the transport proof, live progress. */
  | { kind: "pinned" }
  /** Another server, same person: request list only; cancel through Seerr for pending requests. */
  | { kind: "other" }
  /** The session belongs to someone else (or nobody we can confirm). */
  | { kind: "mismatch" };

/**
 * Rule 3. `/auth/me` must return the stored Seerr user. On the pinned server that user's Jellyfin id
 * must equal the signed-in one (an empty id never qualifies). On another server it must match, or be
 * empty (a local Seerr login) with a binding saved when this viewer signed in to this URL.
 */
export function decideIdentity(input: IdentityInput): IdentityDecision {
  const viewer = normalizeJellyfinId(input.jellyfinUserId);
  if (!viewer || !input.me || input.me.id !== input.storedSeerrUserId) {
    return { kind: "mismatch" };
  }
  const linked = input.me.jellyfinUserId
    ? normalizeJellyfinId(input.me.jellyfinUserId)
    : null;
  if (input.me.jellyfinUserId && !linked) return { kind: "mismatch" };
  if (isPinnedOrigin(input.url)) {
    return linked === viewer ? { kind: "pinned" } : { kind: "mismatch" };
  }
  if (linked)
    return linked === viewer ? { kind: "other" } : { kind: "mismatch" };
  const b = input.binding;
  const bound =
    !!b &&
    normalizeJellyfinId(b.jellyfinUserId) === viewer &&
    normalizeOrigin(b.origin) === normalizeOrigin(input.url) &&
    b.seerrUserId === input.storedSeerrUserId;
  return bound ? { kind: "other" } : { kind: "mismatch" };
}
