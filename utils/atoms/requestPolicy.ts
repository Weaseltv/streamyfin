/**
 * This media-server session's confirmed parental-rating policy (plan 5.3 rule 8). Kept in its own
 * module, with no provider imports, so `JellyfinProvider` can record a policy at each sign-in.
 */
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";
import { atom } from "jotai";
import {
  idleRunner,
  type PolicyRunner,
  policySessionKey,
} from "@/utils/requestStatus/policy";
import { store } from "@/utils/store";

export interface RequestPolicy {
  sessionKey: string;
  user: UserDto;
}

/** The policy confirmed for one session: a sign-in answer, the startup refresh or a later check. */
export const requestPolicyAtom = atom<RequestPolicy | null>(null);

/** The confirmation runner's state (checking, unconfirmed), for the Requests page. */
export const requestPolicyRunnerAtom = atom<PolicyRunner>(idleRunner());

/** Record a policy the server just returned for this session. */
export function confirmRequestPolicy(
  basePath: string | null | undefined,
  accessToken: string | null | undefined,
  user: UserDto | null | undefined,
): void {
  const sessionKey = policySessionKey(basePath, accessToken, user?.Id);
  if (!sessionKey || !user) return;
  store.set(requestPolicyAtom, { sessionKey, user });
}

/**
 * The startup refresh's `getCurrentUser()` for a session, so the confirmation runner waits for
 * it instead of sending a second one.
 */
let inflight: { sessionKey: string; promise: Promise<UserDto> } | null = null;

export function registerPolicyRefresh(
  sessionKey: string | null,
  promise: Promise<UserDto>,
): void {
  if (!sessionKey) return;
  inflight = { sessionKey, promise };
  promise.then(
    () => {
      if (inflight?.promise === promise) inflight = null;
    },
    () => {
      if (inflight?.promise === promise) inflight = null;
    },
  );
}

export function pendingPolicyRefresh(
  sessionKey: string,
): Promise<UserDto> | null {
  return inflight?.sessionKey === sessionKey ? inflight.promise : null;
}
