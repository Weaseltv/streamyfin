/**
 * Pure gates: when live progress may run (plan 5.5), when the phone shows the Requests tab
 * (plan 5.6) and who counts as an adult for request access (plan 5.3 rule 8, a port of the TV's
 * `services/SeerrKidGuard.kt`).
 */

export interface LiveGateInput {
  /** The Requests tab is focused on its index screen (reported from focus callbacks). */
  requestsIndexFocused: boolean;
  /** The request search box, as typed (trimmed here). */
  searchText: string;
  keyboardOpen: boolean;
  /** A sheet or dialog is open (the cancel sheet, an action sheet). */
  sheetOpen: boolean;
  /** The app is in the foreground. */
  appActive: boolean;
  online: boolean;
  /** The app's offline mode is on. */
  offlineMode: boolean;
  /** A route covers the tabs (the player, a modal route). */
  covered: boolean;
  /** The transport proof (plan 5.3 rule 5) is held for the current scope. */
  transportProof: boolean;
}

/** Live updates run only while every condition holds; anything false stops them. */
export function liveGateOpen(input: LiveGateInput): boolean {
  return (
    input.requestsIndexFocused &&
    input.searchText.trim() === "" &&
    !input.keyboardOpen &&
    !input.sheetOpen &&
    input.appActive &&
    input.online &&
    !input.offlineMode &&
    !input.covered &&
    input.transportProof
  );
}

/** The Jellyfin user fields the kid check reads (`UserDto`). */
export interface PolicyUser {
  Id?: string | null;
  Policy?: { MaxParentalRating?: number | null } | null;
}

/** Jellyfin ids compared as lower case without dashes. */
export function normalizeJellyfinId(
  id: string | null | undefined,
): string | null {
  if (typeof id !== "string") return null;
  const n = id.replaceAll("-", "").toLowerCase();
  return /^[a-f0-9]{32}$/.test(n) ? n : null;
}

/**
 * Kids must never reach the request server, so this fails closed: an adult only when the policy
 * belongs to this same user and has no parental rating ceiling. Unknown counts as a kid.
 */
export function isConfirmedAdult(
  userId: string | null | undefined,
  user: PolicyUser | null | undefined,
): boolean {
  const id = normalizeJellyfinId(userId);
  if (!id || !user || normalizeJellyfinId(user.Id) !== id) return false;
  const policy = user.Policy;
  if (!policy) return false;
  return policy.MaxParentalRating == null;
}

/** A confirmed kid: that same user's policy has a parental rating ceiling. */
export function isConfirmedKid(
  userId: string | null | undefined,
  user: PolicyUser | null | undefined,
): boolean {
  const id = normalizeJellyfinId(userId);
  if (!id || !user || normalizeJellyfinId(user.Id) !== id) return false;
  return user.Policy?.MaxParentalRating != null;
}

export interface RequestsTabInput {
  isTV: boolean;
  /** The signed-in Jellyfin user id; null while signed out. */
  userId: string | null | undefined;
  /** This session's policy, once confirmed for this server, user and session. */
  confirmedUser: PolicyUser | null | undefined;
  /** The policy stored for this same server and user (the hint used until confirmation). */
  storedUser: PolicyUser | null | undefined;
}

/**
 * The phone's Requests tab. Phones only; for a signed-in person who is not a kid profile, while
 * the pinned request server applies (whatever the connect status) or another request server is
 * configured. Never depends on the request client existing. The kid test uses this session's
 * confirmed policy once there is one, and the stored policy until then; none counts as a kid.
 */
export function requestsTabVisible(input: RequestsTabInput): boolean {
  if (input.isTV) return false;
  if (!normalizeJellyfinId(input.userId)) return false;
  // This build pins a request server, so one of the two server cases always holds: an empty URL
  // or the pinned one means the pinned server applies; any other URL is another configured
  // server (which needs a place for its sign-in-again line).
  return isConfirmedAdult(
    input.userId,
    input.confirmedUser ?? input.storedUser,
  );
}
