import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { AppState, Keyboard, Platform } from "react-native";
import { useNetworkStatus } from "@/providers/NetworkStatusProvider";
import {
  type ProbeOutcome,
  requestScopeBridge,
} from "@/providers/RequestStatusCoordinator";
import {
  emptyProgressView,
  requestLiveGateAtom,
  requestProgressAtom,
  requestQueueAtom,
  type TransportProof,
} from "@/utils/atoms/requestStatus";
import { eventBus } from "@/utils/eventBus";
import { writeInfoLog } from "@/utils/log";
import { seerrExchanges } from "@/utils/requestStatus/exchangeQueue";
import {
  createProgressTransport,
  LIVE_LAYER_ENABLED,
  LIVE_STREAM_ENABLED,
  type NativeProgressTransport,
  systemClock,
} from "@/utils/requestStatus/native/progressTransport";
import {
  getRecovery,
  updateRecovery,
} from "@/utils/requestStatus/native/runtime";
import {
  AUTH_STOP_MS,
  newRunnerShared,
  ProgressRunner,
} from "@/utils/requestStatus/progressRunner";
import {
  canProve,
  markProofDenied,
  markRateLimited,
  retryAfterMs,
} from "@/utils/requestStatus/recovery";
import { liveGateOpen } from "@/utils/requestStatus/visibility";

/** Pull to refresh: lift the live layer's 15-minute stop (never the probe or proof throttles). */
export const LIVE_REFRESH_EVENT = "requestLiveRefresh";

const PROOF_RETRY_MS = 60_000;

/** The reopen floor and the per-account stop outlive scopes. */
const shared = newRunnerShared();

/**
 * Phones: live progress for the verified pinned-server scope (plan 5.3 rule 5, 5.4, 5.5). Runs only
 * while the queue is on screen, the keyboard is closed, no sheet is open, the app is active and
 * online, and the transport proof holds. Renders nothing.
 */
export function RequestLiveController() {
  const queue = useAtomValue(requestQueueAtom);
  const gate = useAtomValue(requestLiveGateAtom);
  const proof = useAtomValue(requestProgressAtom).proof;
  const setProgress = useSetAtom(requestProgressAtom);
  const { isConnected } = useNetworkStatus();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [appActive, setAppActive] = useState(
    AppState.currentState === "active",
  );
  const runnerRef = useRef<ProgressRunner | null>(null);
  const transportRef = useRef<NativeProgressTransport | null>(null);
  const proofRetry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const proofCall = useRef<AbortController | null>(null);
  const offByAuth = useRef(false);

  const scopeKey =
    LIVE_LAYER_ENABLED && queue.verified && queue.pinned
      ? queue.scopeKey
      : null;

  const setProof = (next: TransportProof, retryInMs?: number) => {
    if (proofRetry.current) clearTimeout(proofRetry.current);
    proofRetry.current = null;
    setProgress((p) => ({ ...p, proof: next }));
    if (retryInMs !== undefined) {
      proofRetry.current = setTimeout(() => {
        setProgress((p) =>
          p.proof === "off" ? { ...p, proof: "unknown" } : p,
        );
      }, retryInMs);
    }
  };

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardOpen(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardOpen(false),
    );
    const app = AppState.addEventListener("change", (s) =>
      setAppActive(s === "active"),
    );
    return () => {
      show.remove();
      hide.remove();
      app.remove();
    };
  }, []);

  // One runner per verified scope; a scope change drops the records.
  useEffect(() => {
    const bridge = requestScopeBridge();
    if (!scopeKey || !bridge || bridge.scopeKey !== scopeKey) {
      setProgress(emptyProgressView());
      return;
    }
    const transport = createProgressTransport(bridge.origin);
    transportRef.current = transport;
    offByAuth.current = false;
    setProgress({
      ...emptyProgressView(),
      scopeKey,
      seerrUserId: bridge.seerrUserId,
    });
    const runner = new ProgressRunner({
      transport,
      clock: systemClock,
      shared,
      account: bridge.account,
      streamEnabled: LIVE_STREAM_ENABLED,
      publish: (state, mode) =>
        setProgress((p) =>
          p.scopeKey === scopeKey
            ? {
                ...p,
                records: state.records,
                transportStale: state.transportStale,
                mode,
              }
            : p,
        ),
      effect: (e) => bridge.hint(e),
      authIssue: () => {
        // A 401 or auth_expired: the proof is thrown away and the shared probe runs (rule 6).
        offByAuth.current = true;
        setProof("off", AUTH_STOP_MS);
        void bridge.probe();
      },
      log: (m) => writeInfoLog(m),
    });
    runnerRef.current = runner;
    // A request sign-in is starting: stop and drop the proof (rule 1, rule 5).
    const offExchange = seerrExchanges.onStart(() => {
      runner.stop();
      setProof("unknown");
    });
    const offRefresh = eventBus.on(LIVE_REFRESH_EVENT, () => {
      runner.refresh();
      if (offByAuth.current) {
        offByAuth.current = false;
        setProof("unknown");
      }
    });
    return () => {
      proofCall.current?.abort();
      proofCall.current = null;
      runner.dispose();
      offExchange();
      offRefresh();
      runnerRef.current = null;
      transportRef.current = null;
      if (proofRetry.current) clearTimeout(proofRetry.current);
    };
    // setProof only writes atoms.
  }, [scopeKey, setProgress]);

  const gateOpen = liveGateOpen({
    requestsIndexFocused: gate.indexFocused,
    searchText: gate.searchText,
    keyboardOpen,
    sheetOpen: gate.sheetOpen,
    appActive,
    online: isConnected,
    offlineMode: false,
    covered: false,
    transportProof: true,
  });

  // The transport proof: once per scope, the first time live progress would run.
  useEffect(() => {
    const bridge = requestScopeBridge();
    const transport = transportRef.current;
    if (
      !gateOpen ||
      proof !== "unknown" ||
      !bridge ||
      bridge.scopeKey !== scopeKey ||
      !transport
    )
      return;
    if (proofCall.current) return;
    if (!canProve(getRecovery(), bridge.account, Date.now())) {
      setProof("off", PROOF_RETRY_MS);
      return;
    }
    // Kept in a ref: marking "checking" re-runs this effect, which must not cancel the call.
    // Only a scope change cancels it.
    const controller = new AbortController();
    proofCall.current = controller;
    setProof("checking");
    (async () => {
      try {
        const answer = await transport.authMe(controller.signal);
        if (controller.signal.aborted) return;
        if (answer.status === 200) {
          if (answer.seerrUserId === bridge.seerrUserId) setProof("held");
          else {
            writeInfoLog(
              "Progress transport belongs to another request account; live progress off",
            );
            setProof("off");
          }
          return;
        }
        if (answer.status === 401 || answer.status === 403) {
          updateRecovery((s) => markProofDenied(s, bridge.account, Date.now()));
          const outcome: ProbeOutcome = await bridge.probe();
          if (outcome === "passed") {
            writeInfoLog(
              "Progress transport and request client disagree on the session; live progress off",
            );
          }
          setProof("off");
          return;
        }
        if (answer.status === 429) {
          updateRecovery((s) =>
            markRateLimited(
              s,
              bridge.account,
              Date.now(),
              retryAfterMs(answer.retryAfter, Date.now()),
            ),
          );
        }
        setProof("off", PROOF_RETRY_MS);
      } catch {
        if (!controller.signal.aborted) setProof("off", PROOF_RETRY_MS);
      } finally {
        if (proofCall.current === controller) proofCall.current = null;
      }
    })();
  }, [gateOpen, proof, scopeKey]);

  // The live gate (plan 5.5): anything false stops the stream and keeps the rows as last known.
  useEffect(() => {
    const runner = runnerRef.current;
    if (!runner) return;
    if (gateOpen && proof === "held") runner.start();
    else runner.stop();
  }, [gateOpen, proof, scopeKey]);

  return null;
}
