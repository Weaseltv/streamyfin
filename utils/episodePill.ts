import { INLINE_TEXT_SCALE } from "@/constants/neon";

/** The approved column; it only widens for a season with combined episodes. */
export const EPISODE_PILL_COLUMN_WIDTH = 52;

/** paddingHorizontal 3 + borderWidth 1, on both sides of the label. */
export const EPISODE_PILL_CHROME = 2 * (3 + 1);

/**
 * Advance widths (fraction of the font size) from assets/fonts/Exo2-Medium.ttf,
 * the face the pill renders in. Digits are proportional: a "1" is two thirds
 * of a "4", so a width guessed from the character count clips "EP 20–21".
 */
const EXO2_MEDIUM_ADVANCE: Record<string, number> = {
  E: 0.563,
  P: 0.595,
  " ": 0.222,
  "0": 0.608,
  "1": 0.404,
  "2": 0.566,
  "3": 0.558,
  "4": 0.619,
  "5": 0.539,
  "6": 0.575,
  "7": 0.515,
  "8": 0.61,
  "9": 0.575,
  "–": 0.586,
  "-": 0.442,
};
/** Wider than any glyph above, for a translated prefix. */
const FALLBACK_ADVANCE = 0.65;
/** Headroom for kerning and pixel rounding on either platform. */
const SAFETY = 1.04;

export function measureEpisodeLabel(label: string, fontSize: number) {
  let em = 0;
  for (const char of label) em += EXO2_MEDIUM_ADVANCE[char] ?? FALLBACK_ADVANCE;
  return em * fontSize;
}

/** 12pt for one episode, 11pt for a range, 9pt for a three-digit range. */
export function getEpisodePillFontSize(label: string) {
  const range = label.match(/(\d+)\s*[–-]\s*(\d+)/);
  if (!range) return 12;
  return range[2].length >= 3 ? 9 : 11;
}

function pillWidth(label: string) {
  const text = measureEpisodeLabel(label, getEpisodePillFontSize(label));
  return Math.ceil(text * SAFETY) + EPISODE_PILL_CHROME;
}

/**
 * One column width for a whole list, so every thumbnail lines up: the approved
 * 52 points, or the widest pill in the list when it has longer ranges.
 */
export function getEpisodePillColumnWidth(labels: Iterable<string>) {
  let width = EPISODE_PILL_COLUMN_WIDTH;
  for (const label of labels) width = Math.max(width, pillWidth(label));
  return Math.ceil(width / 2) * 2;
}

/**
 * Explicit bounds, never native auto-fit: fitting fed back into intrinsic
 * measurement as FlashList recycled rows. Sizes are for our Text wrapper,
 * which scales inline type and rounds it to whole points.
 */
export function getEpisodePillLayout(label: string) {
  return {
    width: Math.max(34, pillWidth(label)),
    height: 22,
    fontSize: getEpisodePillFontSize(label) / INLINE_TEXT_SCALE,
    lineHeight: 16 / INLINE_TEXT_SCALE,
  };
}
