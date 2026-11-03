import { INLINE_TEXT_SCALE } from "@/constants/neon";

export const EPISODE_PILL_COLUMN_WIDTH = 52;

/**
 * Explicit bounds avoid native auto-fit feeding back into intrinsic measurement
 * as FlashList recycles rows. Values returned are for our shared Text wrapper.
 */
export function getEpisodePillLayout(label: string) {
  const length = Array.from(label).length;
  const renderedFontSize = length <= 6 ? 12 : length <= 8 ? 11 : 9;
  return {
    width: Math.min(EPISODE_PILL_COLUMN_WIDTH, Math.max(34, 12 + length * 6)),
    height: 22,
    // Text scales inline typography; the physical font must fit this fixed frame.
    fontSize: renderedFontSize / INLINE_TEXT_SCALE,
    lineHeight: 16 / INLINE_TEXT_SCALE,
  };
}
