import type { TextStyle, ViewStyle } from "react-native";
import { glowOf, NeonBoard } from "./Colors";

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

/** `top` over `bottom` at `alpha`, as an opaque `#RRGGBB`. */
const mix = (top: string, bottom: string, alpha: number): string => {
  const parse = (hex: string) => {
    const n = Number.parseInt(hex.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const t = parse(top);
  const b = parse(bottom);
  return `#${t
    .map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)))
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
};

/** The TV's selected and focused fill (`chipOn`): the accent at 14 % over `card`. */
export const chipOn = (hex: string): string => mix(hex, NeonBoard.card, 0.14);

/**
 * Neon glow as a `boxShadow` (React Native 0.76+, New Architecture), in the
 * accent's glow colour as on the TV (`glowOf`). Where a platform cannot draw
 * it the border or rule underneath is the signal and the glow is simply
 * absent - never substitute a blur or gradient.
 *
 * rule / tally: glow(accent, 12, .6) · overline: glow(accent, 10, .8)
 * primary button: glow(accent, 18, .45) · selected chip: glow(accent, 10, .35)
 * progress: glow(accent, 8, .6)
 */
export const glow = (hex: string, blur = 12, alpha = 0.55): ViewStyle => ({
  boxShadow: `0 0 ${blur}px ${rgba(glowOf(hex), alpha)}`,
});

export const glowRule = (hex: string) => glow(hex, 12, 0.6);
export const glowOverline = (hex: string) => glow(hex, 10, 0.8);
export const glowButton = (hex: string) => glow(hex, 18, 0.45);
export const glowChip = (hex: string) => glow(hex, 10, 0.35);
export const glowProgress = (hex: string) => glow(hex, 8, 0.6);

/** Glyph glow for the active tab and library chevrons (Android draws it; iOS shows the colored glyph). */
export const glyphGlow = (hex: string): ViewStyle => ({
  filter: [{ dropShadow: `0 0 7px ${rgba(glowOf(hex), 0.8)}` }],
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

/**
 * Font families, as on WeaselPlex TV: Audiowide for titles (always uppercase)
 * and Exo 2 for everything else. The files in `assets/fonts` are embedded
 * natively by the `expo-font` config plugin (app.json) as weight-aware
 * families, so `fontFamily: "Exo 2"` + `fontWeight` resolves the right face on
 * both platforms and NativeWind's `font-bold` keeps working. Audiowide has
 * one weight.
 */
export const Fonts = {
  display: "Audiowide",
  body: "Exo 2",
} as const;

export const FontFace = {
  display: { fontFamily: Fonts.display, fontWeight: "400" },
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
 *
 * Roles follow WeaselPlex TV (2026-10-16): Audiowide 400 uppercase with
 * 0.06 em tracking for titles; Exo 2 for buttons, counts, numerals and copy.
 * Audiowide is about 1.6x as wide as the Barlow Condensed it replaced, so
 * title sizes are smaller than before to keep the same words on a line.
 */
export const Type = {
  display: {
    ...FontFace.display,
    fontSize: 14,
    lineHeight: 19,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  pageTitle: {
    ...FontFace.display,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  section: {
    ...FontFace.display,
    fontSize: 16,
    lineHeight: 21,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  tally: {
    ...FontFace.bodyBold,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  /** Count or action beside a page or section head. */
  headTally: {
    ...FontFace.bodyBold,
    fontSize: 14,
    lineHeight: 17,
    letterSpacing: 1.7,
    textTransform: "uppercase",
  },
  numeral: { ...FontFace.bodySemi, fontSize: 22, lineHeight: 26 },
  /** The small line over a section title, in the accent's glow (TV: half the title, 0.18 em). */
  kicker: {
    ...FontFace.bodySemi,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  /** A section's item count, beside the title (TV: Exo 2 600 14, grey). */
  count: { ...FontFace.bodySemi, fontSize: 14, lineHeight: 17 },
  eyebrow: {
    ...FontFace.bodyBold,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 2,
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
    ...FontFace.bodyBold,
    fontSize: 15,
    lineHeight: 18,
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  // Smaller and tighter than the TV's 15sp so four quick lists fit one row
  // at 360 wide (owner, 2026-10-16).
  chip: {
    ...FontFace.bodyBold,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  badge: {
    ...FontFace.bodyBold,
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  timecode: {
    ...FontFace.bodySemi,
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
  progress: 3,
  seek: 5,
  tabBar: 68,
  badge: 22,
} as const;
