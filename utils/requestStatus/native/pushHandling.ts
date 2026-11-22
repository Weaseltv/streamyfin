/**
 * Received and tapped request notifications (plan 5.10 steps 3-4). Every `kind: "request"`
 * notification is handled here and never by the generic `url`/plugin routing; an invalid one does
 * nothing more. Nothing here starts a session check, a reconnect, a request change or a title open
 * of its own, and request data is never logged.
 */
import {
  acknowledgeRequestEvents,
  wakeRequestSync,
} from "@/hooks/useRequestStatus";
import { userAtom } from "@/providers/JellyfinProvider";
import { requestQueueAtom } from "@/utils/atoms/requestStatus";
import { store } from "@/utils/store";
import {
  parseRequestPush,
  pushIsForViewer,
  type RequestPush,
} from "../pushPayload";
import { itemEventKey } from "../stage";

/** A cold-start tap may come before the media session is restored: held this long at most. */
export const TAP_HOLD_MS = 60_000;
const CONFIRM_WAIT_MS = 30_000;

/** The request queue is verified for the person the notification is for, on the pinned server. */
function liveScopeFor(push: RequestPush): boolean {
  const q = store.get(requestQueueAtom);
  return (
    q.verified &&
    q.pinned &&
    q.phase === "ready" &&
    pushIsForViewer(push, store.get(userAtom)?.Id)
  );
}

/** Received while the app is open: no banner (see the handler); wake one sync if it is ours. */
export function onRequestNotificationReceived(data: unknown): void {
  const push = parseRequestPush(data);
  if (push && liveScopeFor(push)) wakeRequestSync();
}

const handledResponses = new Set<string>();

function waitFor(check: () => boolean, ms: number): Promise<boolean> {
  if (check()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const started = Date.now();
    const unsubs: (() => void)[] = [];
    const finish = (ok: boolean) => {
      for (const u of unsubs) u();
      resolve(ok);
    };
    const test = () => {
      if (check()) finish(true);
      else if (Date.now() - started >= ms) finish(false);
    };
    unsubs.push(store.sub(requestQueueAtom, test));
    unsubs.push(store.sub(userAtom, test));
    const timer = setTimeout(() => finish(check()), ms);
    unsubs.push(() => clearTimeout(timer));
  });
}

/**
 * A tapped request notification (both tap sources; handled once per response). Opens the Requests
 * tab on that request once the session is verified for its recipient (owner decision 15). The
 * update is acknowledged only when a fresh row's own event has exactly that key.
 */
export async function handleRequestNotificationTap(
  responseId: string,
  data: unknown,
  openRow: (requestId: number | null) => void,
): Promise<void> {
  if (handledResponses.has(responseId)) return;
  handledResponses.add(responseId);
  const push = parseRequestPush(data);
  if (!push) return;
  const tappedAt = Date.now();
  // Wait for this person's verified session (cold start, or a check in flight).
  const ready = await waitFor(() => liveScopeFor(push), TAP_HOLD_MS);
  // Another person, another server, or no verified session in time: the app just opens.
  if (!ready) return;
  openRow(push.requestId);
  // Confirm against the next canonical read before claiming the update.
  await waitFor(() => {
    const q = store.get(requestQueueAtom);
    return (q.lastSyncSettledAt ?? 0) > tappedAt;
  }, CONFIRM_WAIT_MS);
  if (!liveScopeFor(push)) return;
  const row = store
    .get(requestQueueAtom)
    .items.find(
      (i) =>
        i.request.id === push.requestId &&
        i.request.media?.tmdbId === push.tmdbId &&
        i.request.type === push.mediaType &&
        (i.request.is4k === true) === push.is4k,
    );
  if (row?.fresh && itemEventKey(row) === push.eventKey) {
    acknowledgeRequestEvents(
      [{ key: push.eventKey, requestId: push.requestId }],
      push.requestId,
    );
  }
}
