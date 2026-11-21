import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getUserApi } from "@jellyfin/sdk/lib/utils/api";
import NetInfo from "@react-native-community/netinfo";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { clearJellyseerrStorageData } from "@/hooks/useJellyseerr";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  confirmRequestPolicy,
  pendingPolicyRefresh,
  requestPolicyAtom,
  requestPolicyRunnerAtom,
} from "@/utils/atoms/requestPolicy";
import { eventBus } from "@/utils/eventBus";
import { writeInfoLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import { seerrExchanges } from "@/utils/requestStatus/exchangeQueue";
import {
  confirmed,
  failed,
  POLICY_TIMEOUT_MS,
  type PolicyStep,
  policySessionKey,
  sessionChanged,
  tick,
  trigger,
} from "@/utils/requestStatus/policy";
import { isConfirmedKid } from "@/utils/requestStatus/visibility";
import { store } from "@/utils/store";

/** Ask the confirmation runner to try again (the Requests page's Retry while unconfirmed). */
export const RETRY_POLICY_EVENT = "requestPolicyRetry";
/** Answer to a Retry that came too soon: the page says it is still checking. */
export const POLICY_RETRY_TOO_SOON_EVENT = "requestPolicyRetryTooSoon";

const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("policy check timed out")),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });

/**
 * Phones (plan 5.3 rule 8): confirms this media-server session's parental-rating policy when no
 * sign-in or startup refresh has, and keeps trying when that failed (offline start). Mounted below
 * the network provider, in the phone tabs layout. Renders nothing.
 */
export function RequestPolicyRunner() {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const policy = useAtomValue(requestPolicyAtom);
  const setRunner = useSetAtom(requestPolicyRunnerAtom);
  const sessionKey = policySessionKey(
    api?.basePath,
    api?.accessToken,
    user?.Id,
  );
  const wakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const apply = (next: PolicyStep) => {
      setRunner(next.runner);
      if (wakeTimer.current) clearTimeout(wakeTimer.current);
      wakeTimer.current = null;
      if (next.wakeInMs !== undefined) {
        wakeTimer.current = setTimeout(
          () => apply(tick(store.get(requestPolicyRunnerAtom), Date.now())),
          next.wakeInMs,
        );
      }
      if (next.attempt && next.runner.sessionKey)
        attempt(next.runner.sessionKey);
    };

    const attempt = (key: string) => {
      const currentApi = store.get(apiAtom);
      if (!currentApi) return;
      const request: Promise<UserDto> =
        pendingPolicyRefresh(key) ??
        getUserApi(currentApi)
          .getCurrentUser()
          .then((r) => r.data);
      withTimeout(request, POLICY_TIMEOUT_MS).then(
        (fresh) => {
          const live = store.get(apiAtom);
          const liveKey = policySessionKey(
            live?.basePath,
            live?.accessToken,
            store.get(userAtom)?.Id,
          );
          // A late answer for a session that has ended changes nothing.
          if (
            liveKey !== key ||
            policySessionKey(live?.basePath, live?.accessToken, fresh.Id) !==
              key
          ) {
            return;
          }
          store.set(userAtom, fresh);
          storage.set("user", JSON.stringify(fresh));
          confirmRequestPolicy(live?.basePath, live?.accessToken, fresh);
        },
        () =>
          apply(failed(store.get(requestPolicyRunnerAtom), key, Date.now())),
      );
    };

    const start = sessionChanged(
      store.get(requestPolicyRunnerAtom),
      sessionKey,
      Date.now(),
    );
    // A sign-in already returned this session's policy: nothing to ask.
    if (sessionKey && store.get(requestPolicyAtom)?.sessionKey === sessionKey) {
      apply(confirmed(start.runner, sessionKey));
    } else {
      apply(start);
    }

    const offRetry = eventBus.on(RETRY_POLICY_EVENT, () => {
      const next = trigger(
        store.get(requestPolicyRunnerAtom),
        "retry",
        Date.now(),
      );
      if (next.tooSoon) eventBus.emit(POLICY_RETRY_TOO_SOON_EVENT);
      apply(next);
    });
    let wasConnected: boolean | null = null;
    const offNet = NetInfo.addEventListener((state) => {
      const connected = !!state.isConnected;
      if (wasConnected === false && connected) {
        apply(
          trigger(store.get(requestPolicyRunnerAtom), "network", Date.now()),
        );
      }
      wasConnected = connected;
    });
    const appState = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        apply(
          trigger(store.get(requestPolicyRunnerAtom), "foreground", Date.now()),
        );
      }
    });
    return () => {
      offRetry();
      offNet();
      appState.remove();
      if (wakeTimer.current) clearTimeout(wakeTimer.current);
    };
  }, [sessionKey, setRunner]);

  // A policy from a sign-in or the startup refresh confirms the runner too.
  useEffect(() => {
    if (policy && policy.sessionKey === sessionKey) {
      setRunner((r) => confirmed(r, policy.sessionKey).runner);
    }
  }, [policy, sessionKey, setRunner]);

  // A confirmed kid: clear the stored request-server user, as the TV clears its session, and
  // abandon a running sign-in. Unconfirmed clears nothing.
  useEffect(() => {
    if (!policy || policy.sessionKey !== sessionKey) return;
    if (isConfirmedKid(user?.Id, policy.user)) {
      seerrExchanges.cancel();
      clearJellyseerrStorageData();
      writeInfoLog("Requests are off for this profile (parental rating limit)");
    }
  }, [policy, sessionKey, user?.Id]);

  return null;
}
