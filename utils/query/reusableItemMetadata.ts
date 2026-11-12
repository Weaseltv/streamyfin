import {
  type BaseItemDto,
  ItemFields,
} from "@jellyfin/sdk/lib/generated-client/models";
import type { QueryClient } from "@tanstack/react-query";

// TV keeps its established inline fields. Phone detail and playback share the
// fields their visible controls, downloads and player actually consume; People
// is still supplied by the separately focused People query.
export const ALL_DETAIL_ITEM_FIELDS = Object.values(ItemFields);
export const DETAIL_ITEM_FIELDS: ItemFields[] = [
  ItemFields.MediaSources,
  ItemFields.MediaStreams,
  ItemFields.MediaSourceCount,
  ItemFields.Overview,
  ItemFields.Genres,
  ItemFields.RemoteTrailers,
  ItemFields.Chapters,
  ItemFields.Trickplay,
  ItemFields.ProviderIds,
  ItemFields.ParentId,
  ItemFields.PrimaryImageAspectRatio,
  ItemFields.CanDownload,
  ItemFields.PlayAccess,
];

/** Reuse only a recent, valid full DTO; playback negotiation remains fresh. */
export function getReusableItemMetadata(
  client: QueryClient,
  itemId: string,
  now = Date.now(),
): BaseItemDto | undefined {
  const queries = client
    .getQueryCache()
    .findAll({ queryKey: ["item", itemId] });
  for (const query of queries.sort(
    (a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt,
  )) {
    const fields = query.queryKey[2];
    if (
      !Array.isArray(fields) ||
      !fields.includes(ItemFields.MediaSources) ||
      !fields.includes(ItemFields.MediaStreams)
    )
      continue;
    if (
      query.state.status !== "success" ||
      query.state.isInvalidated ||
      now - query.state.dataUpdatedAt > 60_000 ||
      query.state.dataUpdatedAt > now
    )
      continue;
    const item = query.state.data as BaseItemDto | null | undefined;
    if (
      !item ||
      Array.isArray(item) ||
      item.Id !== itemId ||
      !item.MediaSources?.length
    )
      continue;
    if (
      !item.MediaSources.every(
        (source) => source.Id && Array.isArray(source.MediaStreams),
      )
    )
      continue;
    return item;
  }
}
