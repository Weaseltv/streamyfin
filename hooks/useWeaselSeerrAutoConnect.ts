import { isAxiosError } from "axios";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { jellyseerrUserAtom } from "@/hooks/useJellyseerr";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { writeErrorLog, writeInfoLog } from "@/utils/log";
import { provisionPinnedSeerr, WEASEL_SEERR_URL } from "@/utils/weaselSeerr";
import {
  canRetryManually,
  shouldSkipAutoConnect,
} from "@/utils/weaselSeerrConnectPolicy";
import {
  clearWeaselSeerrRefusal,
  markWeaselSeerrRefused,
  weaselSeerrRefusedAt,
} from "@/utils/weaselSeerrRefusal";

/**
 * What the last silent connect did, for the Requests screen to explain why
 * requesting is unavailable and to offer a retry.
 *
 *  - `idle`       nothing attempted yet (or a different Seerr server is set)
 *  - `connecting` an exchange is in flight
 *  - `connected`  a Seerr session exists
 *  - `refused`    Seerr answered 401/403: the account is not allowed in yet
 *  - `failed`     anything else: server down, timeout, approval failed
 */
export type WeaselSeerrConnectStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "refused"
  | "failed";

export const weaselSeerrConnectStatusAtom =
  atom<WeaselSeerrConnectStatus>("idle");

/** Bumped by the Requests screen's Retry; the hook re-runs the connect. */
const retryRequestAtom = atom(0);

/**
 * WeaselPlex: customers sign in to the media server once with Quick Connect
 * and never see a password again — so the request service must come along for
 * free, the way it does on the Android TV app. This runs after sign-in and
 * silently connects the pinned Seerr server using the Jellyfin session the
 * device already holds.
 *
 * Failures are logged and retried on the next launch, never surfaced as an
 * alert: a customer must still be able to watch when the request service is
 * down. The Requests screen reads weaselSeerrConnectStatusAtom to explain
 * itself and offers a retry (useRetryWeaselSeerrConnect). A refusal (401/403)
 * is retried on a cold start only after a cooldown; see
 * utils/weaselSeerrConnectPolicy. A manually configured different Seerr
 * server is left alone.
 */
export const useWeaselSeerrAutoConnect = () => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const jellyseerrUser = useAtomValue(jellyseerrUserAtom);
  const setJellyseerrUser = useSetAtom(jellyseerrUserAtom);
  const setStatus = useSetAtom(weaselSeerrConnectStatusAtom);
  const retryRequest = useAtomValue(retryRequestAtom);
  const { settings, updateSettings } = useSettings();

  // One automatic attempt per Jellyfin user per app session: enough to
  // self-heal on the next launch or account switch, without hammering a
  // server that is down. A Retry tap is the only thing that runs it again.
  const attemptedForUser = useRef<string | undefined>(undefined);
  const handledRetry = useRef(0);

  useEffect(() => {
    if (!api?.accessToken || !user?.Id) return;
    if (jellyseerrUser) {
      setStatus("connected");
      return;
    }
    if (
      settings?.jellyseerrServerUrl &&
      settings.jellyseerrServerUrl !== WEASEL_SEERR_URL
    ) {
      return;
    }
    const manual = retryRequest !== handledRetry.current;
    handledRetry.current = retryRequest;
    if (!manual && attemptedForUser.current === user.Id) return;
    attemptedForUser.current = user.Id;

    const userId = user.Id;
    const lastRefusal = weaselSeerrRefusedAt(userId);
    const now = Date.now();
    if (
      manual
        ? !canRetryManually(lastRefusal, now)
        : shouldSkipAutoConnect(lastRefusal, now)
    ) {
      setStatus("refused");
      return;
    }

    setStatus("connecting");
    (async () => {
      try {
        const seerrUser = await provisionPinnedSeerr(api);
        clearWeaselSeerrRefusal(userId);
        updateSettings({ jellyseerrServerUrl: WEASEL_SEERR_URL });
        setJellyseerrUser(seerrUser);
        setStatus("connected");
        writeInfoLog("Connected to the pinned Seerr server silently");
      } catch (e) {
        const status = isAxiosError(e) ? e.response?.status : undefined;
        if (status === 401 || status === 403) {
          markWeaselSeerrRefused(userId);
          setStatus("refused");
        } else {
          setStatus("failed");
        }
        writeErrorLog("Silent Seerr connect failed", `${e}`);
      }
    })();
  }, [
    api,
    user?.Id,
    jellyseerrUser,
    settings?.jellyseerrServerUrl,
    retryRequest,
    updateSettings,
    setJellyseerrUser,
    setStatus,
  ]);
};

/**
 * Runs the silent connect again right now, ignoring the cold-start cooldown.
 * A refusal younger than the manual gap is not retried (the status stays
 * `refused`), so the button cannot be used to strike the jail.
 */
export const useRetryWeaselSeerrConnect = () => {
  const setRetryRequest = useSetAtom(retryRequestAtom);
  return useCallback(() => setRetryRequest((n) => n + 1), [setRetryRequest]);
};
