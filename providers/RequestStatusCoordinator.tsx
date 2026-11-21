import NetInfo from "@react-native-community/netinfo";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { type JellyseerrApi, useJellyseerr } from "@/hooks/useJellyseerr";
import { requestSilentReconnect } from "@/hooks/useWeaselSeerrAutoConnect";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  currentProgressTransport,
  LIVE_FORGET_EVENT,
} from "@/providers/RequestLiveController";
import { requestPolicyRunnerAtom } from "@/utils/atoms/requestPolicy";
import {
  emptyQueueState,
  type RequestPhase,
  requestAccessAtom,
  requestProgressAtom,
  requestQueueAtom,
  requestQueueVisibleAtom,
} from "@/utils/atoms/requestStatus";
import { useSettings } from "@/utils/atoms/settings";
import { eventBus } from "@/utils/eventBus";
import { writeErrorLog, writeInfoLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import {
  CANCEL_FAILED,
  type CancelOutcome,
  cancelPath,
  progressCancelOutcome,
  seerrDeleteOutcome,
  verifyGoneOutcome,
} from "@/utils/requestStatus/cancel";
import { seerrExchanges } from "@/utils/requestStatus/exchangeQueue";
import {
  forgetRequest,
  journalsEqual,
  markOpened,
  readJournal,
  seedRequest,
  setEnabled,
  trackEvents,
  writeJournal,
} from "@/utils/requestStatus/journal";
import { liveHint } from "@/utils/requestStatus/liveHints";
import {
  getRecovery,
  readBinding,
  readUpdatesEnabled,
  takeExchangeIdentity,
  updateRecovery,
} from "@/utils/requestStatus/native/runtime";
import type { ProgressEffect } from "@/utils/requestStatus/progressReducer";
import {
  canProbe,
  canTriggerMismatch,
  canVerify,
  markCheck,
  markDenied,
  markMismatchTriggered,
  markRateLimited,
  retryAfterMs,
} from "@/utils/requestStatus/recovery";
import { nextFailures, syncDelayMs } from "@/utils/requestStatus/scheduler";
import {
  accountKey,
  decideIdentity,
  type IdentityDecision,
  isPinnedOrigin,
  journalKey,
  PINNED_REQUEST_ORIGIN,
} from "@/utils/requestStatus/session";
import { deriveRequestStage } from "@/utils/requestStatus/stage";
import {
  httpStatus,
  type RequestReadApi,
  refreshOneRequest,
  replaceItem,
  syncOwnRequests,
} from "@/utils/requestStatus/sync";
import type { OwnRequest, Text } from "@/utils/requestStatus/types";
import { store } from "@/utils/store";

/** Wake the request sync now (the queue opened, a submit or cancel finished, pull to refresh). */
export const WAKE_REQUEST_SYNC = "requestStatusWake";

/** What the live layer may ask of the verified scope. */
export interface ScopeBridge {
  scopeKey: string;
  seerrUserId: number;
  account: string;
  /** The request server's origin (the pinned one for live progress). */
  origin: string;
  pinned: boolean;
  /** Rule 6: the shared session probe, under its throttle. */
  probe(): Promise<ProbeOutcome>;
  /** A live record or removal for the canonical layer to verify. */
  hint(effect: ProgressEffect): void;
  /**
   * A request the member just made here (the TV's `seed`): exempt from the baseline so its first
   * ready shows, its row added at once, the list read. False when not this scope's own request.
   */
  seed(request: OwnRequest): boolean;
  /**
   * Cancel an own request (plan 5.7). Resolves with the line to show above the queue, or null
   * when the row was forgotten (or the scope changed meanwhile).
   */
  cancel(requestId: number): Promise<Text | null>;
}

export type ProbeOutcome = "passed" | "denied" | "skipped" | "failed";

let bridge: (ScopeBridge & { generation: number }) | null = null;

/** The verified scope's bridge, or null while no verified scope exists. */
export const requestScopeBridge = (): ScopeBridge | null => bridge;

const readApi = (client: JellyseerrApi): RequestReadApi => ({
  listOwn: (p) =>
    client.ownRequests(p) as unknown as ReturnType<RequestReadApi["listOwn"]>,
  detail: (id) => client.getRequest(id) as unknown as Promise<OwnRequest>,
});

const headerOf = (error: unknown, name: string): string | undefined => {
  const h = (error as { response?: { headers?: Record<string, unknown> } })
    ?.response?.headers?.[name];
  return typeof h === "string" ? h : undefined;
};

/**
 * Phones: owns the member's request queue (plan 5.1, 5.3, 5.5). One scope at a time, built from the
 * media-server user, the request server, its Seerr user, the request client and a generation.
 * Before anything personal is read, the scope checks whose session it is (rule 3); then it reads
 * the member's own requests at launch, on return to the foreground, when the queue opens, after a
 * submit or cancel, and every minute. Rendered in the phone tabs layout; renders nothing.
 */
export function RequestStatusCoordinator() {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const access = useAtomValue(requestAccessAtom);
  const policyRunner = useAtomValue(requestPolicyRunnerAtom);
  const { settings } = useSettings();
  const { jellyseerrApi: client, jellyseerrUser } = useJellyseerr();
  const queueVisible = useAtomValue(requestQueueVisibleAtom);
  const setQueue = useSetAtom(requestQueueAtom);
  const [epoch, setEpoch] = useState(0);
  const generation = useRef(0);

  const url = settings?.jellyseerrServerUrl ?? "";
  const pinned = isPinnedOrigin(url);
  const account = accountKey(user?.Id, url);
  const seerrUserId =
    typeof jellyseerrUser?.id === "number" ? jellyseerrUser.id : null;

  // A different person or request server: nothing of the previous one stays on screen.
  useEffect(() => {
    setQueue((q) =>
      q.accountKey === account
        ? q
        : { ...emptyQueueState(), accountKey: account },
    );
  }, [account, setQueue]);

  // A request sign-in is starting: stop request work first (plan 5.3 rule 1).
  useEffect(
    () =>
      seerrExchanges.onStart(() => {
        generation.current++;
        setEpoch((e) => e + 1);
      }),
    [],
  );

  // No scope can be built: say why, keeping the same person's verified rows (rule 7).
  useEffect(() => {
    let phase: RequestPhase | null = null;
    if (!user?.Id || !api?.accessToken) phase = "idle";
    else if (!access)
      phase = policyRunner.status === "confirmed" ? "idle" : "policy";
    else if (!client || seerrUserId === null)
      phase = pinned ? "connect" : "sign_in_again";
    if (phase === null) return;
    generation.current++;
    const next = phase;
    setQueue((q) => {
      if (next === "idle" || next === "policy") {
        // No access (or no confirmed policy): nothing personal stays visible.
        return { ...emptyQueueState(), accountKey: q.accountKey, phase: next };
      }
      if (q.verified && q.accountKey === account)
        return { ...q, phase: "reconnecting", loading: false };
      return { ...q, phase: next, loading: false };
    });
  }, [
    user?.Id,
    api?.accessToken,
    access,
    policyRunner.status,
    client,
    seerrUserId,
    pinned,
    account,
    setQueue,
  ]);

  // The queue on screen: unread is cleared (plan 5.9).
  useEffect(() => {
    if (!queueVisible) return;
    setQueue((q) => {
      if (!q.verified || !q.scopeKey || q.journal.unread.length === 0) return q;
      const journal = markOpened(q.journal);
      writeJournal(storage, q.scopeKey, journal);
      return { ...q, journal };
    });
  }, [queueVisible, setQueue]);

  // The scope: verify, then read the queue on a schedule.
  useEffect(() => {
    if (!access || !client || seerrUserId === null || !account || !user?.Id)
      return;
    const gen = ++generation.current;
    const viewerId = user.Id;
    const scopeKey = journalKey(url, seerrUserId);
    const isCurrent = () =>
      generation.current === gen &&
      store.get(userAtom)?.Id === viewerId &&
      store.get(requestAccessAtom);

    let wakeResolve: (() => void) | null = null;
    const wake = () => {
      wakeResolve?.();
      wakeResolve = null;
    };
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        wakeResolve = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    let appActive = AppState.currentState === "active";
    let online = true;
    const offWake = eventBus.on(WAKE_REQUEST_SYNC, wake);
    const appSub = AppState.addEventListener("change", (s) => {
      const active = s === "active";
      if (active && !appActive) wake();
      appActive = active;
    });
    const offNet = NetInfo.addEventListener((s) => {
      const now = !!s.isConnected;
      if (now && !online) wake();
      online = now;
    });

    const setPhase = (phase: RequestPhase) =>
      setQueue((q) => (isCurrent() ? { ...q, phase } : q));

    /**
     * Rule 3: whose session is this? "retry" when it could not be checked now (throttled, 429,
     * unreachable); "stop" when the session was refused (a reconnect or a new sign-in starts a
     * new scope), so nothing re-checks a refused session on its own.
     */
    let refused = false;
    const verify = async (): Promise<IdentityDecision | "retry" | "stop"> => {
      const now = Date.now();
      const reused = takeExchangeIdentity(account, seerrUserId);
      const me = reused
        ? { id: reused.seerrUserId, jellyfinUserId: reused.jellyfinUserId }
        : await (async () => {
            if (!canVerify(getRecovery(), account, now)) {
              setPhase("reconnecting");
              return undefined;
            }
            updateRecovery((s) => markCheck(s, account, now));
            try {
              return await client.authMe();
            } catch (error) {
              if (!isCurrent()) return undefined;
              const status = httpStatus(error);
              if (status === 401 || status === 403) {
                // The denied check is the recovery probe: no separate probe follows it.
                refused = true;
                updateRecovery((s) => markDenied(s, account, Date.now()));
                if (pinned) {
                  setPhase("reconnecting");
                  requestSilentReconnect();
                } else {
                  setPhase("sign_in_again");
                }
              } else if (status === 429) {
                updateRecovery((s) =>
                  markRateLimited(
                    s,
                    account,
                    Date.now(),
                    retryAfterMs(headerOf(error, "retry-after"), Date.now()),
                  ),
                );
                setPhase("reconnecting");
              } else {
                setPhase("reconnecting");
              }
              return undefined;
            }
          })();
      if (!isCurrent()) return "stop";
      if (!me) return refused ? "stop" : "retry";
      return decideIdentity({
        url,
        jellyfinUserId: viewerId,
        storedSeerrUserId: seerrUserId,
        me: { id: me.id, jellyfinUserId: me.jellyfinUserId },
        binding: readBinding(),
      });
    };

    /** Rule 6: one probe per 15 minutes per account after a 401/403 on a request read. */
    const probe = async (): Promise<ProbeOutcome> => {
      const now = Date.now();
      if (!canProbe(getRecovery(), account, now)) return "skipped";
      updateRecovery((s) => markCheck(s, account, now));
      try {
        const me = await client.authMe();
        if (!isCurrent()) return "skipped";
        if (me?.id === seerrUserId) return "passed";
        // Another identity: this scope ends.
        generation.current++;
        setQueue((q) => ({
          ...q,
          phase: pinned ? "reconnecting" : "sign_in_again",
          loading: false,
        }));
        if (pinned) requestSilentReconnect();
        return "denied";
      } catch (error) {
        if (!isCurrent()) return "skipped";
        const status = httpStatus(error);
        if (status === 401 || status === 403) {
          updateRecovery((s) => markDenied(s, account, Date.now()));
          generation.current++;
          setQueue((q) => ({
            ...q,
            phase: pinned ? "reconnecting" : "sign_in_again",
            loading: false,
          }));
          if (pinned) requestSilentReconnect();
          return "denied";
        }
        if (status === 429) {
          updateRecovery((s) =>
            markRateLimited(
              s,
              account,
              Date.now(),
              retryAfterMs(headerOf(error, "retry-after"), Date.now()),
            ),
          );
        }
        return "failed";
      }
    };

    // Live hints (the TV's onLiveRecord): coalesce, then re-read only the affected requests.
    const hinted = new Set<number>();
    let hintTimer: ReturnType<typeof setTimeout> | null = null;
    let lastHintRun = 0;
    const runHints = async () => {
      hintTimer = null;
      lastHintRun = Date.now();
      const ids = [...hinted];
      hinted.clear();
      for (const id of ids) {
        if (!isCurrent()) return;
        const q = store.get(requestQueueAtom);
        if (q.scopeKey !== scopeKey || !q.verified) return;
        const prior = q.items.find((i) => i.request.id === id);
        const result = await refreshOneRequest(readApi(client), {
          id,
          prior,
          journalInitialized: q.journal.initialized,
          seerrUserId,
          downloadObserved: q.journal.downloadObserved.includes(id),
          isCurrent,
        });
        if (!isCurrent()) return;
        if (result.kind === "full_sync") wake();
        else if (result.kind === "auth") await probe();
        else if (result.kind === "refreshed") {
          setQueue((latest) => {
            if (!isCurrent() || latest.scopeKey !== scopeKey) return latest;
            const items = replaceItem(latest.items, result.item);
            const journal = trackEvents(
              latest.journal,
              items,
              scopeKey,
              new Set(),
              store.get(requestQueueVisibleAtom),
            );
            if (!journalsEqual(journal, latest.journal))
              writeJournal(storage, scopeKey, journal);
            return { ...latest, items, journal, lastUpdated: Date.now() };
          });
        }
      }
    };
    const hint = (effect: ProgressEffect) => {
      if (!isCurrent()) return;
      if (effect.kind === "deleted") {
        hinted.add(effect.requestId);
      } else if (effect.kind === "record") {
        const row = store
          .get(requestQueueAtom)
          .items.find((i) => i.request.id === effect.record.requestId);
        const h = liveHint(effect.record, row);
        if (h.kind === "unknown_request") {
          wake();
          return;
        }
        if (h.kind === "none") return;
        hinted.add(effect.record.requestId);
      } else {
        return;
      }
      if (!hintTimer) {
        hintTimer = setTimeout(
          () => void runHints().catch(() => undefined),
          Math.max(100, lastHintRun + 2_000 - Date.now()),
        );
      }
    };

    const run = async () => {
      await seerrExchanges.idle();
      if (!isCurrent()) return;
      setQueue((q) => ({
        ...q,
        accountKey: account,
        phase:
          q.verified && q.accountKey === account ? "reconnecting" : "verifying",
      }));

      let decision: IdentityDecision | null = null;
      while (isCurrent()) {
        const answer = await verify();
        if (answer === "stop") return;
        if (answer !== "retry") {
          decision = answer;
          break;
        }
        await sleep(syncDelayMs(1));
      }
      if (!decision || !isCurrent()) return;
      if (decision.kind === "mismatch") {
        if (pinned) {
          if (canTriggerMismatch(getRecovery(), viewerId)) {
            updateRecovery((s) => markMismatchTriggered(s, viewerId));
            setPhase("reconnecting");
            requestSilentReconnect();
          } else {
            writeInfoLog(
              "Request session still belongs to another account after reconnecting",
            );
            setQueue((q) =>
              isCurrent()
                ? {
                    ...emptyQueueState(),
                    accountKey: account,
                    phase: "unavailable",
                  }
                : q,
            );
          }
        } else {
          setQueue((q) =>
            isCurrent()
              ? {
                  ...emptyQueueState(),
                  accountKey: account,
                  phase: "sign_in_again",
                }
              : q,
          );
        }
        return;
      }

      // Verified: this person's rows from here on.
      const seed = (request: OwnRequest): boolean => {
        if (!isCurrent()) return false;
        const q = store.get(requestQueueAtom);
        if (
          q.scopeKey !== scopeKey ||
          !q.verified ||
          request.requestedBy?.id !== seerrUserId
        ) {
          return false;
        }
        const stage = deriveRequestStage(request);
        const seeded = seedRequest(
          q.journal,
          request.id,
          stage.downloadObserved,
        );
        writeJournal(storage, scopeKey, seeded);
        journal = seeded;
        setQueue((latest) =>
          latest.scopeKey === scopeKey
            ? {
                ...latest,
                journal: seeded,
                items: [
                  { request, stage, fresh: true },
                  ...latest.items.filter((i) => i.request.id !== request.id),
                ],
              }
            : latest,
        );
        wake();
        return true;
      };
      let cancelRefresh: ReturnType<typeof setTimeout> | null = null;
      const forget = (id: number) => {
        setQueue((latest) => {
          if (latest.scopeKey !== scopeKey) return latest;
          const forgotten = forgetRequest(latest.journal, id);
          writeJournal(storage, scopeKey, forgotten);
          journal = forgotten;
          return {
            ...latest,
            journal: forgotten,
            items: latest.items.filter((i) => i.request.id !== id),
          };
        });
        eventBus.emit(LIVE_FORGET_EVENT, id);
      };
      const cancel = async (id: number): Promise<Text | null> => {
        const row = store
          .get(requestQueueAtom)
          .items.find((i) => i.request.id === id);
        if (!isCurrent() || !row) return null;
        const live = store.get(requestProgressAtom);
        const transport = currentProgressTransport();
        const progressAvailable =
          decision?.kind === "pinned" &&
          live.scopeKey === scopeKey &&
          live.proof === "held" &&
          !!transport;
        const path = cancelPath(row, progressAvailable);
        if (!path) return CANCEL_FAILED;
        let outcome: CancelOutcome;
        if (path === "progress" && transport) {
          const answer = await transport.cancel(id);
          if (!isCurrent()) return null;
          outcome = progressCancelOutcome(answer.status, answer.body, id);
          if (outcome.kind === "verify") {
            const status = await client.requestReadStatus(id);
            if (!isCurrent()) return null;
            outcome = verifyGoneOutcome(status);
          }
        } else {
          // Never after a failed progress cancel: only when that path wasn't available.
          const status = await client.deleteRequestStatus(id);
          if (!isCurrent()) return null;
          outcome = seerrDeleteOutcome(status);
        }
        if (store.get(requestQueueAtom).scopeKey !== scopeKey) return null;
        if (outcome.kind === "forget") {
          forget(id);
          wake();
          return null;
        }
        if (outcome.kind !== "keep") return CANCEL_FAILED;
        if (outcome.log) writeInfoLog(outcome.log);
        if (outcome.probe) void probe();
        if (outcome.wake) wake();
        if (outcome.refreshInMs !== undefined && !cancelRefresh) {
          cancelRefresh = setTimeout(() => {
            cancelRefresh = null;
            if (isCurrent()) wake();
          }, outcome.refreshInMs);
        }
        return outcome.message;
      };
      bridge = {
        generation: gen,
        scopeKey,
        seerrUserId,
        account,
        origin: url || PINNED_REQUEST_ORIGIN,
        pinned: decision.kind === "pinned",
        probe,
        hint,
        seed,
        cancel,
      };
      let journal = readJournal(storage, scopeKey);
      // The Settings switch is stored per account (plan 5.9); the journal follows it.
      const updatesEnabled = readUpdatesEnabled(account);
      if (journal.enabled !== updatesEnabled) {
        journal = setEnabled(journal, updatesEnabled);
        writeJournal(storage, scopeKey, journal);
      }
      let missing = new Map<number, number>();
      let failures = 0;
      setQueue((q) => {
        if (!isCurrent()) return q;
        const sameScope = q.scopeKey === scopeKey && q.verified;
        return {
          ...(sameScope ? q : emptyQueueState()),
          accountKey: account,
          scopeKey,
          seerrUserId,
          verified: true,
          pinned: decision?.kind === "pinned",
          journal,
          phase: "ready",
        };
      });

      while (isCurrent()) {
        if (!appActive || !online) {
          await sleep(60_000);
          continue;
        }
        setQueue((q) => (isCurrent() ? { ...q, loading: true } : q));
        const previous = store.get(requestQueueAtom);
        try {
          const result = await syncOwnRequests(readApi(client), {
            seerrUserId,
            previous: previous.items,
            trackedIds: [
              ...journal.baselined,
              ...journal.pending.map((e) => e.requestId),
            ],
            downloadObserved: new Set(journal.downloadObserved),
            missing,
            isCurrent,
          });
          if (result.kind === "superseded" || !isCurrent()) return;
          missing = result.missing;
          // Fold in journal changes made meanwhile (the queue was seen) before folding the read.
          const latest = store.get(requestQueueAtom);
          if (latest.scopeKey === scopeKey && latest.verified)
            journal = latest.journal;
          const next = trackEvents(
            journal,
            result.items,
            scopeKey,
            result.confirmedGone,
            store.get(requestQueueVisibleAtom),
          );
          if (!journalsEqual(next, journal))
            writeJournal(storage, scopeKey, next);
          journal = next;
          const now = Date.now();
          setQueue((q) =>
            isCurrent()
              ? {
                  ...q,
                  items: result.items,
                  journal,
                  loading: false,
                  lastUpdated: now,
                  lastSyncSettledAt: now,
                  syncComplete: result.syncComplete,
                  error: result.error,
                  phase: "ready",
                }
              : q,
          );
          failures = nextFailures(failures, true);
        } catch (error) {
          if (!isCurrent()) return;
          failures = nextFailures(failures, false);
          const status = httpStatus(error);
          writeErrorLog("Request status sync paused", `${status ?? "network"}`);
          setQueue((q) =>
            isCurrent()
              ? {
                  ...q,
                  loading: false,
                  error: "unavailable",
                  syncComplete: false,
                  lastSyncSettledAt: Date.now(),
                }
              : q,
          );
          if (status === 401 || status === 403) await probe();
        }
        await sleep(syncDelayMs(failures));
      }
    };

    run().catch((e) =>
      writeErrorLog("Request status coordinator stopped", `${e}`),
    );
    return () => {
      generation.current++;
      if (bridge?.generation === gen) bridge = null;
      if (hintTimer) clearTimeout(hintTimer);
      offWake();
      appSub.remove();
      offNet();
      wake();
    };
  }, [
    access,
    client,
    seerrUserId,
    account,
    user?.Id,
    url,
    pinned,
    epoch,
    setQueue,
  ]);

  return null;
}
