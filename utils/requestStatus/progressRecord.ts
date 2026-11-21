/**
 * One live record from the Unraid progress service: shape check, match to a canonical row,
 * stage label and progress fraction. Port of `RequestProgressRecord` in the TV's
 * `services/RequestProgressRepository.kt` (`valid()` :162-177, `matches()` :149-160,
 * `stageLabel` :132-147, `fraction` :124-129). Field list confirmed by the Unraid operator
 * from the running service (2026-11-21).
 */
import type {
  OwnRequest,
  ProgressSchedule,
  RequestProgressRecord,
  Text,
} from "./types";

const AVAILABILITY = new Set(["none", "partial", "full"]);
/** ISO-8601 instant with a zone, as the service sends (`2026-11-20T21:14:04.987Z`). */
const INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})$/;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);
const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const optional = (v: unknown, check: (x: unknown) => boolean) =>
  v === undefined || v === null || check(v);

export function isInstant(v: unknown): v is string {
  return (
    typeof v === "string" && INSTANT.test(v) && Number.isFinite(Date.parse(v))
  );
}

function isSchedule(v: unknown): v is ProgressSchedule {
  if (!isObject(v)) return false;
  if (!optional(v.nextAiring, (x) => typeof x === "string")) return false;
  if (
    !optional(v.next, (x) => isObject(x) && isInt(x.season) && isInt(x.episode))
  )
    return false;
  const seasons = v.seasons ?? [];
  return (
    Array.isArray(seasons) &&
    seasons.every(
      (s) =>
        isObject(s) &&
        isInt(s.n) &&
        isInt(s.aired) &&
        isInt(s.total) &&
        isInt(s.imported) &&
        optional(s.nextAiring, (x) => typeof x === "string"),
    )
  );
}

/**
 * A record the TV would decode and accept. Anything else is rejected, never repaired: the TV's
 * decoder refuses a missing or wrongly typed field, and its `valid()` refuses impossible values.
 * An unknown `stage` or `detail` is accepted (it shows "Checking request status").
 */
export function isValidRecord(v: unknown): v is RequestProgressRecord {
  if (!isObject(v)) return false;
  if (!isInt(v.requestId) || v.requestId <= 0) return false;
  if (!isInt(v.tmdbId) || v.tmdbId <= 0) return false;
  if (v.mediaType !== "movie" && v.mediaType !== "tv") return false;
  if (typeof v.is4k !== "boolean") return false;
  if (typeof v.availability !== "string" || !AVAILABILITY.has(v.availability))
    return false;
  if (typeof v.stage !== "string") return false;
  const seasons = v.seasons ?? [];
  if (
    !Array.isArray(seasons) ||
    !seasons.every(
      (s) =>
        isObject(s) &&
        isInt(s.n) &&
        s.n >= 0 &&
        typeof s.availability === "string" &&
        AVAILABILITY.has(s.availability),
    )
  )
    return false;
  if (!optional(v.seerrStatus, isInt)) return false;
  if (!optional(v.stageProgress, (x) => isNum(x) && x >= 0 && x <= 1))
    return false;
  if (!optional(v.bytesLeft, (x) => isNum(x) && x >= 0)) return false;
  if (!optional(v.etaSeconds, (x) => isNum(x) && x >= 0)) return false;
  if (!optional(v.detail, (x) => typeof x === "string")) return false;
  if (
    !optional(
      v.episodes,
      (e) =>
        isObject(e) &&
        optional(e.total, (x) => isInt(x) && x >= 0) &&
        optional(e.imported, (x) => isInt(x) && x >= 0) &&
        optional(e.active, (x) => isInt(x) && x >= 0),
    )
  )
    return false;
  if (!optional(v.schedule, isSchedule)) return false;
  if (!optional(v.stale, (x) => typeof x === "boolean")) return false;
  if (!optional(v.staleSince, (x) => typeof x === "string")) return false;
  return isInstant(v.observedAt) && isInstant(v.updatedAt);
}

/** A validated record with its optional fields filled the way the TV's decoder defaults them. */
export function normalizeRecord(
  v: RequestProgressRecord,
): RequestProgressRecord {
  return { ...v, seasons: v.seasons ?? [], stale: v.stale === true };
}

const sortedUnique = (ns: number[]) =>
  [...new Set(ns)].sort((a, b) => a - b).join(",");

/** The live record belongs to this canonical request: id, TMDB id, type, quality and seasons. */
export function matchesRow(
  record: RequestProgressRecord,
  request: OwnRequest,
): boolean {
  if (record.requestId !== request.id) return false;
  if (record.mediaType !== request.type) return false;
  if (record.tmdbId !== request.media?.tmdbId) return false;
  if (record.is4k !== (request.is4k === true)) return false;
  if (record.mediaType !== "tv") return true;
  const requested = (request.seasons ?? [])
    .map((s) => s?.seasonNumber)
    .filter((n): n is number => typeof n === "number");
  return (
    sortedUnique(record.seasons.map((s) => s.n)) === sortedUnique(requested)
  );
}

/** 0..1 while downloading or unpacking, else undefined. */
export function recordFraction(
  record: RequestProgressRecord,
): number | undefined {
  const p = record.stageProgress;
  return isNum(p) &&
    p >= 0 &&
    p <= 1 &&
    (record.stage === "downloading" || record.stage === "unpacking")
    ? p
    : undefined;
}

/** The stage name without the percentage (the TV's `stageLabel`). */
export function recordStageLabel(record: RequestProgressRecord): Text {
  switch (record.stage) {
    case "pending_approval":
      return { key: "request_status.status.waiting_for_approval" };
    case "approved":
      return { key: "request_status.status.request_accepted" };
    case "waiting":
      return {
        key:
          record.detail === "not_released_yet"
            ? "request_status.status.waiting_for_release"
            : "request_status.status.waiting_for_download",
      };
    case "searching":
      return { key: "request_status.status.searching" };
    case "queued":
      return { key: "request_status.status.queued" };
    case "downloading":
      return { key: "request_status.status.downloading" };
    case "checking":
      return { key: "request_status.status.checking_download" };
    case "unpacking":
      return { key: "request_status.status.unpacking" };
    case "importing":
      return { key: "request_status.status.importing" };
    case "adding_to_library":
      return { key: "request_status.status.adding_to_library" };
    case "confirming_availability":
    case "ready":
      return { key: "request_status.status.finishing_up" };
    case "paused":
      return { key: "request_status.status.paused" };
    default:
      return { key: "request_status.status.checking_request_status" };
  }
}
