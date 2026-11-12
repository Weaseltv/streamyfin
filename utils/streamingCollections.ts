import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  ItemSortBy,
  SortOrder,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { serverServiceCode } from "./justWatchLists";
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

/**
 * The names the server used before, and other spellings of the same service
 * (owner, 2026-10-16: Max is now HBO Max and Apple TV+ is Apple TV).
 */
const SERVICE_ALIASES: Record<string, string> = {
  max: "hbo max",
  "max (hbo)": "hbo max",
  hbo: "hbo max",
  "apple tv+": "apple tv",
  "apple tv plus": "apple tv",
  "hallmark+": "hallmark",
  "hallmark plus": "hallmark",
  "angel studios": "angel",
  "disney plus": "disney+",
  "amazon prime video": "prime video",
  "paramount plus": "paramount+",
  "amc plus": "amc+",
  "mgm plus": "mgm+",
  "brit box": "britbox",
  "discovery plus": "discovery+",
  "the criterion channel": "criterion channel",
  pluto: "pluto tv",
  "tubi tv": "tubi",
  acorn: "acorn tv",
  // Not "showtime network": that's a TV Networks collection, not a service.
};

const normalizedService = (name: string | null | undefined) => {
  const value = (name ?? "").trim().toLowerCase();
  return SERVICE_ALIASES[value] ?? value;
};

/**
 * A streaming service's JustWatch code (which keys the server's lists) and,
 * where the app bundles them, its wordmark and brand color.
 */
export type StreamingService = {
  code: string;
  wordmark?: string;
  brand?: string;
};

/**
 * The services the server keeps JustWatch lists for, as on the TV
 * (`StreamingProviderHeader.kt`, `Neon.kt` `streamingProviderAccent`,
 * `StreamingCollections.justWatchPackages`), by collection name. The code is
 * usually the service's first JustWatch package. Services without a wordmark
 * keep the plain page (no logo header, default accent); collections the
 * server adds that aren't here still show in the row with their poster, with
 * no ranked lists.
 */
const SERVICES: Record<string, StreamingService> = {
  netflix: { wordmark: "netflix", brand: "#E50914", code: "nfx" },
  "disney+": { wordmark: "disney", brand: "#113CCF", code: "dnp" },
  hulu: { wordmark: "hulu", brand: "#1CE783", code: "hlu" },
  "hbo max": { wordmark: "max", brand: "#002BE7", code: "mxx" },
  "prime video": { wordmark: "prime_video", brand: "#00A8E1", code: "amp" },
  "paramount+": { wordmark: "paramount", brand: "#0064FF", code: "ppp" },
  peacock: { wordmark: "peacock", brand: "#FDB927", code: "pct" },
  "apple tv": { wordmark: "apple_tv", brand: "#A2AAAD", code: "atp" },
  "amc+": { wordmark: "amc", brand: "#00EEE6", code: "acp" },
  "mgm+": { wordmark: "mgm", brand: "#EFBE73", code: "epx" },
  starz: { wordmark: "starz", brand: "#F5E000", code: "stz" },
  britbox: { wordmark: "britbox", brand: "#66D3EB", code: "bbo" },
  crunchyroll: { wordmark: "crunchyroll", brand: "#FF5E00", code: "cru" },
  hallmark: { wordmark: "hallmark", brand: "#613790", code: "hmc" },
  angel: { wordmark: "angel", brand: "#E8B923", code: "agl" },
  // Listed 2026-10-16, without a bundled wordmark or brand color
  tubi: { code: "tbv" },
  "pluto tv": { code: "ptv" },
  "discovery+": { code: "dpu" },
  shudder: { code: "shd" },
  "acorn tv": { code: "act" },
  "criterion channel": { code: "crc" },
  youtube: { code: "yfr" },
  // Showtime has no JustWatch service of its own any more: the server ranks
  // Paramount+ Premium's lists within the Showtime collection under `sho`
  showtime: { code: "sho" },
};

/** The built-in JustWatch code, and any bundled wordmark and brand color, for a streaming collection, if it's a known service. */
export function streamingService(
  name: string | null | undefined,
): StreamingService | null {
  return SERVICES[normalizedService(name)] ?? null;
}

/**
 * The code that keys a streaming collection's lists: from the server's
 * `service_codes` when it sends them (a collection without an entry has no
 * lists), otherwise the built-in table by name. The wordmark, brand color and
 * logo header stay by name.
 */
export function streamingServiceCode(
  collection: Pick<BaseItemDto, "Id" | "Name">,
  serverCodes: ReadonlyMap<string, string> | null | undefined,
): string | null {
  return serverCodes
    ? serverServiceCode(serverCodes, collection.Id)
    : (streamingService(collection.Name)?.code ?? null);
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
      // The owner's order: each collection's sort name is its row position
      // (~01 Netflix … ~23 Criterion Channel)
      sortBy: ["SortName"],
      sortOrder: ["Ascending"],
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
 * Every collection tagged as a streaming service, in the server's sort-name
 * order (the owner's row order), however many there are; or in the member's
 * own [order] (collection ids, see `utils/streamingOrder.ts`) when they have one.
 */
export async function loadStreamingCollections(
  api: Api,
  userId: string,
  signal?: AbortSignal,
  order: readonly string[] = [],
) {
  return applyStreamingOrder(
    await loadTaggedCollections(api, userId, STREAMING_COLLECTION_TAG, signal),
    order,
  );
}
