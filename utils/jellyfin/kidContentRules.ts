export interface KidItemFacts {
  id?: string;
  type?: string;
  name?: string;
  officialRating?: string;
  genres?: string[];
  premiereDate?: string;
  productionYear?: number;
  lockedFields?: string[];
  seriesId?: string;
}

const containers = new Set([
  "AggregateFolder",
  "CollectionFolder",
  "UserView",
  "Folder",
  "UserRootFolder",
  "BasePluginFolder",
  "PlaylistsFolder",
  "ManualPlaylistsFolder",
  "Channel",
  "ChannelFolderItem",
  "Person",
  "MusicArtist",
  "Genre",
  "MusicGenre",
  "Studio",
  "Year",
  "Playlist",
]);

const levels = new Map([
  ["G", 0],
  ["TV-Y", 0],
  ["TV-Y7", 0],
  ["TV-Y7-FV", 0],
  ["TV-G", 0],
  ["PG", 1],
  ["TV-PG", 1],
  ["PG-13", 2],
  ["TV-14", 2],
  ["R", 3],
  ["TV-MA", 3],
  ["NC-17", 4],
]);

export function maxKidRatingLevel(ceiling: number): number | undefined {
  if (!Number.isFinite(ceiling)) return undefined;
  if (ceiling >= 18) return 4;
  if (ceiling >= 17) return 3;
  if (ceiling >= 13) return 2;
  if (ceiling >= 10) return 1;
  return 0;
}

export function normalizeKidRating(rating?: string): string | undefined {
  return rating?.trim().toUpperCase().replace(/^US-/, "").trim() || undefined;
}

export function isHorror(name?: string): boolean {
  return name?.toLowerCase().includes("horror") ?? false;
}

export function needsSeries(type?: string): boolean {
  return type === "Season" || type === "Episode";
}

export function utcPremiereDate(value?: string): string | undefined {
  const date = value?.trim();
  if (!date) return undefined;
  // ISO datetimes with an offset are converted to UTC. Jellyfin dates
  // without an offset are already UTC.
  if (/T.*(?:Z|[+-]\d\d:\d\d)$/i.test(date)) {
    const time = Date.parse(date);
    if (Number.isFinite(time)) return new Date(time).toISOString().slice(0, 10);
  }
  const day = date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const time = Date.parse(day);
  if (Number.isFinite(time) && new Date(time).toISOString().startsWith(day)) {
    return day;
  }
}

function eraRuleApplies(item: KidItemFacts): boolean {
  if (
    item.type !== "Movie" ||
    normalizeKidRating(item.officialRating) !== "PG"
  ) {
    return false;
  }
  const premiered = utcPremiereDate(item.premiereDate);
  return premiered
    ? premiered < "1984-07-01"
    : (item.productionYear ?? 1984) <= 1984;
}

export function hasKidFacts(item: KidItemFacts): boolean {
  if (item.type && (containers.has(item.type) || item.type === "BoxSet"))
    return true;
  return (
    item.genres !== undefined &&
    (item.lockedFields !== undefined || !eraRuleApplies(item))
  );
}

function decideTitle(
  item: KidItemFacts,
  maxLevel: number,
  series?: KidItemFacts,
) {
  if (!item.genres && !series?.genres) return "missing-facts";
  if (item.genres?.some(isHorror) || series?.genres?.some(isHorror))
    return "horror";
  const rating =
    normalizeKidRating(item.officialRating) ??
    normalizeKidRating(series?.officialRating);
  let level = rating ? levels.get(rating) : undefined;
  if (level === undefined) return "no-us-rating";
  if (
    eraRuleApplies(item) &&
    !item.lockedFields?.some(
      (field) => field.toLowerCase() === "officialrating",
    )
  ) {
    if (!item.lockedFields) return "missing-facts";
    level = 2;
  }
  return level <= maxLevel ? "show" : "above-max";
}

export function decideKidContent(
  item: KidItemFacts,
  maxLevel: number | undefined,
  series?: KidItemFacts,
) {
  if (item.type === "Genre" || item.type === "MusicGenre") {
    return isHorror(item.name) ? "horror" : "show";
  }
  // The response filter handles box sets by inspecting their children.
  if (item.type && (containers.has(item.type) || item.type === "BoxSet"))
    return "show";
  if (maxLevel === undefined) return "unknown-ceiling";
  if (!needsSeries(item.type)) return decideTitle(item, maxLevel);
  if (!series) return "missing-facts";
  const seriesDecision = decideTitle(series, maxLevel);
  if (seriesDecision !== "show")
    return seriesDecision === "horror" ? "horror" : "series-hidden";
  return decideTitle(item, maxLevel, series);
}
