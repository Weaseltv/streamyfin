/**
 * Process-wide request-session state that outlives scopes and client rebuilds (plan 5.3 rules 3
 * and 6): the recovery throttles and the other-server sign-in binding.
 */
import { storage } from "@/utils/mmkv";
import { emptyRecovery, markExchange, type RecoveryState } from "../recovery";
import { accountKey, type SeerrBinding } from "../session";

let recovery: RecoveryState = emptyRecovery();

export const getRecovery = (): RecoveryState => recovery;

export function updateRecovery(
  change: (s: RecoveryState) => RecoveryState,
): RecoveryState {
  recovery = change(recovery);
  return recovery;
}

/** The identity a sign-in exchange read right after it signed in (Quick Connect's `/auth/me`). */
export interface ExchangeIdentity {
  account: string;
  seerrUserId: number;
  jellyfinUserId: string | null;
}

let lastExchange: ExchangeIdentity | null = null;

/**
 * A sign-in exchange succeeded for this viewer and server: a new scope may check again. When the
 * exchange already read who the session belongs to, the new scope reuses that answer once instead
 * of asking again (one auth call fewer against the home's failed sign-in limit).
 */
export function noteExchangeSucceeded(
  jellyfinUserId: string | null | undefined,
  url: string | null | undefined,
  me?: { id?: number | null; jellyfinUserId?: string | null } | null,
): void {
  const key = accountKey(jellyfinUserId, url);
  if (!key) return;
  updateRecovery((s) => markExchange(s, key, Date.now()));
  lastExchange =
    me?.id != null
      ? {
          account: key,
          seerrUserId: me.id,
          jellyfinUserId: me.jellyfinUserId ?? null,
        }
      : null;
}

/** Use the exchange's own identity read once, if it was for this account and Seerr user. */
export function takeExchangeIdentity(
  account: string,
  seerrUserId: number,
): ExchangeIdentity | null {
  const found = lastExchange;
  if (!found || found.account !== account || found.seerrUserId !== seerrUserId)
    return null;
  lastExchange = null;
  return found;
}

const BINDING_KEY = "WEASELPLEX_SEERR_BINDING";

/** The viewer and URL of the last password sign-in to another request server. */
export function readBinding(): SeerrBinding | null {
  try {
    const raw = storage.getString(BINDING_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SeerrBinding>;
    return typeof v.jellyfinUserId === "string" &&
      typeof v.origin === "string" &&
      Number.isSafeInteger(v.seerrUserId)
      ? (v as SeerrBinding)
      : null;
  } catch {
    return null;
  }
}

export function saveBinding(binding: SeerrBinding): void {
  storage.set(BINDING_KEY, JSON.stringify(binding));
}

const UPDATES_KEY = "request_updates_enabled|";

/**
 * The Settings switch "Request notifications" (plan 5.9), per account (media-server user plus
 * request-server origin), so it can be read before a request session exists. Default on.
 */
export function readUpdatesEnabled(account: string | null): boolean {
  if (!account) return true;
  return storage.getString(UPDATES_KEY + account) !== "off";
}

export function writeUpdatesEnabled(account: string, enabled: boolean): void {
  storage.set(UPDATES_KEY + account, enabled ? "on" : "off");
}
