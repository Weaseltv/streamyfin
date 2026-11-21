/**
 * The live-progress connection loop (plan 5.4, 5.5), with the rules the Unraid operator's answers
 * (2026-11-21) required. Pure: the transport, the clock and randomness are injected, so every timing
 * is tested with a fake clock.
 *
 * - One stream (`/progress/v1/stream`) while the live gate is open; no `/snapshot` reads while it is
 *   healthy. `/snapshot` every 2 s only when the stream can't be used (after a failure, while its
 *   retry backs off, or with streaming switched off on a platform).
 * - The stream closes after 40 s without bytes (the service pings every 15 s) and after 15 s without
 *   the snapshot it owes (the first one, or the one after `status ok`).
 * - Never a new stream within 2 s of the last one closing (the service's `retry: 2000`), shared
 *   across scopes through `RunnerShared`.
 * - A 401 on a read route or `auth_expired`: live updates stop for 15 minutes for that account and
 *   the shared session probe is signalled. A 403 on a read route can only be a proxy refusal:
 *   backoff, no probe, the transport proof is kept.
 * - Failures back off 2, 4, … 60 s plus jitter and honour Retry-After; an unsupported route waits
 *   60 s. A result that arrives after its attempt ended is discarded.
 */
import {
  applyEnvelope,
  emptyProgressState,
  KNOWN_EVENTS,
  newCursor,
  type ProgressCursor,
  type ProgressEffect,
  type ProgressState,
  pauseProgress,
} from "./progressReducer";
import { retryAfterMs } from "./recovery";
import { createSseParser, SseOverflowError } from "./sse";

export const STREAM_IDLE_MS = 40_000;
export const SNAPSHOT_DEADLINE_MS = 15_000;
export const SNAPSHOT_TIMEOUT_MS = 15_000;
export const FALLBACK_INTERVAL_MS = 2_000;
export const REOPEN_FLOOR_MS = 2_000;
export const AUTH_STOP_MS = 15 * 60 * 1000;
export const UNSUPPORTED_WAIT_MS = 60_000;

export type ProgressMode =
  | "off"
  | "connecting"
  | "live"
  | "polling"
  | "reconnecting"
  | "revalidating"
  | "unavailable"
  | "auth_required";

/** An HTTP answer that is not a usable stream or snapshot. */
export interface HttpFailure {
  kind: "http";
  status: number;
  retryAfter?: string | null;
  /** The JSON `error` field, when the body had one (the service's answers have it; NC1's don't). */
  error?: string | null;
}

export interface StreamHandle {
  /** The next decoded chunk, or null when the stream ended. Rejects when aborted or failed. */
  read(): Promise<string | null>;
}

export interface ProgressTransport {
  openStream(
    signal: AbortSignal,
  ): Promise<{ kind: "stream"; handle: StreamHandle } | HttpFailure>;
  getSnapshot(
    signal: AbortSignal,
  ): Promise<{ kind: "ok"; body: string } | HttpFailure>;
}

export interface RunnerClock {
  now(): number;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}

/** State that outlives one runner (one scope): the reopen floor and the per-account auth stop. */
export interface RunnerShared {
  lastStreamCloseAt: number | null;
  authStopUntil: Record<string, number>;
}

export const newRunnerShared = (): RunnerShared => ({
  lastStreamCloseAt: null,
  authStopUntil: {},
});

export interface RunnerDeps {
  transport: ProgressTransport;
  clock: RunnerClock;
  shared: RunnerShared;
  /** The account (media-server user plus request-server origin) the auth stop belongs to. */
  account: string;
  /** False on a platform where streaming does not work: `/snapshot` every 2 s only. */
  streamEnabled: boolean;
  random?: () => number;
  publish(state: ProgressState, mode: ProgressMode): void;
  effect(effect: ProgressEffect): void;
  /** A 401 or `auth_expired`: run the shared session probe (5.3 rule 6), under its throttle. */
  authIssue(): void;
  log?(message: string): void;
}

type StreamEnd =
  | { kind: "auth" }
  | { kind: "unsupported" }
  | { kind: "failed"; retryMs: number; reason: string }
  | { kind: "aborted" };

type SnapshotEnd =
  | { kind: "ok" }
  | { kind: "auth" }
  | { kind: "unsupported" }
  | { kind: "failed"; retryMs: number }
  | { kind: "aborted" };

class Aborted extends Error {}

/** Exponential backoff 2, 4, 8 … 60 s plus up to 400 ms of jitter (the TV's `backoff`). */
export function backoffMs(
  failures: number,
  random: () => number = Math.random,
): number {
  const base = Math.min(
    2_000 * 2 ** Math.max(0, Math.min(failures - 1, 5)),
    60_000,
  );
  return base + Math.floor(random() * 400);
}

export class ProgressRunner {
  private state: ProgressState = emptyProgressState();
  private mode: ProgressMode = "off";
  private controller: AbortController | null = null;
  private running = false;
  private disposed = false;
  private streamFailures = 0;
  private snapshotFailures = 0;
  private nextStreamAt = 0;
  /** After a stream failure the next read is a `/snapshot`, as on the TV. */
  private snapshotNext = false;
  private streamOpen = false;
  private wake: (() => void) | null = null;

  constructor(private readonly deps: RunnerDeps) {}

  /** The live gate opened. */
  start(): void {
    if (this.disposed || this.running) return;
    this.running = true;
    const controller = new AbortController();
    this.controller = controller;
    void this.loop(controller.signal).catch((e) => {
      if (!(e instanceof Aborted))
        this.deps.log?.(`live progress stopped: ${String(e)}`);
    });
  }

  /** The live gate closed: abort everything, keep the records as last known. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    // Recorded now, not when the aborted read settles, so a start right after this stop
    // already sees the 2 s floor.
    if (this.streamOpen) this.deps.shared.lastStreamCloseAt = this.now();
    this.controller?.abort();
    this.controller = null;
    this.state = pauseProgress(this.state);
    this.setMode("off");
  }

  /** Pull to refresh: lift this account's 15-minute stop and try again now (the floor still holds). */
  refresh(): void {
    delete this.deps.shared.authStopUntil[this.deps.account];
    this.nextStreamAt = 0;
    this.streamFailures = 0;
    this.snapshotFailures = 0;
    this.wake?.();
  }

  /** A cancelled request: its live record goes at once (the TV's `progress.forget`). */
  forget(requestId: number): void {
    if (!this.state.records.has(requestId)) return;
    const records = new Map(this.state.records);
    records.delete(requestId);
    this.state = { ...this.state, records };
    this.deps.publish(this.state, this.mode);
  }

  /** The scope ended: records are dropped. */
  dispose(): void {
    this.stop();
    this.disposed = true;
    this.state = emptyProgressState();
    this.deps.publish(this.state, "off");
  }

  get currentMode(): ProgressMode {
    return this.mode;
  }

  private setMode(mode: ProgressMode) {
    if (mode !== this.mode) this.deps.log?.(`live progress: ${mode}`);
    this.mode = mode;
    this.deps.publish(this.state, mode);
  }

  private now() {
    return this.deps.clock.now();
  }

  /** Sleep that a refresh can cut short; throws when aborted. */
  private async sleep(ms: number, signal: AbortSignal) {
    if (signal.aborted) throw new Aborted();
    if (ms <= 0) return;
    const inner = new AbortController();
    const onAbort = () => inner.abort();
    signal.addEventListener("abort", onAbort);
    this.wake = () => inner.abort();
    try {
      await this.deps.clock.sleep(ms, inner.signal);
    } catch {
      // Woken early or aborted.
    } finally {
      this.wake = null;
      signal.removeEventListener("abort", onAbort);
    }
    if (signal.aborted) throw new Aborted();
  }

  private async loop(signal: AbortSignal) {
    const { shared, account } = this.deps;
    this.setMode("connecting");
    while (!signal.aborted) {
      const stopUntil = shared.authStopUntil[account] ?? 0;
      if (this.now() < stopUntil) {
        this.state = pauseProgress(this.state);
        this.setMode("auth_required");
        await this.sleep(stopUntil - this.now(), signal);
        continue;
      }
      const floor = (shared.lastStreamCloseAt ?? -Infinity) + REOPEN_FLOOR_MS;
      const useStream =
        this.deps.streamEnabled &&
        !this.snapshotNext &&
        this.now() >= this.nextStreamAt;
      if (useStream && this.now() < floor) {
        await this.sleep(floor - this.now(), signal);
        continue;
      }
      if (useStream) {
        const end = await this.stream(signal);
        if (end.kind === "aborted") return;
        if (end.kind === "auth") {
          this.authStop();
          continue;
        }
        if (end.kind === "unsupported") {
          this.state = pauseProgress(this.state);
          this.setMode("unavailable");
          this.nextStreamAt = this.now() + UNSUPPORTED_WAIT_MS;
          this.snapshotNext = true;
          // A proxy may support JSON but not streaming: try the snapshot first.
          await this.sleep(FALLBACK_INTERVAL_MS, signal);
          continue;
        }
        this.streamFailures = Math.min(this.streamFailures + 1, 6);
        this.nextStreamAt =
          this.now() +
          Math.max(
            backoffMs(this.streamFailures, this.deps.random),
            end.retryMs,
          );
        this.deps.log?.(`live stream ended: ${end.reason}`);
        this.snapshotNext = true;
        this.state = pauseProgress(this.state);
        this.setMode("reconnecting");
        await this.sleep(Math.max(FALLBACK_INTERVAL_MS, end.retryMs), signal);
        continue;
      }
      const end = await this.snapshot(signal);
      this.snapshotNext = false;
      if (end.kind === "aborted") return;
      if (end.kind === "auth") {
        this.authStop();
        continue;
      }
      if (end.kind === "unsupported") {
        this.state = pauseProgress(this.state);
        this.setMode("unavailable");
        this.nextStreamAt = 0;
        await this.sleep(UNSUPPORTED_WAIT_MS, signal);
        continue;
      }
      if (end.kind === "ok") {
        this.snapshotFailures = 0;
        this.setMode("polling");
        await this.sleep(FALLBACK_INTERVAL_MS, signal);
        continue;
      }
      this.snapshotFailures = Math.min(this.snapshotFailures + 1, 6);
      this.state = pauseProgress(this.state);
      this.setMode("reconnecting");
      await this.sleep(
        Math.max(
          backoffMs(this.snapshotFailures, this.deps.random),
          end.retryMs,
        ),
        signal,
      );
    }
  }

  private authStop() {
    this.deps.shared.authStopUntil[this.deps.account] =
      this.now() + AUTH_STOP_MS;
    this.state = pauseProgress(this.state);
    this.setMode("auth_required");
    this.deps.authIssue();
  }

  private apply(
    type: string,
    data: string,
    source: "stream" | "fallback",
    cursor: ProgressCursor,
  ) {
    const result = applyEnvelope(
      this.state,
      cursor,
      type,
      data,
      source,
      this.now(),
    );
    if (!result.ok) return { invalid: true as const };
    this.state = result.state;
    for (const e of result.effects) {
      if (e.kind === "record" || e.kind === "deleted") this.deps.effect(e);
    }
    return {
      invalid: false as const,
      cursor: result.cursor,
      effects: result.effects,
    };
  }

  private failureOf(
    r: HttpFailure,
  ):
    | { kind: "auth" }
    | { kind: "unsupported" }
    | { kind: "failed"; retryMs: number } {
    if (r.status === 401) return { kind: "auth" };
    if ([200, 301, 302, 404, 405, 501].includes(r.status))
      return { kind: "unsupported" };
    // A 403 on a read route can't come from the service (it never sends one there): a proxy
    // refusal, retried with backoff. Not an auth denial: no probe, the proof is kept.
    return { kind: "failed", retryMs: retryAfterMs(r.retryAfter, this.now()) };
  }

  private async stream(outer: AbortSignal): Promise<StreamEnd> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    outer.addEventListener("abort", abort);
    let opened = false;
    try {
      this.setMode(this.state.boot ? "reconnecting" : "connecting");
      const open = await this.deps.transport
        .openStream(controller.signal)
        .catch((e) => {
          if (controller.signal.aborted) throw new Aborted();
          throw e;
        });
      if (outer.aborted) return { kind: "aborted" };
      if (open.kind === "http") {
        const f = this.failureOf(open);
        return f.kind === "failed"
          ? { ...f, reason: `http ${open.status}` }
          : f;
      }
      opened = true;
      this.streamOpen = true;
      const parser = createSseParser();
      let cursor = newCursor();
      let idleAt = this.now() + STREAM_IDLE_MS;
      let snapshotDueAt: number | null = this.now() + SNAPSHOT_DEADLINE_MS;
      while (true) {
        const deadline = Math.min(idleAt, snapshotDueAt ?? Infinity);
        const chunk = await this.readWithin(
          open.handle,
          deadline,
          controller,
          outer,
        );
        if (chunk === "timeout") {
          return {
            kind: "failed",
            retryMs: 0,
            reason:
              snapshotDueAt !== null && this.now() >= snapshotDueAt
                ? "no snapshot"
                : "idle",
          };
        }
        if (chunk === null)
          return { kind: "failed", retryMs: 0, reason: "closed" };
        idleAt = this.now() + STREAM_IDLE_MS;
        let items: ReturnType<typeof parser.push>;
        try {
          items = parser.push(chunk);
        } catch (e) {
          if (e instanceof SseOverflowError) return { kind: "unsupported" };
          throw e;
        }
        for (const item of items) {
          if (item.kind !== "event" || !KNOWN_EVENTS.has(item.event)) continue;
          const result = this.apply(item.event, item.data, "stream", cursor);
          if (result.invalid) {
            this.deps.log?.(`live progress: rejected ${item.event} event`);
            return { kind: "unsupported" };
          }
          cursor = result.cursor;
          for (const e of result.effects) {
            if (e.kind === "end_stream")
              return { kind: "failed", retryMs: 0, reason: "new boot" };
            if (e.kind === "auth_expired") return { kind: "auth" };
            if (e.kind === "awaiting_snapshot")
              snapshotDueAt = this.now() + SNAPSHOT_DEADLINE_MS;
          }
          if (item.event === "snapshot" && cursor.snapshot) {
            snapshotDueAt = null;
            this.streamFailures = 0;
          }
          this.setMode(
            cursor.paused
              ? "revalidating"
              : cursor.snapshot
                ? "live"
                : "connecting",
          );
        }
      }
    } catch (e) {
      if (e instanceof Aborted || outer.aborted) return { kind: "aborted" };
      return { kind: "failed", retryMs: 0, reason: "network" };
    } finally {
      outer.removeEventListener("abort", abort);
      controller.abort();
      if (opened && this.streamOpen)
        this.deps.shared.lastStreamCloseAt = this.now();
      this.streamOpen = false;
    }
  }

  /** Read one chunk before `deadline`; "timeout" when it passes (the stream is then aborted). */
  private async readWithin(
    handle: StreamHandle,
    deadline: number,
    controller: AbortController,
    outer: AbortSignal,
  ): Promise<string | null | "timeout"> {
    const timer = new AbortController();
    const timeout = this.deps.clock
      .sleep(Math.max(0, deadline - this.now()), timer.signal)
      .then(() => "timeout" as const)
      .catch(() => new Promise<never>(() => {}));
    try {
      const result = await Promise.race([handle.read(), timeout]);
      if (outer.aborted) throw new Aborted();
      if (result === "timeout") controller.abort();
      return result;
    } finally {
      timer.abort();
    }
  }

  private async snapshot(outer: AbortSignal): Promise<SnapshotEnd> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    outer.addEventListener("abort", abort);
    const timer = new AbortController();
    try {
      const timeout = this.deps.clock
        .sleep(SNAPSHOT_TIMEOUT_MS, timer.signal)
        .then(() => "timeout" as const)
        .catch(() => new Promise<never>(() => {}));
      const result = await Promise.race([
        this.deps.transport.getSnapshot(controller.signal),
        timeout,
      ]);
      // A result that arrives after its attempt ended is discarded before anything is applied.
      if (outer.aborted) return { kind: "aborted" };
      if (result === "timeout") return { kind: "failed", retryMs: 0 };
      if (result.kind === "http") return this.failureOf(result);
      const applied = this.apply(
        "snapshot",
        result.body,
        "fallback",
        newCursor(),
      );
      if (applied.invalid) return { kind: "unsupported" };
      return { kind: "ok" };
    } catch {
      if (outer.aborted) return { kind: "aborted" };
      return { kind: "failed", retryMs: 0 };
    } finally {
      timer.abort();
      controller.abort();
      outer.removeEventListener("abort", abort);
    }
  }
}
