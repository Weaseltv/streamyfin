/**
 * Port of the TV's `services/RequestStage.kt` (Wholphin d6990c35): the canonical stage of a
 * request, its event key and presentation key, and the quality-exact library id.
 *
 * Phase 0 contract, as on the TV: no search or failure is inferred from an empty or incomplete
 * download queue. `docs/request-notifications/request-stages.fixture.json` (copied unchanged
 * from the TV) locks the stages and keys.
 */
import type {
  OwnRequest,
  RequestFailure,
  RequestStage,
  RequestStageKind,
  RequestStatusItem,
  Text,
} from "./types";

const text = (key: string, params?: Text["params"]): Text =>
  params ? { key, params } : { key };

function stage(
  kind: RequestStageKind,
  label: Text,
  extra: Partial<Omit<RequestStage, "kind" | "label">> = {},
): RequestStage {
  return {
    kind,
    label,
    signature: "-",
    notify: true,
    downloadObserved: false,
    ...extra,
  };
}

export const isReadyStage = (s: RequestStage): boolean =>
  s.kind === "READY" || s.kind === "PARTIAL";

export const isTerminalStage = (s: RequestStage): boolean =>
  s.kind === "READY" || s.kind === "FAILED";

/** "YYYY-MM-DD" for the device's local calendar day. */
export function localDay(nowMs: number): string {
  const d = new Date(nowMs);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);

/** Epoch ms of an ISO-8601 instant, or undefined. */
export function parseInstant(value: unknown): number | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

export interface DeriveOptions {
  /** Local calendar date "YYYY-MM-DD" a movie is released, when known. */
  futureRelease?: string | null;
  /** A download was seen for this request before (journal `downloadObserved`). */
  downloadObserved?: boolean;
  nowMs?: number;
  /** Local calendar date "YYYY-MM-DD" today; defaults to the device's. */
  today?: string;
}

/** The TV's `deriveRequestStage`. */
export function deriveRequestStage(
  request: OwnRequest,
  options: DeriveOptions = {},
): RequestStage {
  const nowMs = options.nowMs ?? Date.now();
  const today = options.today ?? localDay(nowMs);
  const downloadObserved = options.downloadObserved === true;
  const media = request.media;
  const is4k = request.is4k === true;
  const status = is4k ? media?.status4k : media?.status;

  if (
    request.status === 3 ||
    request.status === 4 ||
    status === 6 ||
    status === 7
  ) {
    const failure: RequestFailure =
      request.status === 3
        ? "declined"
        : status === 6 || status === 7
          ? "unavailable"
          : "failed";
    return stage(
      "FAILED",
      text(
        failure === "declined"
          ? "request_status.status.request_declined"
          : failure === "unavailable"
            ? "request_status.status.not_available"
            : "request_status.status.couldnt_be_added",
      ),
      {
        failure,
        notify:
          request.status === 3 ||
          request.status === 4 ||
          (request.status !== 5 && status === 6),
      },
    );
  }

  const seasons = [
    ...new Set(
      (request.seasons ?? [])
        .map((s) => s?.seasonNumber)
        .filter((n): n is number => typeof n === "number"),
    ),
  ];
  const availability = new Map<number, number | null | undefined>();
  for (const s of media?.seasons ?? []) {
    availability.set(s.seasonNumber, is4k ? s.status4k : s.status);
  }

  if (
    (request.type === "movie" && status === 5) ||
    (request.type === "tv" &&
      seasons.length > 0 &&
      seasons.every((n) => availability.get(n) === 5))
  ) {
    return stage("READY", text("request_status.status.ready_to_watch"));
  }

  const partial =
    request.type === "tv" &&
    seasons.length > 0 &&
    seasons.some((n) => {
      const a = availability.get(n);
      return a === 4 || a === 5;
    });
  if (request.status === 1 && !partial) {
    return stage(
      "WAITING_APPROVAL",
      text("request_status.status.waiting_for_approval"),
    );
  }
  if (request.type === "tv" && seasons.length === 0) {
    return stage("CHECKING", text("request_status.status.checking"));
  }

  const remaining = partial
    ? seasons.filter((n) => availability.get(n) !== 5)
    : seasons;
  const queue = (
    (is4k ? media?.downloadStatus4k : media?.downloadStatus) ?? []
  ).filter((row) => {
    const season = row?.episode?.seasonNumber;
    return (
      request.type !== "tv" || season == null || remaining.includes(season)
    );
  });
  const active = queue.filter((row) => {
    const s = row.status?.toLowerCase();
    if (s !== "downloading" && s !== "queued") return false;
    const size = row.size;
    const left = row.sizeLeft;
    return (
      finite(size) && size > 0 && finite(left) && left >= 0 && left <= size
    );
  });
  const activeSize = active.reduce((n, r) => n + (r.size as number), 0);
  const activeLeft = active.reduce((n, r) => n + (r.sizeLeft as number), 0);

  let rest: RequestStage;
  if (request.status === 1) {
    rest = stage(
      "WAITING_APPROVAL",
      text("request_status.status.waiting_for_approval"),
    );
  } else if (
    queue.length > 0 &&
    queue.every((r) => r.status?.toLowerCase() === "completed")
  ) {
    rest = stage("ADDING", text("request_status.status.adding_to_library"), {
      downloadObserved: true,
    });
  } else if (
    active.length > 0 &&
    Number.isFinite(activeSize) &&
    activeSize > 0 &&
    Number.isFinite(activeLeft)
  ) {
    const progress = Math.min(1, Math.max(0, 1 - activeLeft / activeSize));
    // Shows intentionally have no time estimate, including this fallback (owner policy).
    let eta: number | undefined;
    if (request.type === "movie") {
      for (const row of active) {
        const at = parseInstant(row.estimatedCompletionTime);
        if (at !== undefined && at > nowMs && (eta === undefined || at > eta))
          eta = at;
      }
    }
    rest = stage(
      "DOWNLOADING",
      text("request_status.status.downloading_percent", {
        percent: percentOf(progress),
      }),
      { progress, eta, downloadObserved: true },
    );
  } else if (queue.length > 0) {
    rest = stage("CHECKING", text("request_status.status.checking"));
  } else if (
    request.type === "movie" &&
    typeof options.futureRelease === "string" &&
    ISO_DAY.test(options.futureRelease) &&
    options.futureRelease > today
  ) {
    rest = stage(
      "UNRELEASED",
      text("request_status.status.not_out_yet", {
        date: options.futureRelease,
      }),
    );
  } else if (
    (request.status === 2 || request.status === 5) &&
    downloadObserved
  ) {
    rest = stage("CHECKING", text("request_status.status.checking_library"), {
      detail: text("request_status.detail.progress_no_longer_reported"),
      downloadObserved: true,
    });
  } else if (request.status === 2 || request.status === 5) {
    rest = stage(
      "WAITING_LIBRARY",
      text("request_status.status.request_accepted"),
      { detail: text("request_status.detail.no_progress_yet") },
    );
  } else {
    rest = stage("CHECKING", text("request_status.status.checking"));
  }

  if (!partial) return rest;
  return stage("PARTIAL", text("request_status.status.some_episodes_ready"), {
    progress: rest.progress,
    eta: rest.eta,
    signature: [...seasons]
      .sort((a, b) => a - b)
      .flatMap((n) => {
        const a = availability.get(n);
        return a === 5 ? [`${n}:A`] : a === 4 ? [`${n}:P`] : [];
      })
      .join(","),
    detail: rest.label,
    downloadObserved: rest.downloadObserved,
  });
}

/** Whole percent, truncated as the TV's `(progress * 100).toInt()`. */
export function percentOf(fraction: number): number {
  return Math.floor(fraction * 100 + 1e-9);
}

/** The plain "Checking" stage. */
export const checkingStage = (): RequestStage =>
  stage("CHECKING", text("request_status.status.checking"));

/** The stage the sync keeps for a new show row whose season status could not be refreshed. */
export const seasonStatusUnknownStage = (): RequestStage => ({
  ...checkingStage(),
  detail: text("request_status.detail.season_status_not_refreshed"),
});

/** The TV's `RequestStatusItem.eventKey()`: `v1|requestId|hd-or-4k|kind|signature`. */
export function eventKey(
  request: Pick<OwnRequest, "id" | "is4k">,
  s: RequestStage,
): string | null {
  if (!s.notify) return null;
  const kind =
    s.kind === "READY"
      ? "ready"
      : s.kind === "PARTIAL"
        ? "partial"
        : s.kind === "FAILED"
          ? "failed"
          : null;
  if (!kind) return null;
  return `v1|${request.id}|${request.is4k === true ? "4k" : "hd"}|${kind}|${s.signature}`;
}

export const itemEventKey = (item: RequestStatusItem): string | null =>
  eventKey(item.request, item.stage);

/**
 * Season signatures can change without a new milestone for the member: partial keys share one
 * presentation key per request and quality. Any other key is its own presentation key.
 */
export function presentationKey(key: string): string {
  const parts = splitLimit(key, "|", 5);
  return parts.length === 5 && parts[0] === "v1" && parts[3] === "partial"
    ? parts.slice(0, 4).join("|")
    : key;
}

/** Kotlin's `split(sep, limit)`: at most `limit` parts, the last keeps the rest. */
function splitLimit(value: string, sep: string, limit: number): string[] {
  const parts: string[] = [];
  let rest = value;
  while (parts.length < limit - 1) {
    const at = rest.indexOf(sep);
    if (at < 0) break;
    parts.push(rest.slice(0, at));
    rest = rest.slice(at + sep.length);
  }
  parts.push(rest);
  return parts;
}

const JELLYFIN_ID =
  /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;

/** The library id for the request's own quality (4K requests never open the HD copy). */
export const libraryItemId = (request: OwnRequest): string | null =>
  libraryItemIdFor(request.media, request.is4k === true);

/** The same check for a title read separately (title page, Watch now lookup). */
export function libraryItemIdFor(
  media:
    | { jellyfinMediaId?: string | null; jellyfinMediaId4k?: string | null }
    | null
    | undefined,
  is4k: boolean,
): string | null {
  const id = is4k ? media?.jellyfinMediaId4k : media?.jellyfinMediaId;
  return typeof id === "string" && JELLYFIN_ID.test(id) ? id : null;
}

/** Epoch ms the request was made, or undefined. */
export const requestedAtMs = (request: OwnRequest): number | undefined =>
  parseInstant(request.createdAt);
