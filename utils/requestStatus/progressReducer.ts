/**
 * Applying one progress-service envelope to the live records. Port of `apply` in the TV's
 * `services/RequestProgressRepository.kt` (:472-560), with the phone rules from plan 5.4 that the
 * Unraid operator's answers (2026-11-21) required:
 *
 * - `rev` is one service-wide counter with gaps; it is compared only within one `boot`.
 * - The first snapshot of a stream attempt sets that attempt's `boot`; after it, an envelope with
 *   another `boot` ends the stream (the reopened stream starts with its own snapshot). A fallback
 *   snapshot with another `boot` replaces the records.
 * - `status` `revalidating` holds updates; `ok` waits for the fresh snapshot that follows it.
 * - `remove` with `reason: "deleted"` wakes the canonical sync; `aged_out` only drops the record.
 *
 * Anything malformed is rejected as a whole (`invalid`); the runner treats that as unsupported.
 */
import { isInstant, isValidRecord, normalizeRecord } from "./progressRecord";
import type { RequestProgressRecord } from "./types";

export const MAX_ENVELOPE_CHARS = 2_000_000;
export const MAX_RECORDS = 1000;

export const KNOWN_EVENTS = new Set([
  "snapshot",
  "update",
  "remove",
  "status",
  "auth_expired",
]);

/** Per stream attempt (a fallback snapshot uses a fresh one each time). */
export interface ProgressCursor {
  boot: string | null;
  rev: number;
  /** A snapshot has been applied since the attempt started or since `status ok`. */
  snapshot: boolean;
  /** `status revalidating`: updates are held until `ok` and its snapshot. */
  paused: boolean;
}

export const newCursor = (): ProgressCursor => ({
  boot: null,
  rev: -1,
  snapshot: false,
  paused: false,
});

export interface ProgressState {
  records: ReadonlyMap<number, RequestProgressRecord>;
  boot: string | null;
  rev: number;
  /** The rows are last known (paused, reconnecting, revalidating). */
  transportStale: boolean;
  lastReceivedMs: number | null;
}

export const emptyProgressState = (): ProgressState => ({
  records: new Map(),
  boot: null,
  rev: -1,
  transportStale: true,
  lastReceivedMs: null,
});

/** Live updates stopped (gate closed, backgrounded): keep the records, mark them last known. */
export const pauseProgress = (s: ProgressState): ProgressState =>
  s.transportStale ? s : { ...s, transportStale: true };

export type ProgressEffect =
  /** The canonical layer may verify this request against its row. */
  | { kind: "record"; record: RequestProgressRecord }
  /** A request was deleted: wake the canonical sync. */
  | { kind: "deleted"; requestId: number }
  /** The session ended (treated as a 401). */
  | { kind: "auth_expired" }
  /** Another `boot` after the attempt's first snapshot: end this stream. */
  | { kind: "end_stream" }
  | { kind: "revalidating" }
  /** `status ok`: the fresh snapshot is due within 15 s. */
  | { kind: "awaiting_snapshot" };

export type ApplyResult =
  | {
      ok: true;
      state: ProgressState;
      cursor: ProgressCursor;
      effects: ProgressEffect[];
    }
  | { ok: false; reason: "invalid" };

interface Envelope {
  v: 1;
  boot: string;
  rev: number;
  observedAt: string;
  requests?: unknown;
  request?: unknown;
  requestId?: unknown;
  reason?: unknown;
  auth?: unknown;
}

function parseEnvelope(data: string): Envelope | null {
  if (data.length > MAX_ENVELOPE_CHARS) return null;
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const e = value as Record<string, unknown>;
  if (e.v !== 1) return null;
  if (typeof e.boot !== "string" || e.boot.trim() === "") return null;
  if (!Number.isSafeInteger(e.rev) || (e.rev as number) < 0) return null;
  if (!isInstant(e.observedAt)) return null;
  return e as unknown as Envelope;
}

const sameSeasons = (a: RequestProgressRecord, b: RequestProgressRecord) =>
  JSON.stringify(a.seasons) === JSON.stringify(b.seasons);

const ignore = (state: ProgressState, cursor: ProgressCursor): ApplyResult => ({
  ok: true,
  state,
  cursor,
  effects: [],
});

/**
 * Apply one envelope.
 * @param source "stream" for an event on the open stream; "fallback" for a `/snapshot` read.
 */
export function applyEnvelope(
  state: ProgressState,
  cursor: ProgressCursor,
  type: string,
  data: string,
  source: "stream" | "fallback",
  nowMs: number,
): ApplyResult {
  if (!KNOWN_EVENTS.has(type)) return ignore(state, cursor);
  if (source === "fallback" && type !== "snapshot")
    return { ok: false, reason: "invalid" };
  const e = parseEnvelope(data);
  if (!e) return { ok: false, reason: "invalid" };

  if (type === "snapshot") {
    if (cursor.paused) return ignore(state, cursor);
    const rows = e.requests;
    if (!Array.isArray(rows) || rows.length > MAX_RECORDS)
      return { ok: false, reason: "invalid" };
    if (!rows.every(isValidRecord)) return { ok: false, reason: "invalid" };
    const records = rows.map(normalizeRecord);
    if (new Set(records.map((r) => r.requestId)).size !== records.length)
      return { ok: false, reason: "invalid" };
    if (source === "stream" && cursor.boot !== null && cursor.boot !== e.boot) {
      return { ok: true, state, cursor, effects: [{ kind: "end_stream" }] };
    }
    // An older snapshot of the same boot never replaces a newer one (it lost a race).
    if (state.boot === e.boot && e.rev < state.rev)
      return ignore(state, cursor);
    return {
      ok: true,
      state: {
        records: new Map(records.map((r) => [r.requestId, r])),
        boot: e.boot,
        rev: e.rev,
        transportStale: false,
        lastReceivedMs: nowMs,
      },
      cursor: { ...cursor, boot: e.boot, rev: e.rev, snapshot: true },
      effects: records.map((record) => ({ kind: "record", record })),
    };
  }

  if (cursor.boot !== null && e.boot !== cursor.boot) {
    return { ok: true, state, cursor, effects: [{ kind: "end_stream" }] };
  }
  if (!cursor.snapshot || e.rev <= cursor.rev) return ignore(state, cursor);
  const next = { ...cursor, rev: e.rev };

  switch (type) {
    case "status":
      if (e.auth === "revalidating") {
        return {
          ok: true,
          state: { ...state, transportStale: true, rev: e.rev },
          cursor: { ...next, paused: true },
          effects: [{ kind: "revalidating" }],
        };
      }
      if (e.auth === "ok") {
        return {
          ok: true,
          state: { ...state, transportStale: true, rev: e.rev },
          cursor: { ...next, paused: false, snapshot: false },
          effects: [{ kind: "awaiting_snapshot" }],
        };
      }
      return ignore(state, next);
    case "auth_expired":
      return {
        ok: true,
        state,
        cursor: next,
        effects: [{ kind: "auth_expired" }],
      };
    case "update": {
      if (next.paused) return ignore(state, next);
      if (!isValidRecord(e.request)) return { ok: false, reason: "invalid" };
      const row = normalizeRecord(e.request);
      const prior = state.records.get(row.requestId);
      const records = new Map(state.records);
      records.set(row.requestId, row);
      const changed =
        !prior ||
        row.availability !== prior.availability ||
        !sameSeasons(row, prior) ||
        (row.seerrStatus ?? null) !== (prior.seerrStatus ?? null) ||
        (prior.stale && !row.stale);
      return {
        ok: true,
        state: {
          records,
          boot: state.boot,
          rev: e.rev,
          transportStale: false,
          lastReceivedMs: nowMs,
        },
        cursor: next,
        effects: changed ? [{ kind: "record", record: row }] : [],
      };
    }
    case "remove": {
      if (next.paused) return ignore(state, next);
      const id = e.requestId;
      if (!Number.isSafeInteger(id)) return { ok: false, reason: "invalid" };
      const records = new Map(state.records);
      records.delete(id as number);
      return {
        ok: true,
        state: { ...state, records, rev: e.rev, lastReceivedMs: nowMs },
        cursor: next,
        effects:
          e.reason === "deleted"
            ? [{ kind: "deleted", requestId: id as number }]
            : [],
      };
    }
    default:
      return ignore(state, next);
  }
}
