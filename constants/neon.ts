import type { TextStyle, ViewStyle } from "react-native";
import { NeonBoard } from "./Colors";

/** `#RRGGBB` → `rgba(r,g,b,a)`. Non-hex input is returned untouched. */
export const rgba = (hex: string, alpha: number): string => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = Number.parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
};

/**
 * Neon glow as a `boxShadow` (React Native 0.76+, New Architecture). Where a
 * platform cannot draw it the border or rule underneath is the signal and the
 * glow is simply absent - never substitute a blur or gradient.
 *
 * rule / tally: glow(accent, 12, .6) · overline: glow(accent, 10, .8)
 * primary button: glow(accent, 18, .45) · selected chip: glow(accent, 10, .35)
 * progress: glow(accent, 8, .6)
 */
export const glow = (hex: string, blur = 12, alpha = 0.55): ViewStyle => ({
  boxShadow: `0 0 ${blur}px ${rgba(hex, alpha)}`,
});

export const glowRule = (hex: string) => glow(hex, 12, 0.6);
export const glowOverline = (hex: string) => glow(hex, 10, 0.8);
export const glowButton = (hex: string) => glow(hex, 18, 0.45);
export const glowChip = (hex: string) => glow(hex, 10, 0.35);
export const glowProgress = (hex: string) => glow(hex, 8, 0.6);

/** Glyph glow for the active tab and library chevrons (Android draws it; iOS shows the colored glyph). */
export const glyphGlow = (hex: string): ViewStyle => ({
  filter: [{ dropShadow: `0 0 7px ${rgba(hex, 0.8)}` }],
});

/** The only two gradients left in the app. */
export const Scrims = {
  /** Over an item backdrop: `stage` 0.2 → 0.75 → 1.0. */
  backdrop: [
    rgba(NeonBoard.stage, 0.2),
    rgba(NeonBoard.stage, 0.75),
    NeonBoard.stage,
  ] as [string, string, string],
  backdropLocations: [0, 0.6, 1] as [number, number, number],
  /** The player's bottom scrim: `#000` 0 → 0.85. */
  player: ["rgba(0,0,0,0)", "rgba(0,0,0,0.85)"] as [string, string],
  /** Modal backdrop: `stage` at 0.6, flat. */
  modal: rgba(NeonBoard.stage, 0.6),
  /** Glass button fill over video and backdrops. */
  glass: rgba(NeonBoard.stage, 0.7),
} as const;

/** Font families as React Native needs them (PostScript names on both platforms). */
/**
 * Font families. The six Barlow files in `assets/fonts` are embedded natively
 * by the `expo-font` config plugin (app.json) as two weight-aware families,
 * so `fontFamily: "Barlow"` + `fontWeight` resolves the right face on both
 * platforms and NativeWind's `font-bold` keeps working on Barlow.
 */
export const Fonts = {
  display: "Barlow Condensed",
  body: "Barlow",
} as const;

export const FontFace = {
  display: { fontFamily: Fonts.display, fontWeight: "800" },
  displayBold: { fontFamily: Fonts.display, fontWeight: "700" },
  body: { fontFamily: Fonts.body, fontWeight: "400" },
  bodyMedium: { fontFamily: Fonts.body, fontWeight: "500" },
  bodySemi: { fontFamily: Fonts.body, fontWeight: "600" },
  bodyBold: { fontFamily: Fonts.body, fontWeight: "700" },
} as const satisfies Record<string, TextStyle>;

/** Text scaling is allowed again, capped here. */
export const MAX_FONT_SCALE = 1.3;

/**
 * One-off `fontSize` / `lineHeight` values passed to `Text` inline are written
 * at the original handoff size and drawn this much larger, so they keep pace
 * with the enlarged scale below.
 */
export const INLINE_TEXT_SCALE = 1.2;

/**
 * The Neon Board type scale, enlarged ~20 % over the handoff for readability
 * on a phone (owner ruling 2026-09-17). Sizes are the 1.0 case; rows grow
 * with the system font size up to MAX_FONT_SCALE.
 */
export const Type = {
  display: {
    ...FontFace.display,
    fontSize: 17,
    lineHeight: 23,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  // Heads sized up so titles stand clearly above row text (owner ruling
  // 2026-09-25): pageTitle 30→34, section 20→22, eyebrow 12→13, and head
  // counts get their own `headTally` so row-level tallies (download sizes)
  // stay where they were.
  pageTitle: {
    ...FontFace.display,
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  section: {
    ...FontFace.display,
    fontSize: 22,
    lineHeight: 25,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  tally: {
    ...FontFace.displayBold,
    fontSize: 17,
    lineHeight: 19,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  /** Count or action beside a page or section head. */
  headTally: {
    ...FontFace.displayBold,
    fontSize: 19,
    lineHeight: 21,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  numeral: { ...FontFace.displayBold, fontSize: 24, lineHeight: 26 },
  eyebrow: {
    ...FontFace.bodyBold,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  overline: {
    ...FontFace.bodyBold,
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  body: { ...FontFace.body, fontSize: 15, lineHeight: 20 },
  rowTitle: { ...FontFace.bodySemi, fontSize: 18, lineHeight: 22 },
  cardTitle: { ...FontFace.bodySemi, fontSize: 15, lineHeight: 19 },
  meta: { ...FontFace.body, fontSize: 14, lineHeight: 19 },
  caption: { ...FontFace.body, fontSize: 13, lineHeight: 17 },
  button: {
    ...FontFace.display,
    fontSize: 18,
    lineHeight: 20,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  chip: { ...FontFace.bodyBold, fontSize: 14, lineHeight: 17 },
  badge: {
    ...FontFace.bodyBold,
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  timecode: {
    ...FontFace.displayBold,
    fontSize: 14,
    lineHeight: 17,
    fontVariant: ["tabular-nums"],
  },
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof Type;

/** Layout constants more than one screen must agree on. */
export const Sizes = {
  gutter: 16,
  rowLead: 18,
  brandRow: 56,
  iconButton: 44,
  headerGlyph: 26,
  row: 68,
  tally: 4,
  poster: { w: 132, h: 192 },
  posterSmall: { w: 116, h: 169 },
  thumb: { w: 212, h: 119 },
  thumbSmall: { w: 180, h: 101 },
  thumbNextUp: { w: 116, h: 65 },
  thumbEpisode: { w: 100, h: 57 },
  chip: 36,
  button: 56,
  buttonCompact: 40,
  outline: 52,
  glass: 48,
  progress: 4,
  seek: 5,
  tabBar: 68,
  badge: 22,
} as const;
