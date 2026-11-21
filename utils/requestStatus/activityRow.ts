/**
 * What one queue row shows, from the canonical row and its live record. Port of `activityRow`
 * (:359-481), `airingRow` (:316-357), `liveProgress` (:230-233), `partlyWatchable` (:235-236)
 * and the section order (:621-627) in the TV's `ui/discover/SeerrRequestsPage.kt`.
 * First match wins, as on the TV.
 */
import {
  isInstant,
  matchesRow,
  recordFraction,
  recordStageLabel,
} from "./progressRecord";
import { isTerminalStage, parseInstant, requestedAtMs } from "./stage";
import type {
  ProgressEpisodes,
  RequestProgressRecord,
  RequestStatusItem,
  Text,
} from "./types";

export type ActivitySection = "ACTIVE" | "WAITING" | "READY";

/** Page order of the three sections. */
export const ACTIVITY_SECTIONS: readonly ActivitySection[] = [
  "ACTIVE",
  "WAITING",
  "READY",
];

export const SECTION_LABEL: Record<ActivitySection, string> = {
  ACTIVE: "request_status.section.active",
  WAITING: "request_status.section.waiting",
  READY: "request_status.section.ready",
};

export type ActivityProgress =
  /** Bar plus percentage, in the title's type colour. */
  | { kind: "bar"; fraction: number }
  /** Plain text, such as "6 / 6 imported" or "Requested Nov 3". */
  | { kind: "note"; text: Text; emphasized: boolean }
  /** Nothing to report yet: a dash. */
  | { kind: "none" };

export interface ActivityRowView {
  item: RequestStatusItem;
  section: ActivitySection;
  status: Text;
  /** Without the "Last known status" suffix; see `stale`. */
  detail: Text | null;
  /** The row's data is last known: the canonical read failed or the live record is stale. */
  stale: boolean;
  progress: ActivityProgress;
  /** Shows Watch now (filled for Ready, outlined for partly ready). */
  watchable: boolean;
}

/** Dates and times, formatted for the device (see `format.ts`). */
export interface RowFormat {
  /** The day a request was made: "Nov 3", or "Nov 3, 2025" in another year. */
  requestedOn(ms: number, nowMs: number): string;
  /** A local calendar date "YYYY-MM-DD": "Nov 3", or "Nov 3, 2027" in another year. */
  releaseOn(day: string, nowMs: number): string;
  /** An episode's air time: "Sun, Nov 8 · 7:00 PM" (with the year when not this year). */
  airingAt(ms: number, nowMs: number): string;
}

const t = (key: string, params?: Text["params"]): Text =>
  params ? { key, params } : { key };

/**
 * The live record used for a canonical row: only for an own row whose canonical stage is not
 * terminal, and only when the record matches it (id, TMDB id, type, quality, seasons).
 */
export function liveRecordFor(
  item: RequestStatusItem,
  records: ReadonlyMap<number, RequestProgressRecord> | null | undefined,
  seerrUserId: number | null | undefined,
): RequestProgressRecord | null {
  const record = records?.get(item.request.id);
  if (!record || seerrUserId == null) return null;
  if (isTerminalStage(item.stage)) return null;
  if (item.request.requestedBy?.id !== seerrUserId) return null;
  return matchesRow(record, item.request) ? record : null;
}

export function partlyWatchable(
  item: RequestStatusItem,
  live: RequestProgressRecord | null,
): boolean {
  return (
    item.request.type === "tv" &&
    (item.stage.kind === "PARTIAL" || live?.availability === "partial")
  );
}

/** "Under a minute remaining" or "N min remaining" (minutes rounded up). */
export function etaText(seconds: number): Text {
  if (seconds < 60) return t("request_status.detail.eta_under_minute");
  return t("request_status.detail.eta_minutes", {
    minutes: Math.floor(seconds / 60) + (seconds % 60 > 0 ? 1 : 0),
  });
}

/**
 * A show part-way through its season with nothing missing: every aired episode imported and the
 * rest not aired yet. Without a schedule, a next air time, or with that time already passed, the
 * row keeps "Some episodes ready".
 */
export function airingRow(
  item: RequestStatusItem,
  live: RequestProgressRecord | null,
  episodes: ProgressEpisodes | null,
  nowMs: number,
  fmt: RowFormat,
): { status: Text; detail: Text; progress: ActivityProgress } | null {
  const schedule = live?.schedule;
  if (!live || !schedule) return null;
  if (
    live.availability !== "partial" ||
    live.stage !== "waiting" ||
    live.detail !== "not_released_yet"
  )
    return null;
  const imported = episodes?.imported;
  const total = episodes?.total;
  if (imported == null || total == null) return null;
  if (imported < total) return null;
  const nextAt = isInstant(schedule.nextAiring)
    ? parseInstant(schedule.nextAiring)
    : undefined;
  if (nextAt === undefined) return null;
  // Once that time has passed the episode has aired; until imported it is missing, not "airing".
  if (nextAt < nowMs) return null;
  const requested = (item.request.seasons ?? [])
    .map((s) => s?.seasonNumber)
    .filter((n): n is number => typeof n === "number");
  const season =
    schedule.next?.season ??
    schedule.seasons.find(
      (s) => isInstant(s.nextAiring) && parseInstant(s.nextAiring) === nextAt,
    )?.n;
  if (season == null || !requested.includes(season)) return null;
  const counts = schedule.seasons.find((s) => s.n === season);
  const date = fmt.airingAt(nextAt, nowMs);
  const progress: ActivityProgress =
    counts &&
    counts.total > 0 &&
    counts.aired >= 0 &&
    counts.aired <= counts.total
      ? {
          kind: "note",
          text: t("request_status.progress.episodes_out", {
            aired: counts.aired,
            total: counts.total,
          }),
          emphasized: true,
        }
      : {
          kind: "note",
          text: t("request_status.progress.imported_count", {
            imported,
            total,
          }),
          emphasized: true,
        };
  return counts?.aired === 0
    ? {
        status: t("request_status.status.season_coming", { season }),
        detail: t("request_status.detail.first_episode", { date }),
        progress,
      }
    : {
        status: t("request_status.status.season_airing", { season }),
        detail: t("request_status.detail.next_episode", { date }),
        progress,
      };
}

export function activityRow(
  item: RequestStatusItem,
  live: RequestProgressRecord | null,
  liveStale: boolean,
  nowMs: number,
  fmt: RowFormat,
): ActivityRowView {
  const stale = !item.fresh || liveStale;
  const view = (
    section: ActivitySection,
    status: Text,
    detail: Text | null,
    progress: ActivityProgress,
    watchable: boolean,
  ): ActivityRowView => ({
    item,
    section,
    status,
    detail,
    stale,
    progress,
    watchable,
  });
  const isTv = item.request.type === "tv";
  const partial = partlyWatchable(item, live);
  const episodes =
    live?.episodes &&
    (live.episodes.total ?? 0) > 0 &&
    live.episodes.imported != null
      ? live.episodes
      : null;

  // The progress service says "ready" when every requested episode is in the library even though
  // the request server still calls the show partial (double episodes never match its count).
  if (item.stage.kind === "READY" || live?.stage === "ready") {
    const at = requestedAtMs(item.request);
    return view(
      "READY",
      t("request_status.status.ready_to_watch"),
      null,
      {
        kind: "note",
        text:
          at !== undefined
            ? t("request_status.progress.requested_on", {
                date: fmt.requestedOn(at, nowMs),
              })
            : t("request_status.progress.requested_recently"),
        emphasized: false,
      },
      true,
    );
  }

  if (partial) {
    const airing = airingRow(item, live, episodes, nowMs, fmt);
    if (airing)
      return view(
        "WAITING",
        airing.status,
        airing.detail,
        airing.progress,
        true,
      );
    const rest =
      live?.stage === "waiting" && live.detail === "not_released_yet"
        ? "request_status.detail.rest_not_out_yet"
        : live?.stage === "waiting"
          ? "request_status.detail.rest_not_available"
          : live?.stage === "downloading"
            ? "request_status.detail.rest_downloading"
            : "request_status.detail.rest_added_automatically";
    return view(
      "WAITING",
      t("request_status.status.some_episodes_ready"),
      t(rest),
      episodes
        ? {
            kind: "note",
            text: t("request_status.progress.imported_count", {
              imported: episodes.imported as number,
              total: episodes.total as number,
            }),
            emphasized: true,
          }
        : { kind: "none" },
      true,
    );
  }

  if (item.stage.kind === "FAILED") {
    const why =
      item.stage.failure === "declined"
        ? "request_status.detail.declined_why"
        : item.stage.failure === "unavailable"
          ? "request_status.detail.unavailable_why"
          : "request_status.detail.failed_why";
    return view("WAITING", item.stage.label, t(why), { kind: "none" }, false);
  }

  if (live?.stage === "waiting") {
    const [status, why] =
      live.detail === "not_released_yet"
        ? [
            "request_status.status.waiting_for_release",
            "request_status.detail.not_released_yet",
          ]
        : live.detail === "no_release_found_yet"
          ? [
              "request_status.status.waiting_for_release",
              "request_status.detail.no_release_found_yet",
            ]
          : [
              "request_status.status.waiting_for_download",
              "request_status.detail.no_download_active",
            ];
    return view("WAITING", t(status), t(why), { kind: "none" }, false);
  }

  if (!live && item.stage.kind === "UNRELEASED") {
    const why = item.availabilityDate
      ? t("request_status.detail.coming_on", {
          date: fmt.releaseOn(item.availabilityDate, nowMs),
        })
      : t("request_status.detail.not_released_yet");
    return view(
      "WAITING",
      t("request_status.status.waiting_for_release"),
      why,
      { kind: "none" },
      false,
    );
  }

  // Everything still moving through the pipeline: accepted, searching, queued, downloading…
  const status: Text = live
    ? recordStageLabel(live)
    : item.stage.kind === "DOWNLOADING"
      ? t("request_status.status.downloading")
      : item.stage.label;
  // Shows never show a time estimate (owner policy); movies show one while downloading.
  let eta: Text | null = null;
  if (!isTv) {
    if (live) {
      const s = live.etaSeconds;
      if (
        typeof s === "number" &&
        s > 0 &&
        live.stage === "downloading" &&
        !liveStale
      )
        eta = etaText(Math.ceil(s));
    } else if (item.stage.eta !== undefined && item.stage.eta > nowMs) {
      eta = etaText(Math.floor((item.stage.eta - nowMs) / 1000));
    }
  }
  let detail: Text | null;
  if (isTv && episodes) {
    detail = t("request_status.detail.episodes_imported", {
      imported: episodes.imported as number,
      total: episodes.total as number,
    });
  } else if (eta) {
    detail = eta;
  } else if (
    live?.stage === "confirming_availability" ||
    live?.stage === "ready"
  ) {
    detail = t("request_status.detail.confirming_ready");
  } else if (live?.detail === "download_failed_retrying") {
    detail = t("request_status.detail.replacement_download");
  } else if (!live) {
    detail = item.stage.detail ?? null;
  } else {
    detail = null;
  }
  const fraction = live ? recordFraction(live) : item.stage.progress;
  return view(
    "ACTIVE",
    status,
    detail,
    fraction !== undefined ? { kind: "bar", fraction } : { kind: "none" },
    false,
  );
}

/**
 * Sections in page order. Active and Waiting keep the canonical order (newest update first);
 * Ready lists the newest request first. A live percentage never moves a row.
 */
export function orderRows(rows: readonly ActivityRowView[]): ActivityRowView[] {
  return ACTIVITY_SECTIONS.flatMap((section) => {
    const inSection = rows.filter((r) => r.section === section);
    if (section !== "READY") return inSection;
    return [...inSection].sort(
      (a, b) =>
        (requestedAtMs(b.item.request) ?? 0) -
        (requestedAtMs(a.item.request) ?? 0),
    );
  });
}

export function sectionCounts(
  rows: readonly ActivityRowView[],
): Record<ActivitySection, number> {
  const counts: Record<ActivitySection, number> = {
    ACTIVE: 0,
    WAITING: 0,
    READY: 0,
  };
  for (const r of rows) counts[r.section] += 1;
  return counts;
}

type Translate = (key: string, params?: Text["params"]) => string;

/** The detail line as shown, with " · Last known status" for stale rows (the TV's `withStale`). */
export function detailLine(
  row: ActivityRowView,
  translate: Translate,
): string | null {
  const base = row.detail ? translate(row.detail.key, row.detail.params) : null;
  if (!row.stale) return base;
  if (base === null)
    return translate("request_status.detail.last_known_status");
  return translate("request_status.detail.with_last_known", { detail: base });
}
