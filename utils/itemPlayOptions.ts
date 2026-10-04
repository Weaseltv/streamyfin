import type { MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client/models";
import type { SelectedOptions } from "@/components/ItemContent";

/** Refresh the DTO behind an explicit choice without replacing that choice. */
export function reconcileItemPlayOptions(
  current: SelectedOptions | undefined,
  defaults: SelectedOptions,
  sources: MediaSourceInfo[] | null | undefined,
  edited: boolean,
): SelectedOptions {
  if (!current) return defaults;
  if (!edited) {
    return current.bitrate === defaults.bitrate &&
      current.mediaSource === defaults.mediaSource &&
      current.audioIndex === defaults.audioIndex &&
      current.subtitleIndex === defaults.subtitleIndex
      ? current
      : defaults;
  }
  const source = sources?.find(
    (candidate) => candidate.Id === current.mediaSource?.Id,
  );
  // A removed source cannot be played; select valid defaults in that case.
  if (!source) return defaults;
  return source === current.mediaSource
    ? current
    : { ...current, mediaSource: source };
}
