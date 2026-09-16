/**
 * WeaselPlex "Prismatic Ink" palette.
 *
 * Base surfaces are near-black with a blue bias; every accent is drawn from the
 * WeaselTV prismatic rainbow. The eight prismatic stops always appear in the
 * canonical order below - gradients read red through magenta, never shuffled.
 */

export const Colors = {
  primary: "#00C0FF",
  primaryRGB: "rgb(0 192 255)",
  primaryLightRGB: "rgb(127 227 255)",
  text: "#F5F7FC",
  background: "#070A10",
  tint: "#00C0FF",
  icon: "#8FA2BD",
  tabIconDefault: "#8FA2BD",
  tabIconSelected: "#00C0FF",

  backgroundCanvas: "#05070b",
  surface: "#0D1422",
  surfaceRaised: "#10182A",
  border: "#1F2737",
  separator: "#141D30",
  textBody: "#B8C4D8",
  textSecondary: "#8FA2BD",
  sectionLabel: "#CDD7EA",
  destructive: "#FF3B30",
};

/** Canonical prismatic order. Do not reorder - every rainbow gradient uses this. */
export const Prismatic = [
  "#FF3B30",
  "#FF8A00",
  "#FFD600",
  "#16E36F",
  "#00C0FF",
  "#3265FF",
  "#8A2BEF",
  "#FF2EC8",
] as const;

/** Lighter prismatic variants, legible as text or hairlines on dark surfaces. */
export const PrismaticTints = {
  cyan: "#7FE3FF",
  violet: "#C89BFF",
  magenta: "#FF9BE4",
  green: "#8CF5BE",
  yellow: "#FFE86B",
} as const;

/** Per-tab hue identity. Inactive renders the same hue at 60% opacity. */
export const TabColors = {
  index: "#00C0FF",
  search: "#3265FF",
  favorites: "#FF2EC8",
  watchlists: "#16E36F",
  library: "#8A2BEF",
  custom: "#FF8A00",
} as const;

export const TAB_INACTIVE_OPACITY = 0.6;

/** Gradient stop sets. Rainbow is the full canonical eight. */
export const Gradients = {
  rainbow: Prismatic,
  sectionTick: ["#FF3B30", "#FFD600", "#16E36F", "#00C0FF", "#8A2BEF"],
  titleText: ["#00C0FF", "#3265FF", "#8A2BEF", "#FF2EC8"],
  titleTextWarm: ["#FFD600", "#16E36F", "#00C0FF"],
  pageDotActive: ["#00C0FF", "#FF2EC8"],
  storageBar: ["#00C0FF", "#8A2BEF"],
  badgeMovies: ["#00C0FF", "#8A2BEF"],
  badgeSeries: ["#FF8A00", "#FF2EC8"],
} as const;

/** Component constants that more than one screen needs to agree on. */
export const Prism = {
  /** Gradient border thickness and the fill that sits inside it. */
  shellThickness: 1.5,
  shellInnerFill: "#0A0C12",

  progressTrack: "rgba(255,255,255,0.14)",
  progressBuffered: "rgba(255,255,255,0.28)",
  progressHeightCard: 3.5,
  progressHeightPlayer: 5,
  playerGlow: "rgba(0,192,255,0.6)",

  heroGlow: "rgba(138,43,239,0.28)",
  heroGlowRadius: 26,

  seasonChipActiveBg: "rgba(138,43,239,0.18)",
  seasonChipActiveBorder: "rgba(138,43,239,0.6)",
  seasonChipActiveText: "#C89BFF",

  genreChipBorders: [
    "rgba(0,192,255,0.5)",
    "rgba(255,46,200,0.5)",
    "rgba(22,227,111,0.5)",
  ],

  /** Settings rows descend the rainbow, one hue per row. */
  settingsIconChipOrder: [
    "#FF3B30",
    "#FF8A00",
    "#FFD600",
    "#16E36F",
    "#00C0FF",
    "#3265FF",
    "#8A2BEF",
  ],

  loginGlowTop: "rgba(0,192,255,0.10)",
  loginGlowBottom: "rgba(138,43,239,0.12)",

  tabBarBackground: "rgba(5,7,11,0.9)",
  tabActiveGlowRadius: 7,
  tabActiveGlowOpacity: 0.7,

  /** Optional hue drift on the hero shell and play pill only. */
  prismaticCycleMs: 8000,
} as const;
