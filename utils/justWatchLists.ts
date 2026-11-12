import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  getDisplayPreferencesApi,
  getItemsApi,
} from "@jellyfin/sdk/lib/utils/api";

/**
 * The discovery lists the media server works out for every member
 * (`justwatch-home.sh` on Unraid, the same lists WeaselPlex TV reads): item
 * ids in ranked order, comma-separated, one display-preferences key per list.
 * Home's rows live in `justwatch-home`; the streaming service pages' POPULAR /
 * TRENDING / TOP 10 in `justwatch-streaming`.
 */
export const JUSTWATCH_HOME_PREFS = "justwatch-home";
export const JUSTWATCH_STREAMING_PREFS = "justwatch-streaming";
const PREFS_CLIENT = "WeaselPlex";

/**
 * `justwatch-home`'s map of streaming collections to the codes that key their
 * lists (`<collectionId>=<code>`, comma-separated; owner, 2026-10-16), so a
 * service added on the server gets its lists without an app release.
 */
export const SERVICE_CODES_KEY = "service_codes";

/** Ids per request, so the URL stays short. */
const IDS_PER_REQUEST = 50;

/**
 * Home's four server-made rows, as on the TV (`JustWatchHomeList.kt`, Nov 3): the list
 * key, how many cards, the kicker and title (i18n keys) and the rule colour.
 */
export const JUSTWATCH_HOME_ROWS = [
  {
    key: "trending_movies",
    size: 25,
    kicker: "home.kicker_trending",
    title: "home.kicker_movies",
    accent: "movie",
  },
  {
    key: "trending_shows",
    size: 25,
    kicker: "home.kicker_trending",
    title: "home.kicker_tv_shows",
    accent: "show",
  },
  {
    key: "recently_released",
    size: 25,
    kicker: "home.kicker_90_days",
    title: "home.recently_released",
    accent: "movie",
  },
  {
    key: "movie_roulette",
    size: 25,
    kicker: "home.kicker_movie",
    title: "home.roulette",
    accent: "movie",
  },
] as const;

/** The lists are read once for all of a page's rows and reused this long, as on the TV. */
const REUSE_FOR_MS = 5 * 60 * 1000;
const cache = new Map<
  string,
  { at: number; lists: Promise<Record<string, string[]>> }
>();

/** [loadJustWatchLists], shared by every row that reads the same member's lists. */
export function cachedJustWatchLists(
  api: Api,
  userId: string,
  prefsId: string,
): Promise<Record<string, string[]>> {
  const key = `${api.basePath}|${userId}|${prefsId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < REUSE_FOR_MS) return hit.lists;
  const lists = loadJustWatchLists(api, userId, prefsId);
  cache.set(key, { at: Date.now(), lists });
  // A failed read is tried again next time
  lists.catch(() => {
    if (cache.get(key)?.lists === lists) cache.delete(key);
  });
  return lists;
}

/** A member's saved lists in [prefsId]: list key -> ids in ranked order. */
export async function loadJustWatchLists(
  api: Api,
  userId: string,
  prefsId: string,
  signal?: AbortSignal,
): Promise<Record<string, string[]>> {
  const response = await getDisplayPreferencesApi(api).getDisplayPreferences(
    { displayPreferencesId: prefsId, userId, client: PREFS_CLIENT },
    { signal },
  );
  const prefs = response.data.CustomPrefs ?? {};
  const lists: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(prefs)) {
    if (typeof value !== "string" || key === "updated") continue;
    lists[key] =
      key === SERVICE_CODES_KEY
        ? value
            .split(",")
            .map((pair) => pair.trim())
            .filter(Boolean)
        : value.split(",").filter((id) => /^[0-9a-f]{32}$/i.test(id));
  }
  return lists;
}

const collectionKey = (id: string) => id.replace(/-/g, "").toLowerCase();

/**
 * The server's streaming collection codes by collection id (no dashes, lower
 * case, as the TV holds UUIDs), from the `service_codes` pairs. `null` when
 * the server doesn't send any (an older job, or before its first run): then
 * the app's built-in table applies.
 */
export function parseServiceCodes(
  pairs: readonly string[] | undefined,
): Map<string, string> | null {
  if (!pairs?.length) return null;
  const codes = new Map<string, string>();
  for (const pair of pairs) {
    const split = pair.indexOf("=");
    const id = pair.slice(0, split).trim();
    const code = pair.slice(split + 1).trim();
    if (split > 0 && id && code) codes.set(collectionKey(id), code);
  }
  return codes;
}

/** The code that keys a collection's lists in the server's mapping, if it has one. */
export function serverServiceCode(
  codes: ReadonlyMap<string, string>,
  collectionId: string | null | undefined,
): string | null {
  return collectionId ? (codes.get(collectionKey(collectionId)) ?? null) : null;
}

/** The member's `service_codes`, from the same cached `justwatch-home` read as Home's rows. */
export async function cachedServiceCodes(
  api: Api,
  userId: string,
): Promise<Map<string, string> | null> {
  const lists = await cachedJustWatchLists(api, userId, JUSTWATCH_HOME_PREFS);
  return parseServiceCodes(lists[SERVICE_CODES_KEY]);
}

/**
 * The items for [ids] as the member sees them (anything they can't see drops
 * out), in ranked order, at most [size] of them.
 */
export async function loadRankedItems(
  api: Api,
  userId: string,
  ids: readonly string[],
  size: number,
  signal?: AbortSignal,
): Promise<BaseItemDto[]> {
  if (ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += IDS_PER_REQUEST) {
    chunks.push(ids.slice(i, i + IDS_PER_REQUEST));
  }
  const pages = await Promise.all(
    chunks.map((chunk) =>
      getItemsApi(api).getItems(
        {
          userId,
          ids: chunk,
          enableImageTypes: ["Primary", "Backdrop", "Thumb"],
          fields: ["PrimaryImageAspectRatio"],
          enableTotalRecordCount: false,
        },
        { signal },
      ),
    ),
  );
  const byId = new Map<string, BaseItemDto>();
  for (const page of pages) {
    for (const item of page.data.Items ?? []) {
      if (item.Id) byId.set(item.Id.replace(/-/g, ""), item);
    }
  }
  // The server returns them in its own order, so put them back in ranked order
  return ids
    .map((id) => byId.get(id.replace(/-/g, "")))
    .filter((item): item is BaseItemDto => item !== undefined)
    .slice(0, size);
}
