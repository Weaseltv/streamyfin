/**
 * WeaselPlex: whether a Seerr 403 should tear down the stored session.
 *
 * Seerr keeps a cookie session. A 403 from an AUTH endpoint (/auth/me,
 * /auth/jellyfin/...) means that session is dead, so the stored user and
 * cookies must be cleared and the silent connect allowed to run again.
 *
 * A 403 from any OTHER endpoint is a per-request permission result — the user
 * asked for something this Seerr account may not do. Clearing the whole
 * session there used to log the customer out of Seerr and hide the Requests
 * tab after a single forbidden call, even though the session was still valid.
 * So only auth-endpoint 403s clear the session now.
 *
 * Kept dependency-free so it is unit-testable without React Native.
 */
export const seerr403ClearsSession = (url: string | undefined): boolean =>
  typeof url === "string" && url.includes("/auth/");
