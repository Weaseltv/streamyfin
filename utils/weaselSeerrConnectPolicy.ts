/**
 * WeaselPlex: when the silent Seerr connect may run again after Seerr has
 * refused this Jellyfin user (401/403 from the Quick Connect exchange).
 *
 * The request server's fail2ban jail counts 401/403 answers on /api/v1/auth/
 * and bans the whole IP (http and https, so the media server too) for an hour
 * after five in ten minutes. Every rule here exists to keep one device from
 * ever contributing more than one strike per ten-minute window on its own:
 *
 *  - an automatic attempt (cold start) waits AUTO_RETRY_COOLDOWN_MS after a
 *    refusal, which is longer than the jail's window;
 *  - a manual retry from the Requests screen waits MANUAL_RETRY_GAP_MS, so a
 *    customer hammering the button cannot ban their household either.
 *
 * Anything that is not a refusal (server down, timeout) is not remembered
 * and is retried on the next launch or tap.
 */

/** Automatic retry after a refusal: longer than the jail's 10-minute window. */
export const AUTO_RETRY_COOLDOWN_MS = 15 * 60 * 1000;

/** Manual retry after a refusal: at most three strikes in ten minutes. */
export const MANUAL_RETRY_GAP_MS = 3 * 60 * 1000;

export const shouldSkipAutoConnect = (
  refusedAt: number | undefined,
  now: number,
): boolean =>
  refusedAt !== undefined && now - refusedAt < AUTO_RETRY_COOLDOWN_MS;

export const canRetryManually = (
  refusedAt: number | undefined,
  now: number,
): boolean => refusedAt === undefined || now - refusedAt >= MANUAL_RETRY_GAP_MS;
