import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";

/**
 * Fuzzy title search, as on WeaselPlex TV (owner, 2026-10-16: "MASH" found
 * nothing, "M.A.S.H." found M*A*S*H; spoken "mob land" missed MobLand). The
 * server matches substrings of names with punctuation turned into spaces, so
 * the app keeps its own index of the member's movies, shows and collections
 * and matches on a key without spaces or punctuation. Its matches lead each
 * of those search sections; the server's own results follow.
 *
 * No React Native imports here, so the rules can be unit tested.
 */

/** The search sections the index serves. */
export const TITLE_TYPES = ["Movie", "Series", "BoxSet"] as const;
export type TitleType = (typeof TITLE_TYPES)[number];

export type TitleEntry = {
  id: string;
  name: string;
  type: TitleType;
  year: number | null;
  /** `searchKey(name)` */
  key: string;
};

export type TitleIndex = {
  /** `serverId:userId`: the index is per member */
  owner: string;
  /** When it was fetched */
  at: number;
  titles: TitleEntry[];
};

/** At most this many index matches per section. */
const MAX_PER_TYPE = 50;

/**
 * Accents and case fold away, "&" reads "and", and only letters and digits
 * stay (Unicode-aware, so non-Latin titles still work): "M*A*S*H", "M.A.S.H."
 * and "MASH" are all "mash", "Law & Order" is "lawandorder".
 */
export function searchKey(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

const isTitleType = (type: unknown): type is TitleType =>
  TITLE_TYPES.includes(type as TitleType);

/** Every movie, show and collection the member can see, names only. */
export async function loadTitleIndex(
  api: Api,
  userId: string,
  signal?: AbortSignal,
): Promise<TitleEntry[]> {
  const response = await getItemsApi(api).getItems(
    {
      userId,
      recursive: true,
      includeItemTypes: [...TITLE_TYPES],
      enableImages: false,
      enableUserData: false,
      enableTotalRecordCount: false,
      sortBy: ["SortName"],
    },
    { signal },
  );
  return (response.data.Items ?? []).flatMap((item) =>
    item.Id && item.Name && isTitleType(item.Type)
      ? [
          {
            id: item.Id,
            name: item.Name,
            type: item.Type,
            year: item.ProductionYear ?? null,
            key: searchKey(item.Name),
          },
        ]
      : [],
  );
}

/** Bump when `searchKey` changes, so saved keys are worked out again. */
const INDEX_VERSION = 1;

/** The compact form kept on the device: one `[id, name, type, year, key]` per title. */
export function serializeTitleIndex(index: TitleIndex): string {
  return JSON.stringify({
    v: INDEX_VERSION,
    owner: index.owner,
    at: index.at,
    titles: index.titles.map((t) => [t.id, t.name, t.type, t.year, t.key]),
  });
}

/** The saved index, if it's this member's and in the current format. */
export function parseTitleIndex(
  json: string | null | undefined,
  owner: string,
): TitleIndex | undefined {
  if (!json) return undefined;
  try {
    const saved = JSON.parse(json);
    if (
      saved?.v !== INDEX_VERSION ||
      saved.owner !== owner ||
      typeof saved.at !== "number" ||
      !Array.isArray(saved.titles)
    )
      return undefined;
    const titles: TitleEntry[] = [];
    for (const row of saved.titles) {
      if (!Array.isArray(row)) continue;
      const [id, name, type, year, key] = row;
      if (
        typeof id !== "string" ||
        typeof name !== "string" ||
        !isTitleType(type) ||
        typeof key !== "string"
      )
        continue;
      titles.push({
        id,
        name,
        type,
        year: typeof year === "number" ? year : null,
        key,
      });
    }
    return { owner, at: saved.at, titles };
  } catch {
    return undefined;
  }
}

/** How many edits a query of this length may be from a title: tier 3 only for 4+ characters. */
export function typoTolerance(length: number) {
  return length >= 8 ? 2 : length >= 4 ? 1 : 0;
}

/**
 * The smallest edit distance between [query] and any substring of a key
 * (Sellers' algorithm: the match may start anywhere), for distances up to
 * [k]; anything above [k] comes back as some number above [k]. Ukkonen's
 * cut-off only works out the rows that can still be within [k], and one
 * column is reused for every key, so ~12k titles stay quick per keystroke.
 */
export function substringDistance(query: string, k: number) {
  const m = query.length;
  const pattern = new Uint16Array(m);
  for (let i = 0; i < m; i++) pattern[i] = query.charCodeAt(i);
  const column = new Int32Array(m + 1);
  return (key: string): number => {
    for (let i = 0; i <= m; i++) column[i] = i;
    let best = m;
    // The last row that can still be within k in the next column
    let last = Math.min(k + 1, m);
    for (let j = 0; j < key.length; j++) {
      const c = key.charCodeAt(j);
      // Row 0 is 0 in every column: a match may start at any position
      let diagonal = 0;
      let above = 0;
      for (let i = 1; i <= last; i++) {
        const left = column[i];
        let value = diagonal;
        if (pattern[i - 1] !== c) {
          if (above < value) value = above;
          if (left < value) value = left;
          value += 1;
        }
        diagonal = left;
        column[i] = value;
        above = value;
      }
      while (column[last] > k) last--;
      if (last === m) {
        if (column[m] < best) best = column[m];
      } else {
        last++;
      }
    }
    return best;
  };
}

type Ranked = {
  title: TitleEntry;
  tier: number;
  distance: number;
  position: number;
};

const byRank = (a: Ranked, b: Ranked) =>
  a.tier - b.tier ||
  a.distance - b.distance ||
  a.title.key.length - b.title.key.length ||
  (a.title.name < b.title.name ? -1 : a.title.name > b.title.name ? 1 : 0) ||
  a.position - b.position;

export type TitleMatches = Record<TitleType, TitleEntry[]>;

/**
 * The index's matches for [query], best first, at most 50 per type: the key
 * itself (tier 0), keys starting with it (1), keys containing it (2), then,
 * for 4+ characters, keys within 1 edit (4–7 characters) or 2 (8+) of a
 * substring (3). Ties go to the closer match, then the shorter key, then the
 * name. Under 2 characters, nothing.
 */
export function matchTitles(
  titles: readonly TitleEntry[],
  query: string,
): TitleMatches {
  const matches: Record<TitleType, Ranked[]> = {
    Movie: [],
    Series: [],
    BoxSet: [],
  };
  const q = searchKey(query);
  if (q.length >= 2) {
    const k = typoTolerance(q.length);
    const distance = k > 0 ? substringDistance(q, k) : null;
    for (let position = 0; position < titles.length; position++) {
      const title = titles[position];
      const key = title.key;
      if (key === q) {
        matches[title.type].push({ title, tier: 0, distance: 0, position });
      } else if (key.startsWith(q)) {
        matches[title.type].push({ title, tier: 1, distance: 0, position });
      } else if (key.includes(q)) {
        matches[title.type].push({ title, tier: 2, distance: 0, position });
      } else if (distance && key.length >= q.length - k) {
        const d = distance(key);
        if (d <= k)
          matches[title.type].push({ title, tier: 3, distance: d, position });
      }
    }
  }
  const ranked = (type: TitleType) =>
    matches[type]
      .sort(byRank)
      .slice(0, MAX_PER_TYPE)
      .map((match) => match.title);
  return {
    Movie: ranked("Movie"),
    Series: ranked("Series"),
    BoxSet: ranked("BoxSet"),
  };
}

const normalizedId = (id: string) => id.replace(/-/g, "").toLowerCase();

/**
 * The index's matches as items, in rank order, fetched with the options the
 * search sections use so the cards look the same. Anything the member can't
 * see simply doesn't come back.
 */
export async function loadIndexedTitles(
  api: Api,
  userId: string,
  ids: readonly string[],
  signal?: AbortSignal,
): Promise<BaseItemDto[]> {
  if (ids.length === 0) return [];
  const response = await getItemsApi(api).getItems(
    { userId, ids: [...ids] },
    { signal },
  );
  const byId = new Map<string, BaseItemDto>();
  for (const item of response.data.Items ?? []) {
    if (item.Id) byId.set(normalizedId(item.Id), item);
  }
  return ids
    .map((id) => byId.get(normalizedId(id)))
    .filter((item): item is BaseItemDto => item !== undefined);
}

/**
 * A section's results: the index's matches first, in rank order, then the
 * server's own results it didn't already include, in the server's order (the
 * server also matches fields the index doesn't hold). Without index matches,
 * the server's results as they are.
 */
export function mergeSearchResults<T extends { Id?: string | null }>(
  indexed: T[] | undefined,
  server: T[] | undefined,
): T[] | undefined {
  if (!indexed?.length) return server;
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const item of [...indexed, ...(server ?? [])]) {
    const id = item.Id ? normalizedId(item.Id) : null;
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    merged.push(item);
  }
  return merged;
}
