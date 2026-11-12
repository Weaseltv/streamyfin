import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

type EpisodeNumber = Pick<
  BaseItemDto,
  "IndexNumber" | "IndexNumberEnd" | "ParentIndexNumber"
>;

/** A combined episode is still one item/file, covering an inclusive range. */
export function getEpisodeNumberRange(item: EpisodeNumber) {
  const start = item.IndexNumber;
  if (start == null || !Number.isInteger(start)) return null;
  const end = item.IndexNumberEnd;
  return {
    start,
    end: end != null && Number.isInteger(end) && end > start ? end : start,
  };
}

/** Keep each surface's existing season separator, padding and missing-number label. */
export function formatEpisodeNumber(
  item: EpisodeNumber,
  {
    includeSeason = false,
    seasonSeparator = ":",
    padLength = 0,
    fallback = "?",
    rangeSeparator = "-",
  }: {
    includeSeason?: boolean;
    seasonSeparator?: string;
    padLength?: number;
    fallback?: string;
    rangeSeparator?: string;
  } = {},
): string {
  const number = (value: number | null | undefined) =>
    value == null ? fallback : String(value).padStart(padLength, "0");
  const range = getEpisodeNumberRange(item);
  const episode = range
    ? `${number(range.start)}${range.end > range.start ? `${rangeSeparator}${number(range.end)}` : ""}`
    : fallback;
  return includeSeason
    ? `S${number(item.ParentIndexNumber)}${seasonSeparator}E${episode}`
    : episode;
}

/** Count episode numbers, merging overlapping ranges within each series/season. */
export function countEpisodes(
  items: readonly BaseItemDto[] | undefined,
): number {
  const seasons = new Map<string, { start: number; end: number }[]>();
  let count = 0;
  for (const item of items ?? []) {
    const range = getEpisodeNumberRange(item);
    if (!range) {
      count += 1;
      continue;
    }
    const key = JSON.stringify([
      item.SeriesId ?? "",
      item.ParentIndexNumber ?? item.SeasonId ?? "",
    ]);
    const ranges = seasons.get(key) ?? [];
    ranges.push(range);
    seasons.set(key, ranges);
  }
  for (const ranges of seasons.values()) {
    ranges.sort((a, b) => a.start - b.start);
    let coveredEnd = -Infinity;
    for (const { start, end } of ranges) {
      count += Math.max(0, end - Math.max(start, coveredEnd + 1) + 1);
      coveredEnd = Math.max(coveredEnd, end);
    }
  }
  return count;
}

/** Use the server/download order and item ID; episode numbers are not offsets. */
export function getAdjacentEpisode(
  items: readonly BaseItemDto[] | null | undefined,
  currentId: string | null | undefined,
  direction: "next" | "previous",
): BaseItemDto | null {
  if (!items || !currentId) return null;
  const index = items.findIndex((item) => item.Id === currentId);
  if (index < 0) return null;
  const candidate = items[index + (direction === "next" ? 1 : -1)];
  return candidate &&
    candidate.Id !== currentId &&
    candidate.LocationType !== "Virtual"
    ? candidate
    : null;
}
