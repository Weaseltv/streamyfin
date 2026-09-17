import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

/**
 * A short quality label for a badge ("4K · HDR", "1080p", "720p · DV") from
 * the item's first video stream. Undefined when the streams are not loaded.
 */
export const qualityLabel = (item?: BaseItemDto | null): string | undefined => {
  const streams = item?.MediaStreams ?? item?.MediaSources?.[0]?.MediaStreams;
  const video = streams?.find((s) => s.Type === "Video");
  if (!video) return undefined;
  const w = video.Width ?? 0;
  const h = video.Height ?? 0;
  const res =
    w >= 3800 || h >= 2100
      ? "4K"
      : w >= 1900 || h >= 1000
        ? "1080p"
        : w >= 1260 || h >= 700
          ? "720p"
          : h > 0
            ? `${h}p`
            : undefined;
  const range = video.VideoRangeType ?? video.VideoRange;
  const hdr =
    range && /dovi|dolby/i.test(String(range))
      ? "DV"
      : range && /hdr|hlg|pq/i.test(String(range))
        ? "HDR"
        : undefined;
  return [res, hdr].filter(Boolean).join(" · ") || undefined;
};
