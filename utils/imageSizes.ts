import { PixelRatio } from "react-native";

/**
 * Request widths we will ask the server for. Bucketing keeps the URL — and so
 * the cache key — stable across devices whose densities differ slightly, rather
 * than minting a distinct image per exact pixel width.
 */
const BUCKETS = [64, 96, 128, 192, 256, 320, 384, 512, 640, 768, 1000];

/**
 * Server image width for something drawn at `displayWidth` points.
 *
 * The default everywhere used to be a flat 1000px regardless of display size,
 * so a 44pt channel logo pulled the same artwork as a full-bleed backdrop.
 * Modest oversampling is deliberate: it keeps images crisp on a 3× screen
 * without paying for the full source resolution.
 */
export const imageWidthFor = (displayWidth: number): number => {
  const physical = Math.ceil(displayWidth * PixelRatio.get());
  return BUCKETS.find((bucket) => bucket >= physical) ?? BUCKETS.at(-1)!;
};

/**
 * Named widths for the recurring small artwork. Anything larger should call
 * `imageWidthFor` with its own measured width.
 */
export const ImageWidths = {
  /** Live TV channel and guide logos, drawn at ~44pt. */
  channelLogo: imageWidthFor(44),
  /** Cast/crew and artist avatars. */
  avatar: imageWidthFor(80),
  /** Small poster rails (Sizes.posterSmall.w = 116). */
  posterSmall: imageWidthFor(116),
  /** Standard poster (Sizes.poster.w = 132). */
  poster: imageWidthFor(132),
  /** Landscape thumbnails (Sizes.thumb.w = 212). */
  thumb: imageWidthFor(212),
} as const;
