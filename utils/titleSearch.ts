import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";

/**
 * Fuzzy title search, as on WeaselPlex TV (owner, 2026-10-16: "MASH" found
 * nothing, "M.A.S.H." found M*A*S*H; spoken "mob land" missed MobLand). The
 * server matches substrings of names with punctuation turned into spaces, so
 * the app keeps its own index of the member's movies, shows and collections
 * and matches on a key without spaces or punctuation. In each of those search
 * sections its matches come first, then the server's own results, then its
 * typo matches.
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
  /** Where each of the name's words starts in the key: typos only match from there */
  starts: number[];
};

export type TitleIndex = {
  /** `serverId:userId`: the index is per member */
  owner: string;
  /** When it was fetched */
  at: number;
  titles: TitleEntry[];
};

/** At most this many matches (tiers 0–2) per section… */
const MAX_MATCHES = 50;
/** …and this many typo matches (tier 3). */
const MAX_TYPOS = 10;

const fold = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, "and");

/**
 * Accents and case fold away, "&" reads "and", and only letters and digits
 * stay (Unicode-aware, so non-Latin titles still work): "M*A*S*H", "M.A.S.H."
 * and "MASH" are all "mash", "Law & Order" is "lawandorder".
 */
export function searchKey(text: string): string {
  return fold(text).replace(/[^\p{L}\p{N}]/gu, "");
}

/** A name's key and where its words (runs of letters and digits) start in it. */
export function titleKey(name: string): { key: string; starts: number[] } {
  const words = fold(name).match(/[\p{L}\p{N}]+/gu) ?? [];
  const starts: number[] = [];
  let offset = 0;
  for (const word of words) {
    starts.push(offset);
    offset += word.length;
  }
  return { key: words.join(""), starts };
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
            ...titleKey(item.Name),
          },
        ]
      : [],
  );
}

/** Bump when the key or its word starts change, so saved ones are worked out again. */
const INDEX_VERSION = 2;

/** The compact form kept on the device: one `[id, name, type, year, key, starts]` per title. */
export function serializeTitleIndex(index: TitleIndex): string {
  return JSON.stringify({
    v: INDEX_VERSION,
    owner: index.owner,
    at: index.at,
    titles: index.titles.map((t) => [
      t.id,
      t.name,
      t.type,
      t.year,
      t.key,
      t.starts,
    ]),
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
      const [id, name, type, year, key, starts] = row;
      if (
        typeof id !== "string" ||
        typeof name !== "string" ||
        !isTitleType(type) ||
        typeof key !== "string" ||
        !Array.isArray(starts) ||
        !starts.every((start) => typeof start === "number")
      )
        continue;
      titles.push({
        id,
        name,
        type,
        year: typeof year === "number" ? year : null,
        key,
        starts,
      });
    }
    return { owner, at: saved.at, titles };
  } catch {
    return undefined;
  }
}

/**
 * How many typos a query of this length may have: none under 5 characters
 * ("mash" found "Christmas" and "Flash"), 1 up to 8, 2 from 9.
 */
export function typoTolerance(length: number) {
  return length >= 9 ? 2 : length >= 5 ? 1 : 0;
}

/**
 * The smallest edit distance between [query] and the start of a key from any
 * of its word starts (the match may end anywhere), for distances up to [k];
 * anything above [k] comes back as some number above [k]. Only the band of
 * cells within [k] of the diagonal can be within [k], so that's all it works
 * out, in two rows reused for every key: ~12k titles stay quick per query.
 */
export function wordStartDistance(query: string, k: number) {
  const m = query.length;
  const pattern = new Uint16Array(m);
  for (let i = 0; i < m; i++) pattern[i] = query.charCodeAt(i);
  const width = m + k + 1;
  let previous = new Int32Array(width);
  let current = new Int32Array(width);
  const over = k + 1;

  const fromStart = (key: string, start: number): number => {
    // Past m + k characters the distance only grows
    const length = Math.min(key.length - start, m + k);
    if (length < m - k) return over;
    for (let j = 0; j <= Math.min(length, k); j++) previous[j] = j;
    for (let i = 1; i <= m; i++) {
      const low = Math.max(0, i - k);
      const high = Math.min(length, i + k);
      const c = pattern[i - 1];
      let rowBest = over;
      for (let j = low; j <= high; j++) {
        let value = i;
        if (j > 0) {
          value =
            previous[j - 1] + (key.charCodeAt(start + j - 1) === c ? 0 : 1);
          if (j <= i - 1 + k && previous[j] + 1 < value)
            value = previous[j] + 1;
          if (j > low && current[j - 1] + 1 < value) value = current[j - 1] + 1;
        }
        current[j] = value;
        if (value < rowBest) rowBest = value;
      }
      // Rows never get better, so this start is out
      if (rowBest > k) return over;
      const swap = previous;
      previous = current;
      current = swap;
    }
    let best = over;
    for (let j = Math.max(0, m - k); j <= Math.min(length, m + k); j++) {
      if (previous[j] < best) best = previous[j];
    }
    return best;
  };

  return (key: string, starts: readonly number[]): number => {
    let best = over;
    for (const start of starts) {
      const distance = fromStart(key, start);
      if (distance < best) best = distance;
      if (best === 0) break;
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

const byName = (a: Ranked, b: Ranked) =>
  a.title.name < b.title.name ? -1 : a.title.name > b.title.name ? 1 : 0;
// Remaining ties keep the index's sort-name order
const byMatch = (a: Ranked, b: Ranked) =>
  a.tier - b.tier ||
  a.title.key.length - b.title.key.length ||
  byName(a, b) ||
  a.position - b.position;
const byTypo = (a: Ranked, b: Ranked) =>
  a.distance - b.distance ||
  a.title.key.length - b.title.key.length ||
  byName(a, b) ||
  a.position - b.position;

/** One section's matches: tiers 0–2, and typos (tier 3), each best first. */
export type SectionMatches = { matches: TitleEntry[]; typos: TitleEntry[] };
export type TitleMatches = Record<TitleType, SectionMatches>;

/**
 * The index's matches for [query]. Matches: the key itself (tier 0), keys
 * starting with it (1), keys containing it (2), by tier, then the shorter
 * key, then the name, at most 50 per type. Typos, for 5+ characters: keys
 * within 1 edit (5–8 characters) or 2 (9+) from one of the name's word
 * starts (3), the closest first, then the shorter key, then the name, at most
 * 10 per type. Under 2 characters, nothing.
 */
export function matchTitles(
  titles: readonly TitleEntry[],
  query: string,
): TitleMatches {
  const found = {
    Movie: { matches: [] as Ranked[], typos: [] as Ranked[] },
    Series: { matches: [] as Ranked[], typos: [] as Ranked[] },
    BoxSet: { matches: [] as Ranked[], typos: [] as Ranked[] },
  };
  const q = searchKey(query);
  if (q.length >= 2) {
    const k = typoTolerance(q.length);
    const distance = k > 0 ? wordStartDistance(q, k) : null;
    for (let position = 0; position < titles.length; position++) {
      const title = titles[position];
      const key = title.key;
      const tier =
        key === q ? 0 : key.startsWith(q) ? 1 : key.includes(q) ? 2 : 3;
      if (tier < 3) {
        found[title.type].matches.push({ title, tier, distance: 0, position });
      } else if (distance) {
        const d = distance(key, title.starts);
        if (d <= k)
          found[title.type].typos.push({ title, tier, distance: d, position });
      }
    }
  }
  const section = (type: TitleType): SectionMatches => ({
    matches: found[type].matches
      .sort(byMatch)
      .slice(0, MAX_MATCHES)
      .map((match) => match.title),
    typos: found[type].typos
      .sort(byTypo)
      .slice(0, MAX_TYPOS)
      .map((match) => match.title),
  });
  return {
    Movie: section("Movie"),
    Series: section("Series"),
    BoxSet: section("BoxSet"),
  };
}

const normalizedId = (id: string) => id.replace(/-/g, "").toLowerCase();

export type IndexedItems = { matches: BaseItemDto[]; typos: BaseItemDto[] };

/**
 * A section's matches and typos as items, each in rank order, fetched in one
 * request with the options the search sections use so the cards look the
 * same. Anything the member can't see simply doesn't come back.
 */
export async function loadIndexedTitles(
  api: Api,
  userId: string,
  matchIds: readonly string[],
  typoIds: readonly string[],
  signal?: AbortSignal,
): Promise<IndexedItems> {
  if (matchIds.length === 0 && typoIds.length === 0)
    return { matches: [], typos: [] };
  const response = await getItemsApi(api).getItems(
    { userId, ids: [...matchIds, ...typoIds] },
    { signal },
  );
  const byId = new Map<string, BaseItemDto>();
  for (const item of response.data.Items ?? []) {
    if (item.Id) byId.set(normalizedId(item.Id), item);
  }
  const inOrder = (ids: readonly string[]) =>
    ids
      .map((id) => byId.get(normalizedId(id)))
      .filter((item): item is BaseItemDto => item !== undefined);
  return { matches: inOrder(matchIds), typos: inOrder(typoIds) };
}

/**
 * A section's results: the index's matches first, in rank order, then the
 * server's own results they didn't include, in the server's order (the
 * server also matches fields the index doesn't hold), then the typo matches
 * not already shown, so a guess never buries a real match. Without index
 * matches, the server's results as they are.
 */
export function mergeSearchResults<T extends { Id?: string | null }>(
  indexed: { matches: T[]; typos: T[] } | undefined,
  server: T[] | undefined,
): T[] | undefined {
  if (!indexed || (!indexed.matches.length && !indexed.typos.length))
    return server;
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const item of [
    ...indexed.matches,
    ...(server ?? []),
    ...indexed.typos,
  ]) {
    const id = item.Id ? normalizedId(item.Id) : null;
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    merged.push(item);
  }
  return merged;
}
