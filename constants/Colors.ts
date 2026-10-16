import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

/**
 * WeaselTV "Neon Board" palette for WeaselPlex phone.
 *
 * Flat stage, hairline rows, one neon per section. Values match WeaselPlex
 * Android TV (`Neon.kt`, `NeonSectionPalette.kt`; owner palette of
 * 2026-10-08). Keep `tailwind.config.js` in step - that file is the source of
 * truth for classNames, this one for anything styled from JS.
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
  volt: "#C6FF00",
  green: "#3DFF6E",
  cyan: "#00E5FF",
  orange: "#FF5200",
  yellow: "#FFE600",
  red: "#FF2A3D",
  warn: "#F5B93D",
  // Movies and shows: cards, badges, progress bars and title pages.
  movie: "#00B8D9",
  show: "#E8112D",
  // Section borders, one per TV rail item (their glows are in `NeonGlow`).
  home: "#0B8A42",
  search: "#0A2CFF",
  watchlist: "#FF5200",
  requests: "#009A93",
  collections: "#FFD300",
  standup: "#5A00FF",
  sports: "#FF0099",
  settings: "#EAF2FF",
  // Phone only: the Library hub tab (the TV rail lists libraries directly).
  library: "#7B4DFF",
} as const;

/**
 * Each section's glow, as on the TV: solid strokes and ink use the border
 * colour, glows (and row kickers) use these. Look one up with `glowOf`.
 */
const NeonGlow: Record<string, string> = {
  [NeonBoard.home]: "#00E04B",
  [NeonBoard.search]: "#00A3FF",
  [NeonBoard.watchlist]: "#FF7900",
  [NeonBoard.requests]: "#00F2D6",
  [NeonBoard.collections]: "#FFFF33",
  [NeonBoard.movie]: "#00E1FF",
  [NeonBoard.show]: "#FF1A1A",
  [NeonBoard.standup]: "#9B30FF",
  [NeonBoard.sports]: "#FF85D0",
};

/** The glow colour for a section or type colour; any other colour glows as itself. */
export const glowOf = (accent: string): string =>
  NeonGlow[accent.toUpperCase()] ?? accent;

/** Sections of the app that own a page accent. */
export type NeonSection =
  | "home"
  | "search"
  | "watchlist"
  | "watchlists"
  | "library"
  | "requests"
  | "collections"
  | "downloads"
  | "settings"
  | "login"
  | "music"
  | "movies"
  | "tv"
  | "livetv"
  | "guide";

/**
 * Every section owns its colour, shared with the WeaselPlex Android TV rail:
 * Home green, Search blue, Watchlist orange, Requests teal, Collections
 * yellow, Movies cyan, TV Shows red, Settings ice white. The phone's Library
 * hub is violet; the rest stay volt.
 */
export const sectionAccent = (section: NeonSection): string => {
  switch (section) {
    case "home":
      return NeonBoard.home;
    case "search":
      return NeonBoard.search;
    case "watchlist":
      return NeonBoard.watchlist;
    case "library":
      return NeonBoard.library;
    case "requests":
      return NeonBoard.requests;
    case "collections":
      return NeonBoard.collections;
    case "settings":
      return NeonBoard.settings;
    case "movies":
      return NeonBoard.movie;
    case "tv":
      return NeonBoard.show;
    case "livetv":
      return NeonBoard.green;
    case "guide":
      return NeonBoard.cyan;
    default:
      return NeonBoard.volt;
  }
};

/** Libraries that own a colour by name, as on the Android TV rail. */
const LIBRARY_ACCENT_BY_NAME: Record<string, string> = {
  collections: NeonBoard.collections,
  movies: NeonBoard.movie,
  "tv shows": NeonBoard.show,
  sports: NeonBoard.sports,
  boxing: NeonBoard.sports,
  ufc: NeonBoard.sports,
  "stand up comedy": NeonBoard.standup,
  "standup comedy": NeonBoard.standup,
  "stand-up comedy": NeonBoard.standup,
};

/**
 * Accent for a library: its own colour by name, else by CollectionType -
 * `movies` cyan, `tvshows` red, `livetv` green, `boxsets` yellow, everything
 * else volt.
 */
export const libraryAccent = (
  collectionType?: string | null,
  name?: string | null,
): string => {
  const named = name ? LIBRARY_ACCENT_BY_NAME[name.trim().toLowerCase()] : null;
  if (named) return named;
  switch (collectionType) {
    case "movies":
      return NeonBoard.movie;
    case "tvshows":
      return NeonBoard.show;
    case "livetv":
      return NeonBoard.green;
    case "boxsets":
      return NeonBoard.collections;
    default:
      return NeonBoard.volt;
  }
};

type TypedItem = Pick<BaseItemDto, "Type" | "CollectionType" | "Name"> & {
  MediaType?: string | null;
};

/**
 * Accent for an item by type: Movie cyan; Series / Season / Episode red;
 * live channels and programmes green; music volt; a library (CollectionFolder)
 * by its name or CollectionType.
 */
export const typeAccent = (item?: TypedItem | null): string => {
  if (!item) return NeonBoard.volt;
  switch (item.Type) {
    case "Movie":
      return NeonBoard.movie;
    case "Series":
    case "Season":
    case "Episode":
      return NeonBoard.show;
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
  primaryRGB: "rgb(198 255 0)",
  primaryLightRGB: "rgb(198 255 0)",
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
