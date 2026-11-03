import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { formatEpisodeNumber } from "@/utils/episodes";

/**
 * Generate a safe filename from item metadata
 */
export function generateFilename(item: BaseItemDto): string {
  if (item.Type === "Episode") {
    const season = String(item.ParentIndexNumber || 0).padStart(2, "0");
    const episode = formatEpisodeNumber(item, {
      padLength: 2,
      fallback: "0",
    }).padStart(2, "0");
    const seriesName = (item.SeriesName || "Unknown")
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();
    return `${seriesName}_s${season}e${episode}`;
  }

  if (item.Type === "Movie") {
    const movieName = (item.Name || "Unknown")
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();
    const year = item.ProductionYear || "";
    return `${movieName}_${year}`;
  }

  return `${item.Id}`;
}

/**
 * Strip file:// prefix from URI to get plain file path
 * Required for native modules that expect plain paths
 */
export function uriToFilePath(uri: string): string {
  return uri.replace(/^file:\/\//, "");
}

/**
 * Convert plain file path to file:// URI
 * Required for expo-file-system File constructor
 */
export function filePathToUri(path: string): string {
  if (path.startsWith("file://")) {
    return path;
  }
  return `file://${path}`;
}
