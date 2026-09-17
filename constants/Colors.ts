import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

/**
 * WeaselTV "Neon Board" palette for WeaselPlex phone.
 *
 * Flat stage, hairline rows, one neon per section. Values are shared with
 * WeaselTV iOS / Android, theweasel.tv and WeaselPlex Android TV. Keep
 * `tailwind.config.js` in step - that file is the source of truth for
 * classNames, this one for anything styled from JS.
 */
export const NeonBoard = {
  stage: "#050608",
  video: "#000000",
  card: "#0B0D12",
  card2: "#11141B",
  inset: "#08090D",
  line: "#1C2029",
  line2: "#2A303B",
  text: "#F2F5F9",
  mid: "#8B95A5",
  low: "#6B7686",
  onAccent: "#050608",
  volt: "#D4F63F",
  green: "#39FF14",
  cyan: "#00F0FF",
  orange: "#FF7A00",
  yellow: "#FFD400",
  red: "#FF3B4E",
  warn: "#F5B93D",
  // Section neons, one per rail item on WeaselPlex Android TV (`Neon.kt`).
  blue: "#5268FF",
  mint: "#00FF8A",
  violet: "#C026FF",
  magenta: "#FF2EF7",
  pink: "#FF2D95",
  azure: "#00A3FF",
  // Phone only: the Library hub tab (the TV rail lists libraries directly).
  indigo: "#8A5CFF",
} as const;

export type NeonAccent =
  | typeof NeonBoard.volt
  | typeof NeonBoard.green
  | typeof NeonBoard.cyan
  | typeof NeonBoard.orange
  | typeof NeonBoard.yellow
  | typeof NeonBoard.red
  | typeof NeonBoard.warn
  | typeof NeonBoard.blue
  | typeof NeonBoard.mint
  | typeof NeonBoard.violet
  | typeof NeonBoard.magenta
  | typeof NeonBoard.pink
  | typeof NeonBoard.azure
  | typeof NeonBoard.indigo;

/** Sections of the app that own a page accent. */
export type NeonSection =
  | "home"
  | "search"
  | "watchlist"
  | "watchlists"
  | "library"
  | "requests"
  | "downloads"
  | "settings"
  | "login"
  | "music"
  | "movies"
  | "tv"
  | "livetv"
  | "guide";

/**
 * Every section owns its neon, shared with the WeaselPlex Android TV rail:
 * Home volt, Search cyan, Watchlist (favourites) hyper blue, Requests mint,
 * Settings violet. The Library hub is indigo; the rest stay volt.
 */
export const sectionAccent = (section: NeonSection): string => {
  switch (section) {
    case "search":
      return NeonBoard.cyan;
    case "watchlist":
      return NeonBoard.blue;
    case "library":
      return NeonBoard.indigo;
    case "requests":
      return NeonBoard.mint;
    case "settings":
      return NeonBoard.violet;
    case "movies":
      return NeonBoard.orange;
    case "tv":
      return NeonBoard.yellow;
    case "livetv":
      return NeonBoard.green;
    case "guide":
      return NeonBoard.cyan;
    default:
      return NeonBoard.volt;
  }
};

/**
 * Libraries that own a neon by name, as on the Android TV rail. The 4K
 * libraries are not listed: they fall through to their collection type and
 * so match their regular movie / show counterparts.
 */
const LIBRARY_ACCENT_BY_NAME: Record<string, string> = {
  "stand up comedy": NeonBoard.magenta,
  boxing: NeonBoard.pink,
  ufc: NeonBoard.azure,
};

/**
 * Accent for a library: its own neon by name, else by CollectionType -
 * `movies` orange, `tvshows` yellow, `livetv` green, everything else volt.
 */
export const libraryAccent = (
  collectionType?: string | null,
  name?: string | null,
): string => {
  const named = name ? LIBRARY_ACCENT_BY_NAME[name.trim().toLowerCase()] : null;
  if (named) return named;
  switch (collectionType) {
    case "movies":
      return NeonBoard.orange;
    case "tvshows":
      return NeonBoard.yellow;
    case "livetv":
      return NeonBoard.green;
    default:
      return NeonBoard.volt;
  }
};

type TypedItem = Pick<BaseItemDto, "Type" | "CollectionType" | "Name"> & {
  MediaType?: string | null;
};

/**
 * Accent for an item by type: Movie orange; Series / Season / Episode yellow;
 * live channels and programmes green; music volt; a library (CollectionFolder)
 * by its name or CollectionType.
 */
export const typeAccent = (item?: TypedItem | null): string => {
  if (!item) return NeonBoard.volt;
  switch (item.Type) {
    case "Movie":
      return NeonBoard.orange;
    case "Series":
    case "Season":
    case "Episode":
      return NeonBoard.yellow;
    case "TvChannel":
    case "TvProgram":
    case "LiveTvProgram":
    case "LiveTvChannel":
    case "Program":
    case "Channel":
    case "Recording":
      return NeonBoard.green;
    case "MusicAlbum":
    case "MusicArtist":
    case "Audio":
    case "Playlist":
      return NeonBoard.volt;
    case "CollectionFolder":
    case "UserView":
    case "Folder":
      return libraryAccent(item.CollectionType, item.Name);
    default:
      return NeonBoard.volt;
  }
};

/** Uppercase label for an item's type badge: MOVIE, SHOW, EPISODE, LIVE. */
export const typeLabel = (item?: TypedItem | null): string | undefined => {
  switch (item?.Type) {
    case "Movie":
      return "MOVIE";
    case "Series":
      return "SHOW";
    case "Season":
      return "SEASON";
    case "Episode":
      return "EPISODE";
    case "TvChannel":
    case "TvProgram":
    case "LiveTvProgram":
    case "Program":
      return "LIVE";
    case "MusicAlbum":
      return "ALBUM";
    case "Audio":
      return "TRACK";
    default:
      return undefined;
  }
};

/**
 * Legacy alias kept for one release so untouched imports compile. Every key
 * resolves to a Neon Board token; new code should import `NeonBoard`.
 */
export const Colors = {
  primary: NeonBoard.volt,
  primaryRGB: "rgb(212 246 63)",
  primaryLightRGB: "rgb(212 246 63)",
  text: NeonBoard.text,
  background: NeonBoard.stage,
  tint: NeonBoard.volt,
  icon: NeonBoard.mid,
  tabIconDefault: NeonBoard.low,
  tabIconSelected: NeonBoard.volt,
  backgroundCanvas: NeonBoard.stage,
  surface: NeonBoard.card,
  surfaceRaised: NeonBoard.card2,
  border: NeonBoard.line2,
  separator: NeonBoard.line,
  textBody: NeonBoard.text,
  textSecondary: NeonBoard.mid,
  sectionLabel: NeonBoard.text,
  destructive: NeonBoard.red,
} as const;
