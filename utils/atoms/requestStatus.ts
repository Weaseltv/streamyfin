/**
 * Request status state for the phone's Requests tab (plan 5.1, 5.6). One coordinator
 * (`providers/RequestStatusCoordinator.tsx`) writes it; screens read it.
 */
import { atom } from "jotai";
import { Platform } from "react-native";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { requestPolicyAtom } from "@/utils/atoms/requestPolicy";
import type { OpenRowIntent } from "@/utils/requestStatus/intent";
import {
  badgeCount,
  emptyJournal,
  type RequestJournal,
} from "@/utils/requestStatus/journal";
import { policySessionKey } from "@/utils/requestStatus/policy";
import type { ProgressMode } from "@/utils/requestStatus/progressRunner";
import type { SyncError } from "@/utils/requestStatus/sync";
import type {
  RequestProgressRecord,
  RequestStatusItem,
} from "@/utils/requestStatus/types";
import {
  isConfirmedAdult,
  requestsTabVisible,
} from "@/utils/requestStatus/visibility";

/**
 * Request access on phones: this session's policy is confirmed and belongs to an adult. The TV
 * builds of this repo are unchanged (always allowed here; the TV app has its own guard).
 */
export const requestAccessAtom = atom((get) => {
  if (Platform.isTV) return true;
  const api = get(apiAtom);
  const user = get(userAtom);
  const key = policySessionKey(api?.basePath, api?.accessToken, user?.Id);
  const policy = get(requestPolicyAtom);
  return (
    !!key &&
    policy?.sessionKey === key &&
    isConfirmedAdult(user?.Id, policy.user)
  );
});

/** This session's confirmed policy user, or null while unconfirmed. */
export const confirmedPolicyUserAtom = atom((get) => {
  const api = get(apiAtom);
  const user = get(userAtom);
  const key = policySessionKey(api?.basePath, api?.accessToken, user?.Id);
  const policy = get(requestPolicyAtom);
  return key && policy?.sessionKey === key ? policy.user : null;
});

/** The phone's Requests tab (the bar, the screen options and the route guard all read this). */
export const requestsTabVisibleAtom = atom((get) => {
  const user = get(userAtom);
  return requestsTabVisible({
    isTV: Platform.isTV,
    userId: user?.Id,
    confirmedUser: get(confirmedPolicyUserAtom),
    // The user atom starts from storage and is replaced by the refreshed user.
    storedUser: user,
  });
});

export type RequestPhase =
  /** No request session can be built yet (signed out, no access, nothing configured). */
  | "idle"
  /** This session's policy is not confirmed yet (rule 8). */
  | "policy"
  /** Waiting for a request-server session (silent connect, Retry). */
  | "connect"
  /** Checking whose session this is (rule 3). */
  | "verifying"
  | "ready"
  /** Same person, session being recovered: last-known rows, actions off (rule 7). */
  | "reconnecting"
  /** Another server whose session is missing or isn't this viewer's (rule 3). */
  | "sign_in_again"
  /** A mismatch that a reconnect did not fix. */
  | "unavailable";

export interface RequestQueueState {
  /** Media-server user plus request-server origin; rows survive a reconnect for the same account. */
  accountKey: string | null;
  /** The journal's key (request server plus Seerr user). */
  scopeKey: string | null;
  seerrUserId: number | null;
  /** Rows are the verified person's (never shown otherwise). */
  verified: boolean;
  /** The verified scope is on the pinned server (live progress may run, from pull request 3). */
  pinned: boolean;
  items: RequestStatusItem[];
  journal: RequestJournal;
  phase: RequestPhase;
  loading: boolean;
  lastUpdated: number | null;
  lastSyncSettledAt: number | null;
  error: SyncError | "unavailable" | null;
  syncComplete: boolean;
}

export const emptyQueueState = (): RequestQueueState => ({
  accountKey: null,
  scopeKey: null,
  seerrUserId: null,
  verified: false,
  pinned: false,
  items: [],
  journal: emptyJournal(),
  phase: "idle",
  loading: false,
  lastUpdated: null,
  lastSyncSettledAt: null,
  error: null,
  syncComplete: false,
});

export const requestQueueAtom = atom<RequestQueueState>(emptyQueueState());

/** The queue is on screen (Requests index focused, search box empty). */
export const requestQueueVisibleAtom = atom(false);

/** "Open Requests on this row", held until the Requests index handles it. */
export const requestOpenIntentAtom = atom<OpenRowIntent | null>(null);

/** What the Requests page reports for the live gate (plan 5.5); the rest comes from the app. */
export interface LiveGateReport {
  /** The Requests tab is focused on its index screen (from focus callbacks). */
  indexFocused: boolean;
  /** The request search box, as typed. */
  searchText: string;
  /** A sheet or dialog is open over the queue (the cancel sheet). */
  sheetOpen: boolean;
}

export const requestLiveGateAtom = atom<LiveGateReport>({
  indexFocused: false,
  searchText: "",
  sheetOpen: false,
});

export type TransportProof = "unknown" | "checking" | "held" | "off";

/** The live overlay for the current scope (records decorate rows; never history or badges). */
export interface RequestProgressView {
  scopeKey: string | null;
  seerrUserId: number | null;
  records: ReadonlyMap<number, RequestProgressRecord>;
  /** Rows show "Last known status" (paused, reconnecting, revalidating). */
  transportStale: boolean;
  mode: ProgressMode;
  proof: TransportProof;
}

export const emptyProgressView = (): RequestProgressView => ({
  scopeKey: null,
  seerrUserId: null,
  records: new Map(),
  transportStale: true,
  mode: "off",
  proof: "unknown",
});

export const requestProgressAtom = atom<RequestProgressView>(
  emptyProgressView(),
);

/** "Request sent": shown for 6 s after an own request, then the queue opens on its row. */
export interface RequestSubmissionCard {
  scopeKey: string;
  requestId: number;
  title: string;
  posterUrl: string | null;
  year: string | null;
  mediaType: string;
  is4k: boolean;
  createdAt: number;
}

export const requestSubmissionAtom = atom<RequestSubmissionCard | null>(null);

/** Unread ready or partly ready requests, for the tab badge. */
export const requestBadgeCountAtom = atom((get) => {
  const q = get(requestQueueAtom);
  return q.verified ? badgeCount(q.items, q.journal) : 0;
});
