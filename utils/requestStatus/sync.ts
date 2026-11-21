/**
 * Reading the member's own requests from the request server. Port of `sync` (:400-605),
 * `refreshRequest` (:353-398) and `libraryItemId` (:775-806) in the TV's
 * `services/RequestStatusRepository.kt`. The network is injected; `isCurrent()` is checked after
 * every await so a result for a previous member or session is never returned.
 *
 * Rules, as on the TV: pages of 50 up to 1,000 own requests; show season availability comes from
 * the request detail (one read per show, four at a time; an unchanged ready show reuses its
 * seasons); a row whose read failed keeps its last-known stage, marked not fresh; a request missing
 * from a complete list is removed only after two detail 404s on separate complete syncs.
 */
import {
  checkingStage,
  deriveRequestStage,
  libraryItemIdFor,
  seasonStatusUnknownStage,
} from "./stage";
import type { OwnRequest, RequestMediaInfo, RequestStatusItem } from "./types";

export interface RequestPage {
  results?: OwnRequest[] | null;
  pageInfo?: { page?: number | null; pages?: number | null } | null;
}

export interface RequestReadApi {
  /** `GET /api/v1/request?take&skip&filter=all&sort=added&requestedBy`. */
  listOwn(params: {
    take: number;
    skip: number;
    requestedBy: number;
  }): Promise<RequestPage>;
  /** `GET /api/v1/request/{id}`. */
  detail(id: number): Promise<OwnRequest>;
}

export interface TitleReadApi {
  /** `GET /api/v1/movie/{tmdbId}`. */
  movie(
    tmdbId: number,
  ): Promise<{ id?: number; mediaInfo?: RequestMediaInfo | null }>;
  /** `GET /api/v1/tv/{tmdbId}`. */
  tv(
    tmdbId: number,
  ): Promise<{ id?: number; mediaInfo?: RequestMediaInfo | null }>;
}

export const PAGE_SIZE = 50;
export const MAX_ROWS = 1000;
export const DETAIL_CONCURRENCY = 4;

/** The HTTP status of a failed request (axios or fetch-style error), if any. */
export function httpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as { response?: { status?: unknown }; status?: unknown };
  const s = e.response?.status ?? e.status;
  return typeof s === "number" ? s : undefined;
}

export type SyncError = "limited_history" | "season_statuses" | null;

export interface SyncInput {
  seerrUserId: number;
  /** The rows the member currently sees (last sync). */
  previous: readonly RequestStatusItem[];
  /** Ids the journal still tracks (baselined, and pending updates). */
  trackedIds: Iterable<number>;
  /** Ids with a download seen before (journal `downloadObserved`). */
  downloadObserved: ReadonlySet<number>;
  /** Detail 404s per missing request, from earlier complete syncs. */
  missing: ReadonlyMap<number, number>;
  isCurrent(): boolean;
  nowMs?: number;
  today?: string;
}

export type SyncResult =
  | { kind: "superseded" }
  | {
      kind: "ok";
      /** Newest update first. */
      items: RequestStatusItem[];
      complete: boolean;
      /** Complete and every show's seasons refreshed (the empty state may show). */
      syncComplete: boolean;
      confirmedGone: Set<number>;
      missing: Map<number, number>;
      error: SyncError;
    };

async function mapLimit<T, R>(
  values: readonly T[],
  limit: number,
  run: (value: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(values.length);
  let next = 0;
  const worker = async () => {
    while (next < values.length) {
      const i = next++;
      out[i] = await run(values[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, worker),
  );
  return out;
}

const showKey = (r: OwnRequest) => r.media?.tmdbId ?? -r.id;

const byUpdatedDesc = (a: RequestStatusItem, b: RequestStatusItem) => {
  const x = a.request.updatedAt ?? "";
  const y = b.request.updatedAt ?? "";
  return x < y ? 1 : x > y ? -1 : 0;
};

/** Sort as the TV publishes rows: newest `updatedAt` first (stable). */
export const sortItems = (items: RequestStatusItem[]): RequestStatusItem[] =>
  [...items].sort(byUpdatedDesc);

/**
 * One full sync. Throws when the request list itself cannot be read (the caller keeps the last
 * rows, shows "Requests unavailable" and decides about a session probe from `httpStatus`).
 */
export async function syncOwnRequests(
  api: RequestReadApi,
  input: SyncInput,
): Promise<SyncResult> {
  const me = input.seerrUserId;
  const derive = (request: OwnRequest, prior: RequestStatusItem | undefined) =>
    deriveRequestStage(request, {
      futureRelease: prior?.availabilityDate,
      downloadObserved:
        input.downloadObserved.has(request.id) ||
        prior?.stage.downloadObserved === true,
      nowMs: input.nowMs,
      today: input.today,
    });

  const rows = new Map<number, OwnRequest>();
  let skip = 0;
  let complete = false;
  while (skip < MAX_ROWS) {
    const page = await api.listOwn({ take: PAGE_SIZE, skip, requestedBy: me });
    if (!input.isCurrent()) return { kind: "superseded" };
    const results = page.results ?? [];
    for (const r of results) if (r?.requestedBy?.id === me) rows.set(r.id, r);
    skip += results.length;
    const info = page.pageInfo;
    if (
      (info?.page != null && info.pages != null && info.page >= info.pages) ||
      results.length === 0 ||
      results.length < PAGE_SIZE
    ) {
      complete = true;
      break;
    }
  }

  const old = new Map(input.previous.map((i) => [i.request.id, i]));
  const detailFailures = new Set<number>();
  const groups = new Map<number, OwnRequest[]>();
  for (const r of rows.values()) {
    if (r.type !== "tv") continue;
    const k = showKey(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const hydrated = await mapLimit(
    [...groups.entries()],
    DETAIL_CONCURRENCY,
    async ([k, group]) => {
      const first = group[0];
      const unchanged = group.every((row) => {
        const prior = old.get(row.id);
        return (
          !!prior &&
          prior.fresh &&
          prior.stage.kind === "READY" &&
          prior.request.updatedAt === row.updatedAt &&
          prior.request.media?.updatedAt === row.media?.updatedAt &&
          prior.request.media?.status === row.media?.status &&
          prior.request.media?.status4k === row.media?.status4k &&
          prior.request.media?.seasons != null
        );
      });
      if (unchanged)
        return [k, old.get(first.id)?.request.media?.seasons ?? null] as const;
      try {
        const detail = await api.detail(first.id);
        if (detail?.requestedBy?.id !== me) return [k, null] as const;
        return [k, detail.media?.seasons ?? null] as const;
      } catch {
        return [k, null] as const;
      }
    },
  );
  if (!input.isCurrent()) return { kind: "superseded" };
  const seasonsByShow = new Map(hydrated);

  const items: RequestStatusItem[] = [];
  for (const row of rows.values()) {
    const prior = old.get(row.id);
    let request = row;
    if (row.type === "tv") {
      const seasons = seasonsByShow.get(showKey(row)) ?? null;
      if (seasons == null) {
        detailFailures.add(row.id);
        request = row.media
          ? {
              ...row,
              media: { ...row.media, seasons: prior?.request.media?.seasons },
            }
          : row;
      } else {
        request = row.media
          ? { ...row, media: { ...row.media, seasons } }
          : row;
      }
    }
    const fresh = !detailFailures.has(row.id);
    items.push({
      request,
      stage: fresh
        ? derive(request, prior)
        : (prior?.stage ?? seasonStatusUnknownStage()),
      fresh,
      metadata: prior?.metadata ?? null,
      availabilityDate: prior?.availabilityDate ?? null,
    });
  }

  const missing = new Map(input.missing);
  const confirmedGone = new Set<number>();
  const tracked = new Set<number>([...old.keys(), ...input.trackedIds]);
  for (const id of tracked) {
    if (rows.has(id)) {
      missing.delete(id);
      continue;
    }
    const prior = old.get(id);
    if (!complete) {
      if (prior) items.push({ ...prior, fresh: false });
      continue;
    }
    try {
      const detail = await api.detail(id);
      if (!input.isCurrent()) return { kind: "superseded" };
      if (detail?.requestedBy?.id === me) {
        const fresh = detail.type !== "tv" || detail.media?.seasons != null;
        if (!fresh) detailFailures.add(id);
        items.push({
          request: detail,
          stage: fresh
            ? derive(detail, prior)
            : (prior?.stage ?? checkingStage()),
          fresh,
          metadata: prior?.metadata ?? null,
          availabilityDate: prior?.availabilityDate ?? null,
        });
        missing.delete(id);
      }
    } catch (error) {
      if (!input.isCurrent()) return { kind: "superseded" };
      const count = httpStatus(error) === 404 ? (missing.get(id) ?? 0) + 1 : 0;
      missing.set(id, count);
      if (count < 2 && prior) items.push({ ...prior, fresh: false });
      else if (count >= 2) confirmedGone.add(id);
    }
  }
  if (!input.isCurrent()) return { kind: "superseded" };

  return {
    kind: "ok",
    items: sortItems(items),
    complete,
    syncComplete: complete && detailFailures.size === 0,
    confirmedGone,
    missing,
    error: !complete
      ? "limited_history"
      : detailFailures.size > 0
        ? "season_statuses"
        : null,
  };
}

export const SYNC_ERROR_TEXT: Record<Exclude<SyncError, null>, string> = {
  limited_history: "request_status.error.limited_history",
  season_statuses: "request_status.error.season_statuses",
};

export type RefreshResult =
  /** Replace the row with this one (then fold the journal with no removals). */
  | { kind: "refreshed"; item: RequestStatusItem }
  /** Hand over to a full sync (unknown row, ownership mismatch, or a 404). */
  | { kind: "full_sync" }
  /** Keep the row as it is (incomplete season evidence, or another failure). */
  | { kind: "keep" }
  /** A 401/403: the caller decides about the shared session probe. */
  | { kind: "auth"; status: number }
  | { kind: "superseded" };

/**
 * Re-read one request after a live record disagreed with its row. Progress records carry no
 * library ids or ownership, so only this request is verified.
 */
export async function refreshOneRequest(
  api: Pick<RequestReadApi, "detail">,
  input: {
    id: number;
    prior: RequestStatusItem | undefined;
    journalInitialized: boolean;
    seerrUserId: number;
    downloadObserved: boolean;
    isCurrent(): boolean;
    nowMs?: number;
    today?: string;
  },
): Promise<RefreshResult> {
  const { id, prior } = input;
  if (!prior || !input.journalInitialized) return { kind: "full_sync" };
  try {
    const detail = await api.detail(id);
    if (!input.isCurrent()) return { kind: "superseded" };
    if (
      detail?.id !== id ||
      detail.requestedBy?.id !== input.seerrUserId ||
      detail.type !== prior.request.type ||
      detail.media?.tmdbId !== prior.request.media?.tmdbId ||
      (detail.is4k === true) !== (prior.request.is4k === true)
    )
      return { kind: "full_sync" };
    // Incomplete season evidence cannot replace a good row or produce a ready event.
    if (detail.type === "tv" && detail.media?.seasons == null)
      return { kind: "keep" };
    if (detail.media?.tmdbId == null) return { kind: "keep" };
    return {
      kind: "refreshed",
      item: {
        request: detail,
        stage: deriveRequestStage(detail, {
          futureRelease: prior.availabilityDate,
          downloadObserved:
            prior.stage.downloadObserved || input.downloadObserved,
          nowMs: input.nowMs,
          today: input.today,
        }),
        fresh: true,
        metadata: prior.metadata ?? null,
        availabilityDate: prior.availabilityDate ?? null,
      },
    };
  } catch (error) {
    if (!input.isCurrent()) return { kind: "superseded" };
    const status = httpStatus(error);
    if (status === 404) return { kind: "full_sync" };
    if (status === 401 || status === 403) return { kind: "auth", status };
    return { kind: "keep" };
  }
}

/** Replace one row and keep the TV's order. */
export function replaceItem(
  items: readonly RequestStatusItem[],
  next: RequestStatusItem,
): RequestStatusItem[] {
  return sortItems(
    items.map((i) => (i.request.id === next.request.id ? next : i)),
  );
}

/**
 * The quality-exact library id for Watch now: the row's own, else one read of the title. The
 * caller rechecks the scope and the row (same owner, TMDB id, type and quality) afterwards.
 */
export async function lookupLibraryItemId(
  api: TitleReadApi,
  request: OwnRequest,
): Promise<string | null> {
  const is4k = request.is4k === true;
  const own = libraryItemIdFor(request.media, is4k);
  if (own) return own;
  const tmdb = request.media?.tmdbId;
  if (tmdb == null) return null;
  const details =
    request.type === "tv" ? await api.tv(tmdb) : await api.movie(tmdb);
  if (details?.id !== tmdb) return null;
  return libraryItemIdFor(details.mediaInfo, is4k);
}
