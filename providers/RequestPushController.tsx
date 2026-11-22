import * as Notifications from "expo-notifications";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { DEFAULT_SERVER_URL } from "@/constants/DefaultServer";
import {
  acknowledgeRequestEvents,
  useRequestUpdatesSetting,
} from "@/hooks/useRequestStatus";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  expoPushTokenAtom,
  notificationPermissionAtom,
} from "@/utils/atoms/requestPush";
import {
  requestAccessAtom,
  requestQueueAtom,
} from "@/utils/atoms/requestStatus";
import { useSettings } from "@/utils/atoms/settings";
import { getOrSetDeviceId } from "@/utils/device";
import { storage } from "@/utils/mmkv";
import {
  pushState,
  registerPush,
  unregisterPush,
} from "@/utils/requestStatus/native/push";
import { policySessionKey } from "@/utils/requestStatus/policy";
import {
  parseRequestPush,
  pushIsForViewer,
  type RequestPush,
} from "@/utils/requestStatus/pushPayload";
import {
  nextAction,
  wantedRegistration,
} from "@/utils/requestStatus/pushRegistration";
import { isPinnedOrigin } from "@/utils/requestStatus/session";
import { itemEventKey } from "@/utils/requestStatus/stage";
import { store } from "@/utils/store";

const TRAY_READ_TIMEOUT_MS = 3_000;
const sameUrl = (a: string | null | undefined, b: string) =>
  (a ?? "").trim().replace(/\/+$/, "").toLowerCase() ===
  b.trim().replace(/\/+$/, "").toLowerCase();

/**
 * Phones: keeps this phone's registration with the website's push service matching the inputs
 * (plan 5.10 steps 1, 2, 5, 6), and records notifications still listed on the phone as delivered
 * once the request list confirms them, so the in-app card doesn't announce them again. Renders
 * nothing.
 */
export function RequestPushController() {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const adult = useAtomValue(requestAccessAtom);
  const token = useAtomValue(expoPushTokenAtom);
  const permission = useAtomValue(notificationPermissionAtom);
  const queue = useAtomValue(requestQueueAtom);
  const { settings } = useSettings();
  const [switchOn] = useRequestUpdatesSetting();
  const [foregroundTick, setForegroundTick] = useState(0);
  const lastTick = useRef(0);

  // Permission is rechecked at start and on every return; a change registers or unregisters.
  useEffect(() => {
    const check = () =>
      Notifications.getPermissionsAsync()
        .then(({ status }) =>
          store.set(notificationPermissionAtom, status === "granted"),
        )
        .catch(() => undefined);
    void check();
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") return;
      void check();
      setForegroundTick((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  // The sign-in server, not a local address the app may switch to (not an account change).
  const signInServer = storage.getString("serverUrl") ?? api?.basePath ?? null;
  const weaselPlexServer =
    !!DEFAULT_SERVER_URL && sameUrl(signInServer, DEFAULT_SERVER_URL);
  const wanted = useMemo(
    () =>
      wantedRegistration({
        weaselPlexServer,
        adult,
        pinned: isPinnedOrigin(settings?.jellyseerrServerUrl),
        permission: permission === true,
        switchOn,
        expoToken: token,
        deviceId: getOrSetDeviceId(),
        jellyfinUserId: user?.Id ?? null,
      }),
    [
      weaselPlexServer,
      adult,
      settings?.jellyseerrServerUrl,
      permission,
      switchOn,
      token,
      user?.Id,
    ],
  );
  const wantedKey = wanted ? JSON.stringify(wanted) : "none";
  const sessionKey = policySessionKey(
    api?.basePath,
    api?.accessToken,
    user?.Id,
  );

  useEffect(() => {
    const mediaToken = api?.accessToken;
    if (!mediaToken || permission === null) return;
    const foreground = foregroundTick !== lastTick.current;
    lastTick.current = foregroundTick;
    const action = nextAction(
      pushState(),
      wanted,
      Date.now(),
      sessionKey,
      foreground,
    );
    if (action.kind === "register") {
      void registerPush(
        action.target,
        mediaToken,
        sessionKey,
        () => store.get(apiAtom)?.accessToken === mediaToken,
      );
    } else if (action.kind === "unregister") {
      void unregisterPush(action.targets, mediaToken);
    }
    // wantedKey stands for `wanted`.
  }, [wantedKey, sessionKey, foregroundTick, api?.accessToken, permission]);

  // Notifications still listed on the phone (step 5): candidates for the current person, in memory.
  const [candidates, setCandidates] = useState<RequestPush[]>([]);
  useEffect(() => {
    let cancelled = false;
    const userId = store.get(userAtom)?.Id;
    Promise.race([
      Notifications.getPresentedNotificationsAsync(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), TRAY_READ_TIMEOUT_MS),
      ),
    ])
      .then((listed) => {
        if (cancelled) return;
        const pushes = listed
          .map((n) => parseRequestPush(n.request.content.data))
          .filter((p): p is RequestPush => !!p && pushIsForViewer(p, userId));
        setCandidates(pushes);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [foregroundTick, user?.Id]);

  // A candidate is recorded as delivered only when a fresh own row's event has exactly its key.
  useEffect(() => {
    if (!queue.verified || !queue.pinned || candidates.length === 0) return;
    const matched: RequestPush[] = [];
    for (const push of candidates) {
      const row = queue.items.find(
        (i) =>
          i.request.id === push.requestId &&
          i.request.media?.tmdbId === push.tmdbId &&
          i.request.type === push.mediaType,
      );
      if (row?.fresh && itemEventKey(row) === push.eventKey) matched.push(push);
    }
    if (matched.length === 0) return;
    acknowledgeRequestEvents(
      matched.map((p) => ({ key: p.eventKey, requestId: p.requestId })),
      "keep",
    );
    setCandidates((c) => c.filter((p) => !matched.includes(p)));
  }, [queue.verified, queue.pinned, queue.items, candidates]);

  return null;
}
