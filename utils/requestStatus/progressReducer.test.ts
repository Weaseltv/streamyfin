import { describe, expect, test } from "bun:test";
import envelopes from "../../docs/request-notifications/progress-envelopes.fixture.json";
import {
  type ApplyResult,
  applyEnvelope,
  emptyProgressState,
  MAX_ENVELOPE_CHARS,
  newCursor,
  type ProgressCursor,
  type ProgressState,
  pauseProgress,
} from "./progressReducer";

const NOW = 1_800_000_000_000;
const BOOT = envelopes.snapshot.boot;
const json = (v: unknown) => JSON.stringify(v);
const [revalidating, okStatus] = envelopes.status;

type Ok = Extract<ApplyResult, { ok: true }>;
const ok = (r: ApplyResult): Ok => {
  if (!r.ok) throw new Error("rejected");
  return r;
};
const stream = (
  s: ProgressState,
  c: ProgressCursor,
  type: string,
  body: unknown,
) =>
  applyEnvelope(
    s,
    c,
    type,
    typeof body === "string" ? body : json(body),
    "stream",
    NOW,
  );
const started = () =>
  ok(stream(emptyProgressState(), newCursor(), "snapshot", envelopes.snapshot));

describe("snapshot", () => {
  test("the operator's snapshot replaces the records and sets the attempt's boot", () => {
    const r = started();
    expect([...r.state.records.keys()]).toEqual([9001, 9002, 9003]);
    expect(r.state.boot).toBe(BOOT);
    expect(r.state.transportStale).toBe(false);
    expect(r.state.lastReceivedMs).toBe(NOW);
    expect(r.cursor).toEqual({
      boot: BOOT,
      rev: 48211,
      snapshot: true,
      paused: false,
    });
    expect(r.effects.map((e) => e.kind)).toEqual([
      "record",
      "record",
      "record",
    ]);
  });

  test("a new stream's first snapshot on another boot is accepted over records kept from before", () => {
    const kept = started().state;
    const other = { ...envelopes.snapshot, boot: "new-boot", rev: 3 };
    const r = ok(stream(kept, newCursor(), "snapshot", other));
    expect(r.state.boot).toBe("new-boot");
    expect(r.state.rev).toBe(3);
    expect(r.cursor.boot).toBe("new-boot");
  });

  test("an older snapshot of the same boot never replaces a newer one", () => {
    const s = started();
    const older = { ...envelopes.snapshot, rev: 100, requests: [] };
    const r = ok(
      applyEnvelope(
        s.state,
        newCursor(),
        "snapshot",
        json(older),
        "fallback",
        NOW,
      ),
    );
    expect(r.state).toBe(s.state);
  });

  test("a fallback snapshot with another boot replaces the records", () => {
    const s = started();
    const other = {
      ...envelopes.snapshot,
      boot: "restarted",
      rev: 1,
      requests: [],
    };
    const r = ok(
      applyEnvelope(
        s.state,
        newCursor(),
        "snapshot",
        json(other),
        "fallback",
        NOW,
      ),
    );
    expect(r.state.records.size).toBe(0);
    expect(r.state.boot).toBe("restarted");
  });

  test("after the first snapshot, another boot on the same stream ends the stream", () => {
    const s = started();
    const r = ok(
      stream(s.state, s.cursor, "snapshot", {
        ...envelopes.snapshot,
        boot: "x",
        rev: 1,
      }),
    );
    expect(r.effects).toEqual([{ kind: "end_stream" }]);
    expect(r.state).toBe(s.state);
    const u = ok(
      stream(s.state, s.cursor, "update", { ...envelopes.update, boot: "x" }),
    );
    expect(u.effects).toEqual([{ kind: "end_stream" }]);
  });
});

describe("update, remove, rev", () => {
  test("an update replaces one record; a gap in rev is normal", () => {
    const s = started();
    const r = ok(stream(s.state, s.cursor, "update", envelopes.update));
    expect(r.state.records.get(9001)?.stageProgress).toBe(0.573);
    expect(r.cursor.rev).toBe(48230);
    // Same availability, seasons and status: nothing for the canonical layer to verify.
    expect(r.effects).toEqual([]);
  });

  test("an update for a new record or a changed availability is passed on", () => {
    const s = started();
    const changed = {
      ...envelopes.update,
      request: {
        ...envelopes.update.request,
        availability: "full",
        stage: "ready",
      },
    };
    expect(
      ok(stream(s.state, s.cursor, "update", changed)).effects.map(
        (e) => e.kind,
      ),
    ).toEqual(["record"]);
    const fresh = {
      ...envelopes.update,
      request: { ...envelopes.update.request, requestId: 9100 },
    };
    expect(
      ok(stream(s.state, s.cursor, "update", fresh)).effects.map((e) => e.kind),
    ).toEqual(["record"]);
    const unstale = ok(
      stream(s.state, s.cursor, "update", {
        ...envelopes.update,
        request: { ...envelopes.update.request, stale: true },
      }),
    );
    expect(
      ok(
        stream(unstale.state, unstale.cursor, "update", {
          ...envelopes.update,
          rev: 48231,
        }),
      ).effects,
    ).toHaveLength(1);
  });

  test("events before the first snapshot or with an older rev are ignored", () => {
    const before = ok(
      stream(emptyProgressState(), newCursor(), "update", envelopes.update),
    );
    expect(before.state.records.size).toBe(0);
    const s = started();
    const old = ok(
      stream(s.state, s.cursor, "update", { ...envelopes.update, rev: 48211 }),
    );
    expect(old.state).toBe(s.state);
  });

  test("remove: deleted wakes the canonical sync, aged out only drops the record", () => {
    const s = started();
    const deleted = ok(
      stream(s.state, s.cursor, "remove", {
        ...envelopes.remove,
        requestId: 9001,
      }),
    );
    expect(deleted.state.records.has(9001)).toBe(false);
    expect(deleted.effects).toEqual([{ kind: "deleted", requestId: 9001 }]);
    const aged = ok(
      stream(s.state, s.cursor, "remove", {
        ...envelopes.remove,
        requestId: 9003,
        reason: "aged_out",
      }),
    );
    expect(aged.state.records.has(9003)).toBe(false);
    expect(aged.effects).toEqual([]);
  });
});

describe("status and sign-in", () => {
  test("revalidating holds updates; ok waits for the fresh snapshot", () => {
    const s = started();
    const held = ok(stream(s.state, s.cursor, "status", revalidating));
    expect(held.cursor.paused).toBe(true);
    expect(held.state.transportStale).toBe(true);
    expect(held.effects).toEqual([{ kind: "revalidating" }]);
    const ignored = ok(
      stream(held.state, held.cursor, "update", {
        ...envelopes.update,
        rev: 48310,
      }),
    );
    expect(ignored.state.records.get(9001)?.stageProgress).toBe(0.418);
    const snapWhilePaused = ok(
      stream(held.state, held.cursor, "snapshot", {
        ...envelopes.snapshot,
        rev: 48315,
      }),
    );
    expect(snapWhilePaused.state).toBe(held.state);

    const resumed = ok(stream(held.state, held.cursor, "status", okStatus));
    expect(resumed.cursor).toMatchObject({ paused: false, snapshot: false });
    expect(resumed.effects).toEqual([{ kind: "awaiting_snapshot" }]);
    const early = ok(
      stream(resumed.state, resumed.cursor, "update", {
        ...envelopes.update,
        rev: 48323,
      }),
    );
    expect(early.state).toBe(resumed.state);
    const fresh = ok(
      stream(resumed.state, resumed.cursor, "snapshot", {
        ...envelopes.snapshot,
        rev: 48324,
      }),
    );
    expect(fresh.cursor.snapshot).toBe(true);
    expect(fresh.state.transportStale).toBe(false);
  });

  test("auth_expired is reported as a sign-out", () => {
    const s = started();
    expect(
      ok(stream(s.state, s.cursor, "auth_expired", envelopes.authExpired))
        .effects,
    ).toEqual([{ kind: "auth_expired" }]);
  });

  test("pausing keeps the records and marks them last known", () => {
    const s = started().state;
    const p = pauseProgress(s);
    expect(p.records).toBe(s.records);
    expect(p.transportStale).toBe(true);
    expect(pauseProgress(p)).toBe(p);
  });
});

describe("rejected envelopes", () => {
  const base = envelopes.snapshot;
  const rejected = (
    type: string,
    body: unknown,
    source: "stream" | "fallback" = "stream",
  ) =>
    applyEnvelope(
      emptyProgressState(),
      newCursor(),
      type,
      typeof body === "string" ? body : json(body),
      source,
      NOW,
    ).ok === false;

  test("unsafe, negative or fractional rev; blank boot; wrong version; bad time; bad JSON", () => {
    expect(rejected("snapshot", { ...base, rev: 2 ** 53 })).toBe(true);
    expect(rejected("snapshot", { ...base, rev: -1 })).toBe(true);
    expect(rejected("snapshot", { ...base, rev: 1.5 })).toBe(true);
    expect(rejected("snapshot", { ...base, boot: " " })).toBe(true);
    expect(rejected("snapshot", { ...base, v: 2 })).toBe(true);
    expect(rejected("snapshot", { ...base, observedAt: "now" })).toBe(true);
    expect(rejected("snapshot", "{")).toBe(true);
    expect(rejected("snapshot", "[]")).toBe(true);
  });

  test("caps: size, record count, duplicate ids, an invalid record", () => {
    expect(rejected("snapshot", " ".repeat(MAX_ENVELOPE_CHARS + 1))).toBe(true);
    const many = Array.from({ length: 1001 }, (_, i) => ({
      ...base.requests[0],
      requestId: i + 1,
    }));
    expect(rejected("snapshot", { ...base, requests: many })).toBe(true);
    expect(
      rejected("snapshot", {
        ...base,
        requests: [base.requests[0], base.requests[0]],
      }),
    ).toBe(true);
    expect(
      rejected("snapshot", {
        ...base,
        requests: [{ ...base.requests[0], tmdbId: 0 }],
      }),
    ).toBe(true);
    const s = started();
    expect(
      stream(s.state, s.cursor, "update", {
        ...envelopes.update,
        request: { requestId: 1 },
      }).ok,
    ).toBe(false);
    expect(
      stream(s.state, s.cursor, "remove", {
        ...envelopes.remove,
        requestId: "9001",
      }).ok,
    ).toBe(false);
  });

  test("a fallback read must be a snapshot; unknown stream events are ignored", () => {
    expect(rejected("update", envelopes.update, "fallback")).toBe(true);
    const r = applyEnvelope(
      emptyProgressState(),
      newCursor(),
      "hello",
      "{",
      "stream",
      NOW,
    );
    expect(r.ok).toBe(true);
  });
});
