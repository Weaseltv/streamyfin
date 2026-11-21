import { t } from "i18next";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { Platform } from "react-native";
import { toast } from "sonner-native";
import useRouter from "@/hooks/useAppRouter";
import { jellyseerrUserAtom } from "@/hooks/useJellyseerr";
import { WAKE_REQUEST_SYNC } from "@/providers/RequestStatusCoordinator";
import {
  requestOpenIntentAtom,
  requestQueueAtom,
} from "@/utils/atoms/requestStatus";
import { eventBus } from "@/utils/eventBus";
import { store } from "@/utils/store";

/** The member's request queue state (written by `RequestStatusCoordinator`). */
export const useRequestQueue = () => useAtomValue(requestQueueAtom);

/**
 * Phones (plan 5.3 rule 3): a request is sent only through this person's verified request session,
 * checked right before the POST. When blocked, says why ("Requests are reconnecting…" on the
 * pinned server, the sign-in-again line on another server) and returns false. Always true on TV.
 */
export function canSubmitRequest(): boolean {
  if (Platform.isTV) return true;
  const q = store.get(requestQueueAtom);
  const stored = store.get(jellyseerrUserAtom);
  if (
    q.verified &&
    q.phase === "ready" &&
    q.seerrUserId !== null &&
    q.seerrUserId === stored?.id
  ) {
    return true;
  }
  toast.error(
    t(
      q.phase === "sign_in_again"
        ? "request_status.state.sign_in_again"
        : "request_status.submission.reconnecting",
    ),
  );
  return false;
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
