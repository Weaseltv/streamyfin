/**
 * Request status (TV parity): the shapes the pure modules work on.
 *
 * Reference: the WeaselPlex TV app (Wholphin `weaselfin` d6990c35), `services/RequestStage.kt`,
 * `services/RequestStatusRepository.kt` and `services/RequestProgressRepository.kt`. These are
 * structural types for the request server's JSON, not the server's own classes, so every module
 * here loads under `bun test` without React Native, MMKV or i18next.
 */

/** A translation key under `request_status.*` in `translations/en.json`, with its values. */
export interface Text {
  key: string;
  params?: Record<string, string | number>;
}

/** One row of the request server's download queue for a title. */
export interface RequestQueueRow {
  status?: string | null;
  size?: number | null;
  sizeLeft?: number | null;
  estimatedCompletionTime?: string | null;
  episode?: { seasonNumber?: number | null } | null;
}

export interface RequestSeasonAvailability {
  seasonNumber: number;
  status?: number | null;
  status4k?: number | null;
}

export interface RequestMediaInfo {
  id?: number;
  tmdbId?: number | null;
  mediaType?: string;
  updatedAt?: string | null;
  status?: number | null;
  status4k?: number | null;
  jellyfinMediaId?: string | null;
  jellyfinMediaId4k?: string | null;
  /** Missing on list results: show seasons come from the request detail read. */
  seasons?: RequestSeasonAvailability[] | null;
  downloadStatus?: RequestQueueRow[] | null;
  downloadStatus4k?: RequestQueueRow[] | null;
}

/** A request as the request server returns it (`GET /api/v1/request`, `/request/{id}`). */
export interface OwnRequest {
  id: number;
  /** 1 pending, 2 approved, 3 declined, 4 failed, 5 completed. */
  status: number;
  type: string;
  is4k?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  requestedBy?: { id: number; permissions?: number | null } | null;
  seasons?: { seasonNumber?: number | null }[] | null;
  media?: RequestMediaInfo | null;
}

export type RequestStageKind =
  | "WAITING_APPROVAL"
  | "WAITING_LIBRARY"
  | "DOWNLOADING"
  | "ADDING"
  | "READY"
  | "PARTIAL"
  | "FAILED"
  | "CHECKING"
  | "UNRELEASED";

/** Why a request is FAILED, matching the TV's three labels. */
export type RequestFailure = "declined" | "unavailable" | "failed";

export interface RequestStage {
  kind: RequestStageKind;
  /** The TV's stage label. */
  label: Text;
  /** 0..1 while downloading (canonical bytes fraction). */
  progress?: number;
  /** Epoch ms; movies only. */
  eta?: number;
  /** Season signature for PARTIAL ("1:A,2:P"), otherwise "-". */
  signature: string;
  /** The TV's detail line; for PARTIAL, the label of the stage of the remaining seasons. */
  detail?: Text;
  failure?: RequestFailure;
  /** Whether a terminal stage produces an event key (the TV's `notify`). */
  notify: boolean;
  downloadObserved: boolean;
}

/** Title metadata loaded for a row (poster, title, year). */
export interface RequestTitleMetadata {
  title?: string | null;
  year?: number | null;
  posterPath?: string | null;
}

/** One canonical row: a request, its derived stage and how current it is. */
export interface RequestStatusItem {
  request: OwnRequest;
  stage: RequestStage;
  /** False when the last read could not refresh it (last-known stage kept). */
  fresh: boolean;
  metadata?: RequestTitleMetadata | null;
  /** Local calendar date "YYYY-MM-DD" a movie becomes available, when known. */
  availabilityDate?: string | null;
}

// ---- Live layer (the Unraid progress service) ----

export interface ProgressSeason {
  n: number;
  availability: string;
}

export interface ProgressEpisodes {
  total?: number | null;
  imported?: number | null;
  active?: number | null;
}

export interface ProgressScheduleSeason {
  n: number;
  aired: number;
  total: number;
  imported: number;
  nextAiring?: string | null;
}

export interface ProgressSchedule {
  nextAiring?: string | null;
  next?: { season: number; episode: number } | null;
  seasons: ProgressScheduleSeason[];
}

/** One request's live record, as the progress service sends it. */
export interface RequestProgressRecord {
  requestId: number;
  mediaType: string;
  tmdbId: number;
  is4k: boolean;
  seasons: ProgressSeason[];
  seerrStatus?: number | null;
  availability: string;
  stage: string;
  stageProgress?: number | null;
  bytesLeft?: number | null;
  etaSeconds?: number | null;
  detail?: string | null;
  episodes?: ProgressEpisodes | null;
  schedule?: ProgressSchedule | null;
  stale: boolean;
  staleSince?: string | null;
  observedAt: string;
  updatedAt: string;
}
