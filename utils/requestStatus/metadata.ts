/**
 * Title metadata for a queue row (poster, title, year) and a movie's availability date, read from
 * the request server's title details. Port of `loadMetadata` in the TV's
 * `services/RequestStatusRepository.kt` (:808-880). Pure.
 */

import { deriveRequestStage } from "./stage";
import type { RequestStatusItem, RequestTitleMetadata } from "./types";

interface ReleaseDate {
  type?: number | null;
  release_date?: string | null;
}

/** The fields of the request server's movie or show details this needs. */
export interface TitleDetailsLike {
  id?: number;
  title?: string | null;
  name?: string | null;
  releaseDate?: string | null;
  firstAirDate?: string | null;
  posterPath?: string | null;
  releases?: {
    results?:
      | { iso_3166_1?: string | null; release_dates?: ReleaseDate[] | null }[]
      | null;
  } | null;
}

export interface RowMetadata extends RequestTitleMetadata {
  /** "YYYY-MM-DD" a movie becomes available to watch at home, when known. */
  availabilityDay?: string | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}/;

/**
 * When a movie can be watched at home: the earliest digital (4) or physical (5) release in the
 * device's country, else the US, else the first listed; otherwise its release date.
 */
export function movieAvailabilityDay(
  details: TitleDetailsLike,
  country?: string | null,
): string | null {
  const regions = details.releases?.results ?? [];
  const region =
    regions.find((r) => !!country && r.iso_3166_1 === country) ??
    regions.find((r) => r.iso_3166_1 === "US") ??
    regions[0];
  const days = (region?.release_dates ?? [])
    .filter((d) => d.type === 4 || d.type === 5)
    .map((d) => d.release_date?.slice(0, 10) ?? "")
    .filter((d) => DAY.test(d))
    .sort();
  if (days.length > 0) return days[0];
  const release = details.releaseDate?.slice(0, 10);
  return release && DAY.test(release) ? release : null;
}

export function titleMetadata(
  details: TitleDetailsLike,
  mediaType: string,
  country?: string | null,
): RowMetadata {
  const isMovie = mediaType === "movie";
  const date = isMovie ? details.releaseDate : details.firstAirDate;
  const year = date && DAY.test(date) ? Number(date.slice(0, 4)) : null;
  return {
    title: (isMovie ? details.title : details.name) ?? null,
    year,
    posterPath: details.posterPath ?? null,
    availabilityDay: isMovie ? movieAvailabilityDay(details, country) : null,
  };
}

/**
 * The row with its metadata applied: a fresh movie row is re-derived with its availability date,
 * so an unreleased movie waits as "Waiting for release" (the TV's `loadMetadata`).
 */
export function withMetadata(
  item: RequestStatusItem,
  metadata: RowMetadata | null | undefined,
  options: { downloadObserved: boolean; nowMs?: number; today?: string },
): RequestStatusItem {
  if (!metadata) return item;
  const availabilityDate =
    item.availabilityDate ?? metadata.availabilityDay ?? null;
  const stage =
    item.fresh && availabilityDate !== item.availabilityDate
      ? deriveRequestStage(item.request, {
          futureRelease: availabilityDate,
          downloadObserved:
            options.downloadObserved || item.stage.downloadObserved,
          nowMs: options.nowMs,
          today: options.today,
        })
      : item.stage;
  return { ...item, metadata, availabilityDate, stage };
}
