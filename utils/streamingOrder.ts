import { storage } from "./mmkv";

const orderKey = (userId: string) => `${userId}_streaming_services_order`;

/**
 * The member's own Streaming Services order on this device (collection ids),
 * saved like WeaselPlex TV saves it: per member, on the device, not on the
 * server.
 */
export function loadStreamingOrder(userId: string): string[] {
  try {
    const saved = JSON.parse(storage.getString(orderKey(userId)) ?? "[]");
    return Array.isArray(saved)
      ? saved.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

/** Save the member's order; an empty list resets to the default order. */
export function saveStreamingOrder(userId: string, ids: readonly string[]) {
  storage.set(orderKey(userId), JSON.stringify(ids));
}
