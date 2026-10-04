import { storage } from "@/utils/mmkv";

/**
 * WeaselPlex: when Seerr last refused (401/403) a Jellyfin user's silent
 * Quick Connect exchange, per user. Read by useWeaselSeerrAutoConnect through
 * the rules in weaselSeerrConnectPolicy; cleared by a success or a sign-out.
 * Kept out of the hook so JellyfinProvider can clear it without importing
 * the hook (which imports the provider's atoms).
 */
const refusalKey = (userId: string) => `weaselSeerrRefusedAt:${userId}`;

export const weaselSeerrRefusedAt = (userId: string): number | undefined =>
  storage.getNumber(refusalKey(userId));

export const markWeaselSeerrRefused = (userId: string) =>
  storage.set(refusalKey(userId), Date.now());

export const clearWeaselSeerrRefusal = (userId: string) =>
  storage.remove(refusalKey(userId));
