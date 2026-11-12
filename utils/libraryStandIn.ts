import type {
  BaseItemDto,
  BaseItemKind,
} from "@jellyfin/sdk/lib/generated-client/models";

/**
 * A library's entry in the list of libraries, shown on its page while the
 * full item is fetched: the name, the type and the colour are all there.
 *
 * Display only. It is never written into the cache under the library's own
 * key, so nothing can mistake it for the full record.
 */
export function findLibraryStandIn(
  views: readonly BaseItemDto[] | null | undefined,
  libraryId: string | undefined,
): BaseItemDto | undefined {
  if (!libraryId) return undefined;
  return views?.find((view) => view.Id === libraryId);
}

/**
 * The one kind of item a library's grid lists. The folder underneath
 * sometimes holds other kinds, which must not show.
 *
 * This and the library's id are everything the grid's request takes from the
 * library record, and the list entry and the full item agree on both. So
 * swapping one for the other changes neither the request nor its name.
 */
export function libraryGridItemType(
  collectionType: BaseItemDto["CollectionType"],
): BaseItemKind | undefined {
  switch (collectionType) {
    case "movies":
      return "Movie";
    case "tvshows":
      return "Series";
    case "boxsets":
      return "BoxSet";
    case "homevideos":
      return "Video";
    case "musicvideos":
      return "MusicVideo";
    case "playlists":
      return "Playlist";
    default:
      return undefined;
  }
}
