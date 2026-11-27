import {
  MediaRequestStatus,
  MediaStatus,
} from "@/utils/jellyseerr/server/constants/media";

/** A season as the request sheets show it: number, episode count and Seerr status. */
export interface RequestSeason {
  seasonNumber: number;
  episodeCount: number;
  status: MediaStatus;
}

/** The parts of a Seerr series the season picker reads. */
export interface RequestSeasonsSource {
  seasons?: { seasonNumber: number; episodeCount: number }[];
  mediaInfo?: {
    seasons?: { seasonNumber: number; status: MediaStatus }[];
    requests?: {
      is4k?: boolean;
      seasons?: { seasonNumber: number; status: MediaRequestStatus }[];
    }[];
  };
}

/**
 * A season's request status (a `MediaRequestStatus`) in `MediaStatus` terms, as the TV app reads
 * it: pending stays pending, approved is processing; declined, failed and completed ones (the
 * season's own status says the rest) can be requested again. The two enums overlap in value
 * (request PENDING = 1 = media UNKNOWN), so they must not be mixed.
 */
const fromRequestStatus = (status: MediaRequestStatus): MediaStatus => {
  switch (status) {
    case MediaRequestStatus.PENDING:
      return MediaStatus.PENDING;
    case MediaRequestStatus.APPROVED:
      return MediaStatus.PROCESSING;
    default:
      return MediaStatus.UNKNOWN;
  }
};

/**
 * The series' seasons for the request sheets, specials (season 0) left out, in season order.
 * A season's status is its WeaselPlex status (available, partial, processing…) when it has one,
 * otherwise what the HD requests that include it say (pending, approved).
 */
export function requestSeasonsFor(
  tv: RequestSeasonsSource | undefined | null,
): RequestSeason[] {
  if (!tv?.seasons) return [];
  const media = tv.mediaInfo?.seasons ?? [];
  const requested = (tv.mediaInfo?.requests ?? [])
    .filter((r) => r.is4k !== true)
    .flatMap((r) => r.seasons ?? []);
  return tv.seasons
    .filter((s) => s.seasonNumber !== 0)
    .map((s) => {
      const mediaStatus = media.find(
        (m) => m.seasonNumber === s.seasonNumber,
      )?.status;
      let status: MediaStatus =
        mediaStatus !== undefined && mediaStatus !== MediaStatus.DELETED
          ? mediaStatus
          : MediaStatus.UNKNOWN;
      if (status === MediaStatus.UNKNOWN) {
        for (const r of requested) {
          if (r.seasonNumber !== s.seasonNumber) continue;
          const fromRequest = fromRequestStatus(r.status);
          if (fromRequest > status) status = fromRequest;
        }
      }
      return {
        seasonNumber: s.seasonNumber,
        episodeCount: s.episodeCount,
        status,
      };
    })
    .sort((a, b) => a.seasonNumber - b.seasonNumber);
}

/** Only seasons with no WeaselPlex status and no live request can be ticked. */
export const isSeasonPickable = (season: RequestSeason): boolean =>
  season.status === MediaStatus.UNKNOWN;

export const pickableSeasonNumbers = (seasons: RequestSeason[]): number[] =>
  seasons.filter(isSeasonPickable).map((s) => s.seasonNumber);

/**
 * What the picker opens with: "all" (Request all) ticks every pickable season, a season number
 * (that season's Request badge) ticks just that one, and "none" (the show's Request button)
 * ticks nothing, as the TV does, unless only one season can be picked.
 */
export type SeasonPickerStart = "none" | "all" | number;

export function initialSeasonSelection(
  seasons: RequestSeason[],
  start: SeasonPickerStart,
): number[] {
  const pickable = pickableSeasonNumbers(seasons);
  if (start === "all") return pickable;
  if (start === "none") return pickable.length === 1 ? pickable : [];
  return pickable.includes(start) ? [start] : [];
}

/** Ticks or unticks one season; the result stays in season order. */
export function toggleSeasonSelection(
  selected: number[],
  seasonNumber: number,
): number[] {
  return selected.includes(seasonNumber)
    ? selected.filter((n) => n !== seasonNumber)
    : [...selected, seasonNumber].sort((a, b) => a - b);
}

/** True when there is something to pick and every pickable season is ticked. */
export function allSeasonsSelected(
  seasons: RequestSeason[],
  selected: number[],
): boolean {
  const pickable = pickableSeasonNumbers(seasons);
  return pickable.length > 0 && pickable.every((n) => selected.includes(n));
}

/** Select all: ticks every pickable season, or unticks them all when they are all ticked. */
export function toggleAllSeasons(
  seasons: RequestSeason[],
  selected: number[],
): number[] {
  return allSeasonsSelected(seasons, selected)
    ? []
    : pickableSeasonNumbers(seasons);
}
