import type { Api } from "@jellyfin/sdk";
import { JellyseerrApi } from "@/hooks/useJellyseerr";
import { getIntegrationHeaders } from "@/utils/customHeaders";
import type { User as JellyseerrUser } from "@/utils/jellyseerr/server/entity/User";

/**
 * WeaselPlex: the pinned request server, mirroring the Android app's
 * DEFAULT_SEERR_URL. The bare origin, never with /api/v1 — JellyseerrApi
 * appends that itself, and a doubled segment was exactly the bug in the
 * Android rollout (Wholphin 3e6be2be).
 */
export const WEASEL_SEERR_URL = "https://requests.theweasel.tv";

/** Bounds the whole exchange, so a server that accepts the connection but
 * never answers fails quietly instead of leaving a pending promise forever. */
const QUICK_CONNECT_TIMEOUT_MS = 20_000;

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("The request service did not respond.")),
        ms,
      ),
    ),
  ]);

/**
 * WeaselPlex: connect this Jellyfin user to the pinned Seerr server with no
 * interaction at all, reusing the Jellyfin session they signed in with.
 * The whole silent exchange, ported from the Android app (Wholphin c04399f5):
 *
 *   1. ask Seerr to start Quick Connect  -> it returns a code and a secret
 *   2. approve that code against Jellyfin using the token this device
 *      ALREADY holds, so the approval is silent
 *   3. hand the secret back to Seerr     -> it issues a normal per-user session
 *
 * 🛑 SECURITY: the code passed to the authorize step is only ever the one
 * returned by step 1 of this same invocation. It is never read from user
 * input, a deep link, a notification or storage, and never leaves this
 * function — so the app cannot be induced to approve an attacker's Quick
 * Connect request.
 */
export interface ProvisionOptions {
  /** Aborts every call of the exchange (phones: the exchange queue's signal). */
  signal?: AbortSignal;
  /** While false, the exchange stores nothing (phones, plan 5.3 rule 1). */
  isCurrent?: () => boolean;
}

/**
 * With `options` (phones), the timeout also aborts the calls still running instead of only giving
 * up on them, and the signed-in user is returned without being stored: the caller saves it once
 * the exchange is still current. Without options (TV builds) it behaves as before.
 */
export const provisionPinnedSeerr = async (
  api: Api,
  options?: ProvisionOptions,
): Promise<JellyseerrUser> => {
  if (!options) return provision(api);
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener("abort", abort);
  const timer = setTimeout(abort, QUICK_CONNECT_TIMEOUT_MS);
  try {
    return await provision(api, {
      signal: controller.signal,
      isCurrent: () =>
        !controller.signal.aborted && (options.isCurrent?.() ?? true),
    });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
};

const provision = async (
  api: Api,
  options?: ProvisionOptions,
): Promise<JellyseerrUser> =>
  withTimeout(
    (async () => {
      const seerr = new JellyseerrApi(
        WEASEL_SEERR_URL,
        getIntegrationHeaders("jellyseerr"),
        options,
      );

      // Captures the cookies the XSRF interceptor and the configured-gate
      // need, exactly as the manual flow's test() does — minus its toasts.
      await seerr.primeSession();

      const { code, secret } = await seerr.quickConnectInitiate();

      const authorize = await api.axiosInstance.post(
        `${api.basePath}/QuickConnect/Authorize?code=${encodeURIComponent(code)}`,
        null,
        {
          headers: {
            Authorization: `MediaBrowser DeviceId="${api.deviceInfo.id}", Token="${api.accessToken}"`,
          },
          ...(options?.signal ? { signal: options.signal } : {}),
        },
      );
      if (authorize.status !== 200 || authorize.data !== true) {
        throw new Error("Could not approve the request service automatically.");
      }

      return await seerr.quickConnectAuthenticate(secret, {
        store: !options,
      });
    })(),
    QUICK_CONNECT_TIMEOUT_MS,
  );
