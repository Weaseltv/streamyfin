import { t } from "i18next";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { toast } from "sonner-native";
import useRouter from "@/hooks/useAppRouter";
import { jellyseerrUserAtom } from "@/hooks/useJellyseerr";
import { userAtom } from "@/providers/JellyfinProvider";
import { WAKE_REQUEST_SYNC } from "@/providers/RequestStatusCoordinator";
import {
  requestOpenIntentAtom,
  requestQueueAtom,
} from "@/utils/atoms/requestStatus";
import { useSettings } from "@/utils/atoms/settings";
import { eventBus } from "@/utils/eventBus";
import { storage } from "@/utils/mmkv";
import {
  journalsEqual,
  markDelivered,
  markOpened,
  type RequestEvent,
  type RequestJournal,
  setEnabled,
  writeJournal,
} from "@/utils/requestStatus/journal";
import {
  readUpdatesEnabled,
  writeUpdatesEnabled,
} from "@/utils/requestStatus/native/runtime";
import { accountKey } from "@/utils/requestStatus/session";
import type { Text } from "@/utils/requestStatus/types";
import { store } from "@/utils/store";

/** The member's request queue state (written by `RequestStatusCoordinator`). */
export const useRequestQueue = () => useAtomValue(requestQueueAtom);

/**
 * Phones (plan 5.3 rule 3): a request is sent only through this person's verified request session,
 * checked right before the POST. Returns why it is blocked ("Requests are reconnecting…" on the
 * pinned server, the sign-in-again line on another server), or null when it may be sent. Always
 * null on TV.
 */
export function requestSubmissionBlock(): Text | null {
  if (Platform.isTV) return null;
  const q = store.get(requestQueueAtom);
  const stored = store.get(jellyseerrUserAtom);
  if (
    q.verified &&
    q.phase === "ready" &&
    q.seerrUserId !== null &&
    q.seerrUserId === stored?.id
  ) {
    return null;
  }
  return {
    key:
      q.phase === "sign_in_again"
        ? "request_status.state.sign_in_again"
        : "request_status.submission.reconnecting",
  };
}

/** `requestSubmissionBlock` with the reason shown as a toast; false when blocked. */
export function canSubmitRequest(): boolean {
  const blocked = requestSubmissionBlock();
  if (!blocked) return true;
  toast.error(t(blocked.key, blocked.params));
  return false;
}

/** Change this scope's journal (in state and storage); the coordinator folds it into the next read. */
function changeJournal(change: (j: RequestJournal) => RequestJournal) {
  store.set(requestQueueAtom, (q) => {
    if (!q.verified || !q.scopeKey) return q;
    const journal = change(q.journal);
    if (journalsEqual(journal, q.journal)) return q;
    writeJournal(storage, q.scopeKey, journal);
    return { ...q, journal };
  });
}

/**
 * The card's updates were seen (plan 5.9). Dismiss and timeout acknowledge without clearing
 * unread; the primary action also clears unread for that request, or all for "View requests".
 */
export function acknowledgeRequestEvents(
  events: readonly RequestEvent[],
  unread: "keep" | "all" | number,
) {
  changeJournal((j) => {
    const seen = markDelivered(j, events);
    if (unread === "keep") return seen;
    return unread === "all" ? markOpened(seen) : markOpened(seen, unread);
  });
}

/** The Settings switch "Request notifications", per account (plan 5.9). */
export function useRequestUpdatesSetting(): [
  boolean,
  (enabled: boolean) => void,
] {
  const user = useAtomValue(userAtom);
  const { settings } = useSettings();
  const account = accountKey(user?.Id, settings?.jellyseerrServerUrl);
  const [enabled, setLocal] = useState(() => readUpdatesEnabled(account));
  useEffect(() => setLocal(readUpdatesEnabled(account)), [account]);
  const set = useCallback(
    (next: boolean) => {
      if (!account) return;
      writeUpdatesEnabled(account, next);
      setLocal(next);
      // Off turns pending updates into acknowledged ones; the badge still counts.
      changeJournal((j) => setEnabled(j, next));
    },
    [account],
  );
  return [enabled, set];
}

/** Read the request list now (queue opened, pull to refresh, after a submit or cancel). */
export const wakeRequestSync = () => eventBus.emit(WAKE_REQUEST_SYNC);

/**
 * "Open Requests on this row" (plan 5.6): held for the current scope until the Requests index
 * handles it, then switches to the Requests tab and returns its stack to the queue.
 */
export function useOpenRequestRow() {
  const router = useRouter();
  return useCallback(
    (requestId: number | null) => {
      const q = store.get(requestQueueAtom);
      if (!q.verified || !q.scopeKey) return;
      store.set(requestOpenIntentAtom, {
        scopeKey: q.scopeKey,
        requestId,
        raisedAt: Date.now(),
      });
      router.navigate("/(auth)/(tabs)/(requests)");
      wakeRequestSync();
    },
    [router],
  );
}
