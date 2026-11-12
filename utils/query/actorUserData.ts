import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

/** Patch only matching cards; preserve array/item identities on no-op messages. */
export function patchActorUserData(items: unknown, updates: unknown): unknown {
  if (!Array.isArray(items) || !Array.isArray(updates)) return items;
  const byId = new Map<string, Record<string, unknown>>();
  for (const update of updates) {
    if (!update || typeof update !== "object") continue;
    const { ItemId, ...userData } = update;
    if (typeof ItemId === "string") byId.set(ItemId, userData);
  }
  let changed = false;
  const next = items.map((item: BaseItemDto) => {
    const update = item?.Id ? byId.get(item.Id) : undefined;
    if (
      !update ||
      !Object.entries(update).some(
        ([key, value]) =>
          (item.UserData as Record<string, unknown> | undefined)?.[key] !==
          value,
      )
    )
      return item;
    changed = true;
    return { ...item, UserData: { ...item.UserData, ...update } };
  });
  return changed ? next : items;
}
