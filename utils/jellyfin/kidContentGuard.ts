import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  BaseItemDtoQueryResult,
} from "@jellyfin/sdk/lib/generated-client";
import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  CanceledError,
  type InternalAxiosRequestConfig,
} from "axios";
import {
  decideKidItems,
  filterKidResponse,
  isKidItem,
  isObject,
  type KidFactsLoader,
  kidFacts,
  listKidItems,
  normalizeKidItemId,
  visitKidItems,
} from "./kidContentFilter";
import {
  isHorror,
  type KidItemFacts,
  maxKidRatingLevel,
} from "./kidContentRules";

const ruleFields = ["Genres", "Settings"];
const cacheTtl = 120_000;
const lookupBatchSize = 40;
const collectionPageSize = 100;
const maxCollectionDepth = 4;
const maxCollectionRequests = 20;
const collectionTimeout = 5_000;
const maxConcurrentLookups = 16;
const kidsHomeTag = "WeaselPlex Kids";

type Signal = AxiosRequestConfig["signal"];
type Cached<T> = { value: T; expires: number };
type CollectionTraversal = {
  remaining: number;
  cutoffs: number;
  signal: Signal;
};

interface KidHomeRequest extends AxiosRequestConfig {
  kidHomeCollections: true;
}

function readCache<T>(cache: Map<string, Cached<T>>, key: string) {
  const entry = cache.get(key);
  if (entry && entry.expires <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry;
}

function remember<T>(cache: Map<string, Cached<T>>, key: string, value: T) {
  cache.set(key, { value, expires: Date.now() + cacheTtl });
}

function checkSignal(signal: Signal) {
  if (signal?.aborted) throw new CanceledError();
}

function lookupPool() {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(signal: Signal, run: () => Promise<T>): Promise<T> => {
    checkSignal(signal);
    if (active < maxConcurrentLookups) active++;
    else {
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          const index = waiting.indexOf(resume);
          if (index !== -1) waiting.splice(index, 1);
          reject(new CanceledError());
        };
        const resume = () => {
          signal?.removeEventListener?.("abort", abort);
          resolve();
        };
        waiting.push(resume);
        signal?.addEventListener?.("abort", abort);
      });
    }
    try {
      checkSignal(signal);
      return await run();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

function parseResponse(data: unknown, contentType: unknown): unknown {
  if (typeof data !== "string" || !data.trim()) return data;
  if (
    String(contentType).toLowerCase().includes("json") ||
    /^[[{]/.test(data.trimStart())
  ) {
    return JSON.parse(data);
  }
  return data;
}

function hiddenItem(config: InternalAxiosRequestConfig) {
  return new AxiosError(
    "Request failed with status code 404",
    AxiosError.ERR_BAD_REQUEST,
    config,
    undefined,
    {
      data: null,
      status: 404,
      statusText: "Not Found",
      headers: {},
      config,
    },
  );
}

function withRuleFields(url: URL) {
  const fields = new Set<string>();
  // The generated SDK uses URL query strings. Handwritten requests also
  // use Axios params (with either Fields or fields).
  for (const [key, value] of Array.from(url.searchParams.entries())) {
    if (!/^fields(?:\[\])?$/i.test(key)) continue;
    for (const field of value.split(",")) if (field) fields.add(field);
    url.searchParams.delete(key);
  }
  for (const field of ruleFields) fields.add(field);
  url.searchParams.set("fields", [...fields].join(","));
}

// Jellyfin endpoints where the SDK declares a fields query parameter.
const ruleFieldPaths = [
  /^(?:Users\/[^/]+\/)?Items(?:\/(?:Latest|Resume))?$/i,
  /^UserItems\/Resume$/i,
  /^Shows\/(?:NextUp|Upcoming|[^/]+\/(?:Episodes|Seasons))$/i,
  /^(?:Genres|MusicGenres|Persons|Studios|Trailers|Years|Artists(?:\/AlbumArtists)?)$/i,
  /^Movies\/Recommendations$/i,
  /^Playlists\/[^/]+\/Items$/i,
  /^(?:Albums|Artists|Items|Movies|Shows|Trailers)\/[^/]+\/Similar$/i,
  /^(?:(?:Albums|Items|Playlists|Songs)\/[^/]+|(?:Artists|MusicGenres)(?:\/[^/]+)?)\/InstantMix$/i,
  /^Channels\/(?:[^/]+\/Items|Items\/Latest)$/i,
  /^LiveTv\/(?:Channels|Programs(?:\/Recommended)?|Recordings(?:\/Series)?)$/i,
];

function pathItem(path: string, method?: string) {
  const legacyPath = path.replace(/^Users\/[^/]+\//i, "");
  const [route, id, ...tail] = legacyPath.split("/");
  if (!id) return undefined;
  if (route.toLowerCase() === "items") {
    if (id.toLowerCase() === "remotesearch") {
      if (tail[0]?.toLowerCase() === "apply" && tail[1]) {
        return { id: tail[1], fresh: false };
      }
      return undefined;
    }
    if (/^(latest|resume|root|counts|filters2?|suggestions|year)$/i.test(id))
      return undefined;
    // GET /Items/{itemId} is checked on the response, as on TV.
    if (!tail.length && method?.toLowerCase() === "get") return undefined;
    return { id, fresh: /^(PlaybackInfo|Download)$/i.test(tail[0] ?? "") };
  }
  if (/^(audio|videos)$/i.test(route) && tail.length) {
    return { id, fresh: true };
  }
  if (
    (/^(shows|albums|artists|movies|trailers|songs)$/i.test(route) &&
      /^(Episodes|Seasons|InstantMix|Similar)$/i.test(tail[0] ?? "")) ||
    (/^(playingitems|useritems|userfavoriteitems|userplayeditems|mediasegments|episode)$/i.test(
      route,
    ) &&
      id.toLowerCase() !== "resume")
  ) {
    return { id, fresh: false };
  }
  if (route.toLowerCase() === "playlists") {
    if (tail[0]?.toLowerCase() === "instantmix") return { id, fresh: false };
    if (tail[0]?.toLowerCase() === "items" && tail[1]) {
      return { id: tail[1], fresh: false };
    }
  }
}

function scrubHorrorGenres(root: unknown): unknown {
  if (!isObject(root) || !Array.isArray(root.Genres)) return root;
  return {
    ...root,
    Genres: root.Genres.filter((genre: unknown) => {
      const name = isObject(genre) ? genre.Name : genre;
      return typeof name !== "string" || !isHorror(name);
    }),
  };
}

// The flag distinguishes this call from ordinary collection lookups. Every
// row's children still go through the same response filter.
export async function getKidHomeCollections(
  api: Api,
  userId: string,
  signal?: AbortSignal,
): Promise<BaseItemDto[]> {
  const request: KidHomeRequest = {
    kidHomeCollections: true,
    signal,
    params: {
      userId,
      includeItemTypes: "BoxSet",
      recursive: true,
      tags: kidsHomeTag,
      fields: "ChildCount",
      sortBy: "SortName",
      sortOrder: "Ascending",
      enableUserData: false,
    },
    headers: { Authorization: api.authorizationHeader },
  };
  const { data } = await api.axiosInstance.get<BaseItemDtoQueryResult>(
    api.getUri("/Items"),
    request,
  );
  return data.Items ?? [];
}

function isKidsHomeQuery(path: string, url: URL, config: AxiosRequestConfig) {
  if (
    !(config as Partial<KidHomeRequest>).kidHomeCollections ||
    !/^(?:Users\/[^/]+\/)?Items$/i.test(path)
  )
    return false;
  const allowed = new Set([
    "userid",
    "includeitemtypes",
    "recursive",
    "tags",
    "fields",
    "sortby",
    "sortorder",
    "enableuserdata",
    "enabletotalrecordcount",
    "enableimages",
    "imagetypelimit",
    "enableimagetypes",
  ]);
  const query = new URLSearchParams();
  for (const [key, value] of url.searchParams.entries()) {
    const normalized = key.toLowerCase();
    if (!allowed.has(normalized)) return false;
    query.append(normalized, value);
  }
  return (
    query.getAll("tags").join(",") === kidsHomeTag &&
    query.getAll("includeitemtypes").join(",") === "BoxSet" &&
    query.getAll("recursive").join(",") === "true" &&
    query.getAll("sortby").join(",") === "SortName"
  );
}

const playbackChecks = new WeakMap<Api, (id: string) => Promise<boolean>>();

export function isKidContentFiltered(api: Api | null | undefined) {
  return !!api && playbackChecks.has(api);
}

export async function checkKidPlayback(
  api: Api | null | undefined,
  id: string,
  offline: boolean,
) {
  const check = api && playbackChecks.get(api);
  return check ? !offline && (await check(id)) : true;
}

/**
 * TV's content checkpoint. The lookup client stays pinned to this session's
 * server and token, with the same proxy headers and no filtering recursion.
 */
export function installKidContentGuard(
  api: Api,
  raw: AxiosInstance,
  ceiling: number,
) {
  const maxLevel = maxKidRatingLevel(ceiling);
  const facts = new Map<string, Cached<KidItemFacts | null>>();
  const collections = new Map<string, Cached<boolean>>();
  const withCollectionTurn = lookupPool();
  const withLookup = lookupPool();
  const base = new URL(api.basePath);
  const basePrefix = base.pathname.replace(/\/$/, "");
  const headers = { Authorization: api.authorizationHeader };

  function requestUrl(config: InternalAxiosRequestConfig) {
    const uri = api.axiosInstance.getUri({
      ...config,
      baseURL: config.baseURL ?? api.basePath,
    });
    const url = new URL(uri);
    if (
      url.origin !== base.origin ||
      !url.pathname.startsWith(`${basePrefix}/`)
    )
      return;
    return {
      url,
      path: decodeURIComponent(
        url.pathname.slice(basePrefix.length + 1),
      ).replace(/\/$/, ""),
    };
  }

  async function requestItems(
    params: Record<string, string | number | boolean>,
    signal: Signal,
  ) {
    return withLookup(signal, async () => {
      const response = await raw.get<unknown>(api.getUri("/Items"), {
        headers,
        signal,
        params: {
          ...params,
          fields: ruleFields.join(","),
          enableImages: false,
          enableUserData: false,
        },
        responseType: "json",
        transitional: { silentJSONParsing: false },
      });
      return response.data;
    });
  }

  function spend(traversal?: CollectionTraversal) {
    if (traversal && --traversal.remaining < 0)
      throw new Error("Collection lookup budget spent");
  }

  async function loadItems(
    ids: Set<string>,
    fresh: boolean,
    signal: Signal,
    traversal?: CollectionTraversal,
  ) {
    const result = new Map<string, KidItemFacts>();
    const missing: string[] = [];
    for (const id of ids) {
      const cached = fresh ? undefined : readCache(facts, id);
      if (!cached) missing.push(id);
      else if (cached.value) result.set(id, cached.value);
    }
    try {
      for (let index = 0; index < missing.length; index += lookupBatchSize) {
        const batch = missing.slice(index, index + lookupBatchSize);
        spend(traversal);
        const data = await requestItems({ ids: batch.join(",") }, signal);
        const found = new Map(
          listKidItems(data).map((item) => {
            const metadata = kidFacts(item);
            return [metadata.id, metadata];
          }),
        );
        for (const id of batch) {
          const metadata = found.get(id);
          if (!fresh) remember(facts, id, metadata ?? null);
          if (metadata) result.set(id, metadata);
        }
      }
      return result;
    } catch (error) {
      if (axios.isCancel(error)) throw error;
      if (traversal) traversal.cutoffs++;
      return new Map<string, KidItemFacts>();
    }
  }

  function loader(
    fresh: boolean,
    signal: Signal,
    allowCollections = true,
  ): KidFactsLoader {
    return {
      items: (ids) => loadItems(ids, fresh, signal),
      boxSetHasVisibleChild: (id) =>
        allowCollections
          ? checkCollection(id, fresh, signal)
          : Promise.resolve(false),
    };
  }

  async function checkCollection(id: string, fresh: boolean, signal: Signal) {
    if (maxLevel === undefined) return false;
    const cached = fresh ? undefined : readCache(collections, id);
    if (cached) return cached.value;
    return withCollectionTurn(signal, async () => {
      const cachedAfterWait = fresh ? undefined : readCache(collections, id);
      if (cachedAfterWait) return cachedAfterWait.value;
      const controller = new AbortController();
      const cancel = () => controller.abort();
      signal?.addEventListener?.("abort", cancel);
      const timeout = setTimeout(cancel, collectionTimeout);
      try {
        const traversal = {
          remaining: maxCollectionRequests,
          cutoffs: 0,
          signal: controller.signal,
        };
        return await scanCollection(id, maxLevel, fresh, new Set(), traversal);
      } catch (error) {
        checkSignal(signal);
        if (axios.isCancel(error)) return false;
        throw error;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener?.("abort", cancel);
      }
    });
  }

  async function scanCollection(
    id: string,
    level: number,
    fresh: boolean,
    ancestors: Set<string>,
    traversal: CollectionTraversal,
  ): Promise<boolean> {
    if (ancestors.has(id) || ancestors.size >= maxCollectionDepth) {
      traversal.cutoffs++;
      return false;
    }
    const cached = fresh ? undefined : readCache(collections, id);
    if (cached) return cached.value;
    const cutoffsBefore = traversal.cutoffs;
    const nested = new Set<string>();
    try {
      for (let startIndex = 0; ; startIndex += collectionPageSize) {
        spend(traversal);
        const root = await requestItems(
          { parentId: id, startIndex, limit: collectionPageSize },
          traversal.signal,
        );
        const children = listKidItems(root).map(kidFacts);
        const visible = await decideKidItems(children, level, {
          items: (ids) => loadItems(ids, fresh, traversal.signal, traversal),
          boxSetHasVisibleChild: async (child) => {
            nested.add(child);
            return false;
          },
        });
        if (visible.some(Boolean)) {
          if (!fresh) remember(collections, id, true);
          return true;
        }
        const total = isObject(root) ? root.TotalRecordCount : undefined;
        if (
          children.length < collectionPageSize ||
          (typeof total === "number" &&
            startIndex + collectionPageSize >= total)
        )
          break;
      }
      const below = new Set(ancestors).add(id);
      for (const child of nested) {
        if (await scanCollection(child, level, fresh, below, traversal)) {
          if (!fresh) remember(collections, id, true);
          return true;
        }
      }
      if (!fresh && traversal.cutoffs === cutoffsBefore)
        remember(collections, id, false);
    } catch (error) {
      if (axios.isCancel(error)) throw error;
      traversal.cutoffs++;
    }
    return false;
  }

  async function isVisible(rawId: string, fresh: boolean, signal?: Signal) {
    const id = normalizeKidItemId(rawId);
    const cached = fresh ? undefined : readCache(facts, id);
    let item = cached?.value;
    if (!cached) {
      try {
        const { data } = await withLookup(signal, () =>
          raw.get<unknown>(api.getUri(`/Items/${encodeURIComponent(id)}`), {
            headers,
            signal,
            responseType: "json",
            transitional: { silentJSONParsing: false },
          }),
        );
        item = isKidItem(data) ? kidFacts(data) : null;
        if (item && item.id !== id) return false;
        if (!fresh) remember(facts, id, item);
      } catch (error) {
        if (axios.isCancel(error)) throw error;
        if (
          !fresh &&
          axios.isAxiosError(error) &&
          error.response?.status === 404
        )
          remember(facts, id, null);
        return false;
      }
    }
    if (!item) return false;
    const [visible] = await decideKidItems(
      [item],
      maxLevel,
      loader(fresh, signal),
    );
    return visible === true;
  }

  playbackChecks.set(api, (id) => isVisible(id, true));
  api.axiosInstance.interceptors.request.use(async (config) => {
    const request = requestUrl(config);
    if (!request) return config;
    const { path, url } = request;
    const item = pathItem(path, config.method);
    if (item && !(await isVisible(item.id, item.fresh, config.signal)))
      throw hiddenItem(config);
    if (ruleFieldPaths.some((pattern) => pattern.test(path))) {
      withRuleFields(url);
      config.url = url.toString();
      config.params = undefined;
    }
    return config;
  });
  api.axiosInstance.interceptors.response.use(async (response) => {
    const request = requestUrl(response.config);
    if (!request) return response;
    const { responseType } = response.config;
    if (
      responseType === "arraybuffer" ||
      responseType === "blob" ||
      responseType === "stream"
    ) {
      return response;
    }
    const source = parseResponse(
      response.data,
      response.headers["content-type"],
    );
    const { path, url } = request;
    const { root, hidden, removed } = await filterKidResponse(
      source,
      maxLevel,
      loader(false, response.config.signal),
      isKidsHomeQuery(path, url, response.config),
    );
    checkSignal(response.config.signal);
    if (hidden) throw hiddenItem(response.config);
    visitKidItems(root, (item) => {
      const metadata = kidFacts(item);
      if (metadata.id && metadata.genres && metadata.lockedFields)
        remember(facts, metadata.id, metadata);
    });
    response.data = /^(?:Users\/[^/]+\/)?Items\/Filters2?$/i.test(path)
      ? scrubHorrorGenres(root)
      : root;
    response.headers["x-weaselplex-kid-filtered"] = "1";
    response.headers["x-weaselplex-kid-removed"] = String(removed);
    return response;
  });
}
