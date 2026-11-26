import { BaseItemKind } from "@jellyfin/sdk/lib/generated-client";
import {
  decideKidContent,
  hasKidFacts,
  type KidItemFacts,
  needsSeries,
} from "./kidContentRules";

const itemKinds = new Set<string>(Object.values(BaseItemKind));
const itemMarkers = ["ServerId", "IsFolder", "MediaType"];

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function strings(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  return Array.isArray(value)
    ? value.filter((entry) => typeof entry === "string")
    : [];
}

export function normalizeKidItemId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

function itemId(item: Record<string, unknown>): string | undefined {
  const id = string(item.Id) ?? string(item.ItemId);
  return id && normalizeKidItemId(id);
}

export function isKidItem(value: unknown): value is Record<string, unknown> {
  if (!isObject(value) || !itemId(value) || typeof value.Type !== "string")
    return false;
  return (
    itemKinds.has(value.Type) ||
    itemMarkers.some((key) => Object.hasOwn(value, key))
  );
}

export function kidFacts(item: Record<string, unknown>): KidItemFacts {
  const seriesId = string(item.SeriesId);
  return {
    id: itemId(item),
    type: string(item.Type),
    name: string(item.Name),
    officialRating: string(item.OfficialRating),
    genres: strings(item.Genres),
    premiereDate: string(item.PremiereDate),
    productionYear: Number.isInteger(item.ProductionYear)
      ? Number(item.ProductionYear)
      : undefined,
    lockedFields: strings(item.LockedFields),
    seriesId: seriesId && normalizeKidItemId(seriesId),
  };
}

export function listKidItems(root: unknown): Record<string, unknown>[] {
  const list = isObject(root) ? root.Items : root;
  return Array.isArray(list) ? list.filter(isKidItem) : [];
}

export function visitKidItems(
  root: unknown,
  visit: (item: Record<string, unknown>) => void,
) {
  if (Array.isArray(root)) {
    for (const value of root) visitKidItems(value, visit);
  } else if (isObject(root)) {
    if (isKidItem(root)) visit(root);
    for (const value of Object.values(root)) visitKidItems(value, visit);
  }
}

export interface KidFactsLoader {
  items(ids: Set<string>): Promise<Map<string, KidItemFacts>>;
  boxSetHasVisibleChild(id: string): Promise<boolean>;
}

export async function decideKidItems(
  facts: KidItemFacts[],
  maxLevel: number | undefined,
  loader: KidFactsLoader,
  boxSetsAsRowSources = false,
): Promise<boolean[]> {
  if (maxLevel === undefined) {
    return facts.map(
      (item) =>
        item.type !== "BoxSet" && decideKidContent(item, maxLevel) === "show",
    );
  }
  const missing = new Set<string>();
  for (const item of facts) {
    if (item.id && !hasKidFacts(item)) missing.add(item.id);
  }
  const loaded = await loader.items(missing);
  const resolved = facts.map((item) =>
    hasKidFacts(item) ? item : item.id ? loaded.get(item.id) : undefined,
  );

  const series = new Map<string, KidItemFacts>();
  for (const item of resolved) {
    if (item?.type === "Series" && item.id && item.genres)
      series.set(item.id, item);
  }
  const seriesIds = new Set<string>();
  for (const item of resolved) {
    if (item?.seriesId && needsSeries(item.type) && !series.has(item.seriesId))
      seriesIds.add(item.seriesId);
  }
  for (const [id, item] of await loader.items(seriesIds)) series.set(id, item);

  const boxSets = new Map<string, Promise<boolean>>();
  return Promise.all(
    resolved.map(async (item) => {
      if (!item) return false;
      if (item.type === "BoxSet") {
        if (!item.id) return false;
        if (boxSetsAsRowSources) return true;
        let visible = boxSets.get(item.id);
        if (!visible) {
          visible = loader.boxSetHasVisibleChild(item.id);
          boxSets.set(item.id, visible);
        }
        return visible;
      }
      return (
        decideKidContent(
          item,
          maxLevel,
          item.seriesId ? series.get(item.seriesId) : undefined,
        ) === "show"
      );
    }),
  );
}

export async function filterKidResponse(
  root: unknown,
  maxLevel: number | undefined,
  loader: KidFactsLoader,
  boxSetsAsRowSources = false,
): Promise<{ root: unknown; hidden: boolean; removed: number }> {
  const items: Record<string, unknown>[] = [];
  visitKidItems(root, (item) => items.push(item));
  if (!items.length) return { root, hidden: false, removed: 0 };
  const decisions = await decideKidItems(
    items.map(kidFacts),
    maxLevel,
    loader,
    boxSetsAsRowSources,
  );
  const hidden = new Set<unknown>(
    items.filter((_, index) => !decisions[index]),
  );
  if (hidden.has(root)) return { root: null, hidden: true, removed: 0 };
  if (!hidden.size) return { root, hidden: false, removed: 0 };

  let removed = 0;
  const mainList = isObject(root) ? root.Items : root;
  function rebuild(value: unknown): unknown {
    if (Array.isArray(value)) {
      const kept = value.filter((entry) => !hidden.has(entry));
      if (value === mainList) removed = value.length - kept.length;
      return kept.map(rebuild);
    }
    if (!isObject(value)) return value;
    let removedFromArrays = 0;
    const fields = Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) => {
        if (hidden.has(entry)) return [];
        const filtered = rebuild(entry);
        if (Array.isArray(entry) && Array.isArray(filtered)) {
          removedFromArrays += entry.length - filtered.length;
        }
        return [[key, filtered]];
      }),
    );
    if (typeof value.TotalRecordCount === "number" && removedFromArrays > 0) {
      fields.TotalRecordCount = Math.max(
        0,
        value.TotalRecordCount - removedFromArrays,
      );
    }
    return fields;
  }
  return { root: rebuild(root), hidden: false, removed };
}
