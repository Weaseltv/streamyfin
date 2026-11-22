import { isAxiosError } from "axios";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import {
  clearJellyseerrStorageData,
  jellyseerrUserAtom,
  storeJellyseerrUser,
} from "@/hooks/useJellyseerr";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { requestAccessAtom } from "@/utils/atoms/requestStatus";
import { useSettings } from "@/utils/atoms/settings";
import { writeErrorLog, writeInfoLog } from "@/utils/log";
import {
  ExchangeSupersededError,
  seerrExchanges,
} from "@/utils/requestStatus/exchangeQueue";
import {
  getRecovery,
  noteExchangeSucceeded,
  updateRecovery,
} from "@/utils/requestStatus/native/runtime";
import { currentViewer, sameViewer } from "@/utils/requestStatus/native/signIn";
import {
  isPaused,
  markRateLimited,
  retryAfterMs,
} from "@/utils/requestStatus/recovery";
import { accountKey, isPinnedOrigin } from "@/utils/requestStatus/session";
import { store } from "@/utils/store";
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

/** Bumped by `requestSilentReconnect`: one more automatic connect. */
const reconnectRequestAtom = atom(0);

/**
 * Phones (plan 5.3 rule 6): the session check found the stored request session
 * dead or someone else's. Clears the stored user and runs the silent connect
 * once more, past the once-per-session limit; the refusal cooldown still applies.
 */
export const requestSilentReconnect = () => {
  clearJellyseerrStorageData();
  store.set(reconnectRequestAtom, (n) => n + 1);
};

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
  const reconnectRequest = useAtomValue(reconnectRequestAtom);
  const requestAccess = useAtomValue(requestAccessAtom);
  const { settings, updateSettings } = useSettings();
  // Read after the exchange answers: the server URL must not have changed.
  const serverUrlRef = useRef(settings?.jellyseerrServerUrl);
  serverUrlRef.current = settings?.jellyseerrServerUrl;

  // One automatic attempt per Jellyfin user per app session: enough to
  // self-heal on the next launch or account switch, without hammering a
  // server that is down. A Retry tap is the only thing that runs it again.
  const attemptedForUser = useRef<string | undefined>(undefined);
  const handledRetry = useRef(0);
  const handledReconnect = useRef(0);

  useEffect(() => {
    if (!api?.accessToken || !user?.Id) return;
    // Phones: kids never reach the request server, and nothing runs before
    // this session's policy is confirmed (plan 5.3 rule 8). Checked before the
    // one-attempt marker, so a policy confirmed later starts the connect
    // without a Retry. Always true on the TV builds.
    if (!requestAccess) return;
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
    const reconnect = reconnectRequest !== handledReconnect.current;
    handledReconnect.current = reconnectRequest;
    if (!manual && !reconnect && attemptedForUser.current === user.Id) return;
    attemptedForUser.current = user.Id;

    const userId = user.Id;
    const lastRefusal = weaselSeerrRefusedAt(userId);
    const now = Date.now();
    const account = accountKey(userId, WEASEL_SEERR_URL);
    // A 429 paused every automatic sign-in for this account (plan 5.3 rule 6).
    if (!Platform.isTV && account && isPaused(getRecovery(), account, now)) {
      setStatus("failed");
      return;
    }
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
        if (Platform.isTV) {
          const seerrUser = await provisionPinnedSeerr(api);
          clearWeaselSeerrRefusal(userId);
          updateSettings({ jellyseerrServerUrl: WEASEL_SEERR_URL });
          setJellyseerrUser(seerrUser);
          setStatus("connected");
          writeInfoLog("Connected to the pinned Seerr server silently");
          return;
        }
        // Phones (plan 5.3 rule 1): one sign-in at a time; nothing is stored
        // while it runs, and its answer is used only if it is still the
        // newest sign-in, for the same person, server and request server.
        const viewer = currentViewer();
        const outcome = await seerrExchanges.run(({ signal, isCurrent }) =>
          provisionPinnedSeerr(api, { signal, isCurrent }),
        );
        if (
          !outcome.current ||
          !sameViewer(viewer) ||
          !isPinnedOrigin(serverUrlRef.current)
        ) {
          return;
        }
        clearWeaselSeerrRefusal(userId);
        updateSettings({ jellyseerrServerUrl: WEASEL_SEERR_URL });
        storeJellyseerrUser(outcome.result);
        noteExchangeSucceeded(userId, WEASEL_SEERR_URL, outcome.result);
        setStatus("connected");
        writeInfoLog("Connected to the pinned Seerr server silently");
      } catch (e) {
        if (e instanceof ExchangeSupersededError) return;
        const status = isAxiosError(e) ? e.response?.status : undefined;
        if (status === 401 || status === 403) {
          markWeaselSeerrRefused(userId);
          setStatus("refused");
        } else {
          if (status === 429 && account && !Platform.isTV) {
            const header = isAxiosError(e)
              ? e.response?.headers?.["retry-after"]
              : undefined;
            updateRecovery((s) =>
              markRateLimited(
                s,
                account,
                Date.now(),
                retryAfterMs(
                  typeof header === "string" ? header : undefined,
                  Date.now(),
                ),
              ),
            );
          }
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
    reconnectRequest,
    requestAccess,
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
