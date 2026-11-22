/**
 * Phone notifications for requests: the website calls and the stored registration state (plan
 * 5.10 steps 1-2). The decisions are in `../pushRegistration.ts` and `../pushPayload.ts`.
 */
import { fetch } from "expo/fetch";
import { Platform } from "react-native";
import { writeErrorLog, writeInfoLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import { APP_VERSION } from "@/utils/version";
import {
  afterRegister,
  afterUnregister,
  decodePushState,
  emptyPushState,
  newAppSession,
  type PushState,
  type Registration,
} from "../pushRegistration";
import { retryAfterMs } from "../recovery";

/** The website's push service (production is NC1). */
export const PUSH_DEVICES_URL =
  "https://theweasel.tv/api/v1/weaselplex/push-devices";
const STATE_KEY = "weaselplex_push_registration";
const WRITE_TIMEOUT_MS = 15_000;
const SIGN_OUT_BUDGET_MS = 5_000;

let state: PushState = newAppSession(readState());
let chain: Promise<unknown> = Promise.resolve();

function readState(): PushState {
  try {
    const raw = storage.getString(STATE_KEY);
    return raw ? decodePushState(JSON.parse(raw)) : emptyPushState();
  } catch {
    return emptyPushState();
  }
}

function saveState(next: PushState) {
  state = next;
  const { confirmed, uncertain, forceNext } = next;
  storage.set(STATE_KEY, JSON.stringify({ confirmed, uncertain, forceNext }));
}

export const pushState = (): PushState => state;

/** One write at a time, in order (rotation, quick off/on, sign-out, sign-in again). */
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

async function write(
  method: "POST" | "DELETE",
  mediaToken: string,
  target: Registration,
  budgetMs = WRITE_TIMEOUT_MS,
): Promise<{ status: number | null; retryAfter: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  try {
    const body =
      method === "POST"
        ? {
            expoToken: target.expoToken,
            deviceId: target.deviceId,
            platform: Platform.OS === "ios" ? "ios" : "android",
            appVersion: APP_VERSION,
          }
        : { expoToken: target.expoToken, deviceId: target.deviceId };
    const res = await fetch(PUSH_DEVICES_URL, {
      method,
      signal: controller.signal,
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "X-WeaselPlex-Media-Token": mediaToken,
      },
      body: JSON.stringify(body),
    });
    return {
      status: res.status,
      retryAfter: retryAfterMs(res.headers.get("retry-after"), Date.now()),
    };
  } catch {
    // No answer: the website may still have applied it.
    return { status: null, retryAfter: 0 };
  } finally {
    clearTimeout(timer);
  }
}

/** Register this phone (the token and the media token are never logged). */
export function registerPush(
  target: Registration,
  mediaToken: string,
  sessionKey: string | null,
  isCurrent: () => boolean,
): Promise<void> {
  return serialized(async () => {
    if (!isCurrent()) return;
    const { status, retryAfter } = await write("POST", mediaToken, target);
    // A late answer from an older generation still records what the website may hold.
    saveState(
      afterRegister(state, target, status, Date.now(), sessionKey, retryAfter),
    );
    if (status === 204) writeInfoLog("Request notifications registered");
    else
      writeErrorLog(
        "Request notifications registration not completed",
        `${status ?? "no answer"}`,
      );
  });
}

/** Remove registrations (switch off, permission lost, another request server, a kid profile). */
export function unregisterPush(
  targets: Registration[],
  mediaToken: string,
  budgetMs = WRITE_TIMEOUT_MS,
): Promise<void> {
  return serialized(async () => {
    for (const target of targets) {
      const { status, retryAfter } = await write(
        "DELETE",
        mediaToken,
        target,
        budgetMs,
      );
      saveState(afterUnregister(state, target, status, Date.now(), retryAfter));
    }
  });
}

/**
 * Sign-out (plan 5.10 step 2): with the outgoing media token, remove what this phone registered
 * (confirmed and uncertain), bounded so a hung or offline cleanup cannot block signing out. Then
 * the stored state is cleared: a previous person's write is never retried with the next person's
 * token.
 */
export async function unregisterBeforeSignOut(
  mediaToken: string | null | undefined,
): Promise<void> {
  const targets = [
    ...(state.confirmed ? [state.confirmed] : []),
    ...state.uncertain,
  ].map(({ expoToken, deviceId, jellyfinUserId }) => ({
    expoToken,
    deviceId,
    jellyfinUserId,
  }));
  if (mediaToken && targets.length > 0 && !Platform.isTV) {
    await Promise.race([
      unregisterPush(targets, mediaToken, SIGN_OUT_BUDGET_MS),
      new Promise((resolve) => setTimeout(resolve, SIGN_OUT_BUDGET_MS)),
    ]);
  }
  resetPushState();
}

/** A forced session expiry clears local state and sends nothing (the website couldn't verify it). */
export function resetPushState(): void {
  saveState(emptyPushState());
}
