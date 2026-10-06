import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  ItemSortBy,
  SortOrder,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { loadLibraryAlphabet } from "./libraryAlphabet";

export const STREAMING_COLLECTION_TAG = "WeaselPlex Streaming";
export const CURATED_COLLECTION_TAG = "WeaselPlex Curated";

/** Collection art identifies the card; ordinary items keep their captions. */
export function collectionCardPresentation(
  item: Pick<BaseItemDto, "Type" | "Tags">,
  layout: {
    width: number;
    viewportWidth: number;
    gutter: number;
    gap: number;
  },
) {
  const imageOnly =
    item.Type === "BoxSet" &&
    Boolean(
      item.Tags?.includes(STREAMING_COLLECTION_TAG) ||
        item.Tags?.includes(CURATED_COLLECTION_TAG),
    );
  if (!imageOnly || !item.Tags?.includes(CURATED_COLLECTION_TAG))
    return { imageOnly, width: layout.width, posterDimensions: undefined };

  // A leading gutter, two gaps and 2.5 posters must fit before scrolling.
  const width = Math.max(
    1,
    Math.floor(
      Math.min(
        layout.width * 1.35,
        (layout.viewportWidth - layout.gutter - 2 * layout.gap) / 2.5,
      ),
    ),
  );
  return { imageOnly, width, posterDimensions: { w: width, h: width * 1.5 } };
}

export const STREAMING_SERVICE_ORDER: readonly string[] = [
  "Netflix",
  "Disney+",
  "Hulu",
  "Max",
  "Prime Video",
  "Paramount+",
  "Peacock",
  "Apple TV+",
  "AMC+",
  "MGM+",
  "Starz",
  "BritBox",
  "Crunchyroll",
  "Hallmark",
  "Angel",
];

const serviceRank = (name: string | null | undefined) => {
  const index = STREAMING_SERVICE_ORDER.indexOf(name ?? "");
  return index < 0 ? STREAMING_SERVICE_ORDER.length : index;
};

export function sortStreamingCollections(items: BaseItemDto[]) {
  return [...items].sort(
    (a, b) =>
      serviceRank(a.Name) - serviceRank(b.Name) ||
      (a.Name ?? "").localeCompare(b.Name ?? ""),
  );
}

export type StreamingMediaType = "All" | "Movie" | "Series";

export async function loadStreamingCollectionItems(
  api: Api,
  userId: string,
  collectionId: string,
  options: {
    mediaType: StreamingMediaType;
    sortBy: ItemSortBy;
    sortOrder: SortOrder;
    startIndex: number;
    limit: number;
    signal?: AbortSignal;
    metadataOnly?: boolean;
  },
) {
  const response = await getItemsApi(api).getItems(
    {
      userId,
      parentId: collectionId,
      includeItemTypes:
        options.mediaType === "All" ? ["Movie", "Series"] : [options.mediaType],
      // Direct children keep shows as shows rather than drilling into seasons.
      recursive: false,
      sortBy: [options.sortBy],
      sortOrder: [options.sortOrder],
      startIndex: options.startIndex,
      limit: options.limit,
      fields: options.metadataOnly
        ? ["SortName"]
        : ["ItemCounts", "PrimaryImageAspectRatio", "SortName"],
      enableImages: options.metadataOnly ? false : undefined,
      enableUserData: options.metadataOnly ? false : undefined,
    },
    { signal: options.signal },
  );
  return response.data;
}

/** The library's complete, lightweight letter index, scoped to this collection. */
export function loadStreamingCollectionAlphabet(
  api: Api,
  userId: string,
  collectionId: string,
  mediaType: StreamingMediaType,
  sortOrder: SortOrder,
  signal?: AbortSignal,
) {
  return loadLibraryAlphabet(
    (startIndex, limit) =>
      loadStreamingCollectionItems(api, userId, collectionId, {
        mediaType,
        sortBy: "SortName",
        sortOrder,
        startIndex,
        limit,
        signal,
        metadataOnly: true,
      }),
    signal,
  );
}

/** Standard Jellyfin collections only; no companion plugin or library IDs. */
async function loadTaggedCollections(
  api: Api,
  userId: string,
  tag: string,
  signal?: AbortSignal,
) {
  const itemsApi = getItemsApi(api);
  const response = await itemsApi.getItems(
    {
      userId,
      includeItemTypes: ["BoxSet"],
      recursive: true,
      tags: [tag],
      // Picks order belongs entirely to the server, including seasonal changes.
      sortBy: tag === CURATED_COLLECTION_TAG ? ["SortName"] : undefined,
      sortOrder: tag === CURATED_COLLECTION_TAG ? ["Ascending"] : undefined,
      fields: ["ChildCount", "Overview", "Tags"],
      enableUserData: false,
    },
    { signal },
  );
  // Older servers may omit ChildCount. Probe one child rather than showing an
  // empty tile or downloading the entire mixed movie/show collection.
  const visible = await Promise.all(
    (response.data.Items ?? []).map(async (item) => {
      if (!item.Id || item.Type !== "BoxSet") return null;
      if (item.ChildCount != null) return item.ChildCount > 0 ? item : null;
      const children = await itemsApi.getItems(
        { userId, parentId: item.Id, limit: 1 },
        { signal },
      );
      return children.data.Items?.length ? item : null;
    }),
  );
  return visible.filter((item): item is BaseItemDto => item !== null);
}

export async function loadStreamingCollections(
  api: Api,
  userId: string,
  signal?: AbortSignal,
) {
  return sortStreamingCollections(
    await loadTaggedCollections(api, userId, STREAMING_COLLECTION_TAG, signal),
  );
}

export function loadCuratedCollections(
  api: Api,
  userId: string,
  signal?: AbortSignal,
) {
  return loadTaggedCollections(api, userId, CURATED_COLLECTION_TAG, signal);
}
