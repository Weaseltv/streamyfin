import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

/**
 * The Collections page's group buttons, as on WeaselPlex TV
 * (`CollectionGroups.kt`): each collection's group is its first
 * `WeaselPlex Group: <name>` tag, and the groups appear in the owner's order,
 * with any others after them by name.
 */
export const GROUP_TAG_PREFIX = "WeaselPlex Group: ";

export const GROUP_ORDER: readonly string[] = [
  "New & Trending",
  "Moods & Picks",
  "TV Binges",
  "Top Episodes",
  "Based On",
  "Charts & Awards",
  "Sports",
  "Studios",
  "TV Networks",
  "Actors & Directors",
  "Franchises & Universes",
  "Streaming Services",
];

/** The tag that puts a collection in [group]. */
export const groupTag = (group: string) => `${GROUP_TAG_PREFIX}${group}`;

/** A collection's group, from its first group tag with a name. */
export function collectionGroup(
  item: Pick<BaseItemDto, "Tags">,
): string | undefined {
  for (const tag of item.Tags ?? []) {
    if (!tag.startsWith(GROUP_TAG_PREFIX)) continue;
    const name = tag.slice(GROUP_TAG_PREFIX.length).trim();
    if (name) return name;
  }
  return undefined;
}

const rank = (group: string | undefined) => {
  if (group === undefined) return Number.MAX_SAFE_INTEGER;
  const index = GROUP_ORDER.indexOf(group);
  return index < 0 ? GROUP_ORDER.length : index;
};

/** The groups [items] use, in the owner's order, then any others by name. */
export function orderedGroups(
  items: readonly Pick<BaseItemDto, "Tags">[],
): string[] {
  const groups = new Set<string>();
  for (const item of items) {
    const group = collectionGroup(item);
    if (group) groups.add(group);
  }
  return [...groups].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * [items] (already sorted by name) group by group, as the TV's ALL shows
 * them: the owner's order, other groups by name, untagged collections last.
 * The sort is stable, so names stay in order within each group.
 */
export function inGroupOrder<T extends Pick<BaseItemDto, "Tags">>(
  items: readonly T[],
): T[] {
  return items
    .map((item, index) => ({ item, index, group: collectionGroup(item) }))
    .sort(
      (a, b) =>
        rank(a.group) - rank(b.group) ||
        (a.group ?? "").localeCompare(b.group ?? "") ||
        a.index - b.index,
    )
    .map(({ item }) => item);
}
