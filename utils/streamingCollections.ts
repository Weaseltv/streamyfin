import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  ItemSortBy,
  SortOrder,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { loadLibraryAlphabet } from "./libraryAlphabet";

export const STREAMING_COLLECTION_TAG = "WeaselPlex Streaming";

const isShowType = (type?: string | null) =>
  type === "Series" || type === "Season" || type === "Episode";

/**
 * As on the TV, a row shows MOVIE / SHOW badges only when it mixes movies and
 * shows (episodes and seasons read SHOW). Returns each card's badge: `null`
 * hides it.
 */
export function rowBadges(
  items: readonly Pick<BaseItemDto, "Type">[],
): (item: Pick<BaseItemDto, "Type">) => string | null {
  const mixed =
    items.some((item) => item.Type === "Movie") &&
    items.some((item) => isShowType(item.Type));
  if (!mixed) return () => null;
  return (item) =>
    item.Type === "Movie" ? "MOVIE" : isShowType(item.Type) ? "SHOW" : null;
}

/** Collection art identifies the card; ordinary items keep their captions. */
export function collectionCardPresentation(
  item: Pick<BaseItemDto, "Type" | "Tags">,
  layout: { width: number },
) {
  const imageOnly =
    item.Type === "BoxSet" &&
    Boolean(item.Tags?.includes(STREAMING_COLLECTION_TAG));
  return { imageOnly, width: layout.width };
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

/** Server naming aliases, as on the TV (`StreamingCollections.serviceIndex`). */
const SERVICE_ALIASES: Record<string, string> = {
  "hbo max": "max",
  "max (hbo)": "max",
  hbo: "max",
  "apple tv": "apple tv+",
  "apple tv plus": "apple tv+",
  "hallmark+": "hallmark",
  "hallmark plus": "hallmark",
  "angel studios": "angel",
  "disney plus": "disney+",
  "amazon prime video": "prime video",
  "paramount plus": "paramount+",
  "amc plus": "amc+",
  "mgm plus": "mgm+",
  "brit box": "britbox",
};

const normalizedService = (name: string | null | undefined) => {
  const value = (name ?? "").trim().toLowerCase();
  return SERVICE_ALIASES[value] ?? value;
};

const serviceRank = (name: string | null | undefined) => {
  const index = STREAMING_SERVICE_ORDER.findIndex(
    (service) => service.toLowerCase() === normalizedService(name),
  );
  return index < 0 ? STREAMING_SERVICE_ORDER.length : index;
};

/**
 * Each service's bundled wordmark, brand colour and JustWatch code (its first
 * JustWatch package, which keys the server's lists), as on the TV
 * (`StreamingProviderHeader.kt`, `Neon.kt` `streamingProviderAccent`,
 * `StreamingCollections.justWatchPackages`), in `STREAMING_SERVICE_ORDER`.
 */
const SERVICES: readonly { wordmark: string; brand: string; code: string }[] = [
  { wordmark: "netflix", brand: "#E50914", code: "nfx" },
  { wordmark: "disney", brand: "#113CCF", code: "dnp" },
  { wordmark: "hulu", brand: "#1CE783", code: "hlu" },
  { wordmark: "max", brand: "#002BE7", code: "mxx" },
  { wordmark: "prime_video", brand: "#00A8E1", code: "amp" },
  { wordmark: "paramount", brand: "#0064FF", code: "ppp" },
  { wordmark: "peacock", brand: "#FDB927", code: "pct" },
  { wordmark: "apple_tv", brand: "#A2AAAD", code: "atp" },
  { wordmark: "amc", brand: "#00EEE6", code: "acp" },
  { wordmark: "mgm", brand: "#EFBE73", code: "epx" },
  { wordmark: "starz", brand: "#F5E000", code: "stz" },
  { wordmark: "britbox", brand: "#66D3EB", code: "bbo" },
  { wordmark: "crunchyroll", brand: "#FF5E00", code: "cru" },
  { wordmark: "hallmark", brand: "#613790", code: "hmc" },
  { wordmark: "angel", brand: "#E8B923", code: "agl" },
];

/** The bundled wordmark, brand colour and JustWatch code for a streaming collection, if it's a known service. */
export function streamingService(
  name: string | null | undefined,
): { wordmark: string; brand: string; code: string } | null {
  return SERVICES[serviceRank(name)] ?? null;
}

/** Saved ids first in their saved order, then the rest in the default order. */
export function applyStreamingOrder(
  items: readonly BaseItemDto[],
  ids: readonly string[],
): BaseItemDto[] {
  const position = new Map(ids.map((id, index) => [id, index]));
  const saved = items
    .filter((item) => item.Id && position.has(item.Id))
    .sort((a, b) => position.get(a.Id!)! - position.get(b.Id!)!);
  return [
    ...saved,
    ...items.filter((item) => !item.Id || !position.has(item.Id)),
  ];
}

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

/**
 * The streaming collections in the default order, or in the member's own
 * [order] (collection ids, see `utils/streamingOrder.ts`) when they have one.
 */
export async function loadStreamingCollections(
  api: Api,
  userId: string,
  signal?: AbortSignal,
  order: readonly string[] = [],
) {
  return applyStreamingOrder(
    sortStreamingCollections(
      await loadTaggedCollections(
        api,
        userId,
        STREAMING_COLLECTION_TAG,
        signal,
      ),
    ),
    order,
  );
}
