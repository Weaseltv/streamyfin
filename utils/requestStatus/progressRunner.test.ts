import { describe, expect, test } from "bun:test";
import envelopes from "../../docs/request-notifications/progress-envelopes.fixture.json";
import type { ProgressEffect, ProgressState } from "./progressReducer";
import {
  AUTH_STOP_MS,
  type HttpFailure,
  newRunnerShared,
  type ProgressMode,
  ProgressRunner,
  type RunnerClock,
  type RunnerShared,
  type StreamHandle,
} from "./progressRunner";

const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

class FakeClock implements RunnerClock {
  t = 1_000_000;
  private timers: { at: number; resolve: () => void; id: number }[] = [];
  private nextId = 0;
  now = () => this.t;
  sleep = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      if (signal.aborted) return reject(new Error("aborted"));
      const id = this.nextId++;
      this.timers.push({ at: this.t + ms, resolve, id });
      signal.addEventListener("abort", () => {
        this.timers = this.timers.filter((x) => x.id !== id);
        reject(new Error("aborted"));
      });
    });
  async advance(ms: number) {
    const end = this.t + ms;
    await flush();
    while (true) {
      const due = this.timers
        .filter((x) => x.at <= end)
        .sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.t = due.at;
      this.timers = this.timers.filter((x) => x.id !== due.id);
      due.resolve();
      await flush();
    }
    this.t = end;
    await flush();
  }
}

class FakeStream implements StreamHandle {
  private queue: (string | null)[] = [];
  private waiting: {
    resolve: (v: string | null) => void;
    reject: (e: unknown) => void;
  } | null = null;
  constructor(signal: AbortSignal) {
    signal.addEventListener("abort", () => {
      this.waiting?.reject(new Error("aborted"));
      this.waiting = null;
    });
  }
  push(chunk: string | null) {
    if (this.waiting) {
      this.waiting.resolve(chunk);
      this.waiting = null;
    } else this.queue.push(chunk);
  }
  read() {
    if (this.queue.length)
      return Promise.resolve(this.queue.shift() as string | null);
    return new Promise<string | null>((resolve, reject) => {
      this.waiting = { resolve, reject };
    });
  }
}

const frame = (event: string, body: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(body)}\n\n`;
const SNAPSHOT = frame("snapshot", envelopes.snapshot);

function setup(opts: { streamEnabled?: boolean; shared?: RunnerShared } = {}) {
  const clock = new FakeClock();
  const streams: FakeStream[] = [];
  const opens: ({ kind: "stream" } | HttpFailure)[] = [];
  const snapshots: ({ kind: "ok"; body: string } | HttpFailure | "hang")[] = [];
  let snapshotCalls = 0;
  let openCalls = 0;
  let pendingSnapshot: ((v: { kind: "ok"; body: string }) => void) | null =
    null;
  const modes: ProgressMode[] = [];
  const effects: ProgressEffect[] = [];
  let authIssues = 0;
  let last: ProgressState | null = null;
  const shared = opts.shared ?? newRunnerShared();
  const runner = new ProgressRunner({
    clock,
    shared,
    account: "acct",
    streamEnabled: opts.streamEnabled ?? true,
    random: () => 0,
    transport: {
      openStream: async (signal) => {
        openCalls++;
        const scripted = opens.shift() ?? { kind: "stream" as const };
        if (scripted.kind === "http") return scripted;
        const s = new FakeStream(signal);
        streams.push(s);
        return { kind: "stream", handle: s };
      },
      getSnapshot: async () => {
        snapshotCalls++;
        const next = snapshots.shift() ?? {
          kind: "ok" as const,
          body: JSON.stringify(envelopes.snapshot),
        };
        if (next === "hang") {
          return new Promise((resolve) => {
            pendingSnapshot = resolve;
          });
        }
        return next;
      },
    },
    publish: (state, mode) => {
      last = state;
      if (modes[modes.length - 1] !== mode) modes.push(mode);
    },
    effect: (e) => effects.push(e),
    authIssue: () => {
      authIssues++;
    },
  });
  return {
    clock,
    runner,
    streams,
    opens,
    snapshots,
    modes,
    effects,
    shared,
    get openCalls() {
      return openCalls;
    },
    get snapshotCalls() {
      return snapshotCalls;
    },
    get authIssues() {
      return authIssues;
    },
    get state() {
      return last;
    },
    resolvePendingSnapshot: () =>
      pendingSnapshot?.({
        kind: "ok",
        body: JSON.stringify(envelopes.snapshot),
      }),
  };
}

describe("live stream", () => {
  test("opens, applies its snapshot, and makes no /snapshot reads while healthy", async () => {
    const s = setup();
    s.runner.start();
    await s.clock.advance(0);
    s.streams[0].push(`retry: 2000\n\n${SNAPSHOT}`);
    await s.clock.advance(1);
    expect(s.runner.currentMode).toBe("live");
    expect(s.state?.records.size).toBe(3);
    expect(s.effects.filter((e) => e.kind === "record")).toHaveLength(3);
    for (let i = 0; i < 8; i++) {
      await s.clock.advance(15_000);
      s.streams[0].push(": ping\n\n");
    }
    expect(s.snapshotCalls).toBe(0);
    expect(s.openCalls).toBe(1);
    expect(s.runner.currentMode).toBe("live");
  });

  test("no snapshot within 15 s: the stream ends, /snapshot fills in, the stream is retried", async () => {
    const s = setup();
    s.runner.start();
    await s.clock.advance(0);
    s.streams[0].push(": ping\n\n");
    await s.clock.advance(15_000);
    expect(s.runner.currentMode).toBe("reconnecting");
    await s.clock.advance(2_000);
    expect(s.snapshotCalls).toBe(1);
    expect(s.runner.currentMode).toBe("polling");
    // The stream's retry (2 s backoff) is due after that read: no second snapshot first.
    await s.clock.advance(2_000);
    expect(s.openCalls).toBe(2);
    expect(s.snapshotCalls).toBe(1);
  });

  test("40 s without bytes ends the stream", async () => {
    const s = setup();
    s.runner.start();
    await s.clock.advance(0);
    s.streams[0].push(SNAPSHOT);
    await s.clock.advance(39_999);
    expect(s.runner.currentMode).toBe("live");
    await s.clock.advance(1);
    expect(s.runner.currentMode).toBe("reconnecting");
  });

  test("status ok must be followed by a snapshot within 15 s, even while pings arrive", async () => {
    const s = setup();
    s.runner.start();
    await s.clock.advance(0);
    s.streams[0].push(SNAPSHOT);
    await s.clock.advance(1);
    s.streams[0].push(frame("status", envelopes.status[0]));
    await s.clock.advance(1);
    expect(s.runner.currentMode).toBe("revalidating");
    s.streams[0].push(frame("status", envelopes.status[1]));
    for (let i = 0; i < 3; i++) {
      await s.clock.advance(5_000);
      s.streams[0].push(": ping\n\n");
    }
    await s.clock.advance(1);
    expect(s.runner.currentMode).toBe("reconnecting");
  });

  test("an event with another boot ends the stream; the reopened one starts from its snapshot", async () => {
    const s = setup();
    s.runner.start();
    await s.clock.advance(0);
    s.streams[0].push(SNAPSHOT);
    await s.clock.advance(1);
    s.streams[0].push(
      frame("update", { ...envelopes.update, boot: "restarted" }),
    );
    await s.clock.advance(1);
    expect(s.runner.currentMode).toBe("reconnecting");
    // Fallback snapshot after 2 s, then the stream again once its backoff (2 s) passed.
    await s.clock.advance(2_000);
    await s.clock.advance(2_000);
    expect(s.openCalls).toBe(2);
    s.streams[1].push(
      frame("snapshot", { ...envelopes.snapshot, boot: "restarted", rev: 5 }),
    );
    await s.clock.advance(1);
    expect(s.state?.boot).toBe("restarted");
    expect(s.runner.currentMode).toBe("live");
  });

  test("a rejected event is unsupported: snapshot first, stream again after 60 s", async () => {
    const s = setup();
    s.runner.start();
    await s.clock.advance(0);
    s.streams[0].push("event: snapshot\ndata: {bad json\n\n");
    await s.clock.advance(1);
    expect(s.runner.currentMode).toBe("unavailable");
    await s.clock.advance(2_000);
    expect(s.snapshotCalls).toBe(1);
    await s.clock.advance(60_000);
    expect(s.openCalls).toBe(2);
  });
});

describe("gate, floor and late results", () => {
  test("stopping keeps the records as last known; reopening waits for the 2 s floor", async () => {
    const s = setup();
    s.runner.start();
    await s.clock.advance(0);
    s.streams[0].push(SNAPSHOT);
    await s.clock.advance(1);
    s.runner.stop();
    await s.clock.advance(0);
    expect(s.state?.records.size).toBe(3);
    expect(s.state?.transportStale).toBe(true);
    await s.clock.advance(500);
    s.runner.start();
    await s.clock.advance(1_000);
    expect(s.openCalls).toBe(1);
    await s.clock.advance(600);
    expect(s.openCalls).toBe(2);
  });

  test("rapid gate flaps never open more than one stream inside the floor", async () => {
    const s = setup();
    s.runner.start();
    await s.clock.advance(0);
    for (let i = 0; i < 5; i++) {
      s.runner.stop();
      s.runner.start();
      await s.clock.advance(300);
    }
    expect(s.openCalls).toBe(1);
    await s.clock.advance(2_000);
    expect(s.openCalls).toBe(2);
  });

  test("a scope change inside the floor waits too (the floor is shared)", async () => {
    const a = setup();
    a.runner.start();
    await a.clock.advance(0);
    a.runner.dispose();
    const b = setup({ shared: a.shared });
    b.clock.t = a.clock.t + 500;
    b.runner.start();
    await b.clock.advance(1_000);
    expect(b.openCalls).toBe(0);
    await b.clock.advance(600);
    expect(b.openCalls).toBe(1);
  });

  test("a snapshot that answers after its attempt ended is discarded", async () => {
    const s = setup({ streamEnabled: false });
    s.snapshots.push("hang");
    s.runner.start();
    await s.clock.advance(0);
    s.runner.stop();
    s.resolvePendingSnapshot();
    await s.clock.advance(1);
    expect(s.state?.records.size ?? 0).toBe(0);
  });
});

describe("failures", () => {
  test("a 401 stops live updates for 15 minutes and signals the session probe once", async () => {
    const s = setup();
    s.opens.push({ kind: "http", status: 401, error: "signed_out" });
    s.runner.start();
    await s.clock.advance(0);
    expect(s.runner.currentMode).toBe("auth_required");
    expect(s.authIssues).toBe(1);
    await s.clock.advance(AUTH_STOP_MS - 1);
    expect(s.openCalls).toBe(1);
    expect(s.snapshotCalls).toBe(0);
    s.runner.refresh();
    await s.clock.advance(1);
    expect(s.openCalls).toBe(2);
  });

  test("auth_expired on the stream is a sign-out", async () => {
    const s = setup();
    s.runner.start();
    await s.clock.advance(0);
    s.streams[0].push(SNAPSHOT);
    await s.clock.advance(1);
    s.streams[0].push(frame("auth_expired", envelopes.authExpired));
    await s.clock.advance(1);
    expect(s.runner.currentMode).toBe("auth_required");
    expect(s.authIssues).toBe(1);
  });

  test("a bare 403 is a proxy refusal: backoff, no probe", async () => {
    const s = setup({ streamEnabled: false });
    s.snapshots.push({ kind: "http", status: 403 });
    s.runner.start();
    await s.clock.advance(0);
    expect(s.authIssues).toBe(0);
    expect(s.runner.currentMode).toBe("reconnecting");
    await s.clock.advance(1_999);
    expect(s.snapshotCalls).toBe(1);
    await s.clock.advance(1);
    expect(s.snapshotCalls).toBe(2);
  });

  test("Retry-After is honoured", async () => {
    const s = setup({ streamEnabled: false });
    s.snapshots.push({
      kind: "http",
      status: 503,
      retryAfter: "5",
      error: "seerr_unreachable",
    });
    s.runner.start();
    await s.clock.advance(4_999);
    expect(s.snapshotCalls).toBe(1);
    await s.clock.advance(1);
    expect(s.snapshotCalls).toBe(2);
  });

  test("failures back off 2, 4, 8 s", async () => {
    const s = setup({ streamEnabled: false });
    for (let i = 0; i < 3; i++) s.snapshots.push({ kind: "http", status: 500 });
    s.runner.start();
    await s.clock.advance(0);
    await s.clock.advance(2_000);
    expect(s.snapshotCalls).toBe(2);
    await s.clock.advance(4_000);
    expect(s.snapshotCalls).toBe(3);
    await s.clock.advance(7_999);
    expect(s.snapshotCalls).toBe(3);
    await s.clock.advance(1);
    expect(s.snapshotCalls).toBe(4);
  });

  test("an unsupported stream route falls back to the snapshot, then retries after 60 s", async () => {
    const s = setup();
    s.opens.push({ kind: "http", status: 404 });
    s.runner.start();
    await s.clock.advance(0);
    expect(s.runner.currentMode).toBe("unavailable");
    await s.clock.advance(2_000);
    expect(s.snapshotCalls).toBe(1);
    expect(s.runner.currentMode).toBe("polling");
    await s.clock.advance(58_000);
    expect(s.openCalls).toBe(2);
  });

  test("with streaming off, /snapshot every 2 s", async () => {
    const s = setup({ streamEnabled: false });
    s.runner.start();
    await s.clock.advance(0);
    await s.clock.advance(6_000);
    expect(s.snapshotCalls).toBe(4);
    expect(s.openCalls).toBe(0);
  });
});
