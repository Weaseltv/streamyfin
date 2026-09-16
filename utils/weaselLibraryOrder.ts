import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

/**
 * WeaselPlex's preferred library order, matched on library NAME.
 *
 * The server returns user views alphabetically, which puts "4K Movies (LAN)"
 * and "4K TV Shows (LAN)" first. This mirrors the Android TV app's
 * DEFAULT_NAV_ORDER (Wholphin 015580ee): everyday libraries first, the
 * LAN-only 4K libraries last.
 */
const WEASEL_LIBRARY_ORDER = [
  "Movies",
  "TV Shows",
  "Stand Up Comedy",
  "UFC",
  "Boxing",
  "4K Movies (LAN)",
  "4K TV Shows (LAN)",
];

const orderOf = (name: string | null | undefined): number => {
  if (!name) return Number.MAX_SAFE_INTEGER;
  const trimmed = name.trim().toLowerCase();
  const idx = WEASEL_LIBRARY_ORDER.findIndex(
    (n) => n.toLowerCase() === trimmed,
  );
  return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
};

/**
 * Sort libraries into the preferred order. Array.prototype.sort is stable, so
 * any library not named above keeps its server position — the same behaviour
 * as the Android app, where a stable sortedBy leaves unlisted libraries in
 * server order.
 */
export const sortWeaselLibraries = <T extends BaseItemDto>(
  views: T[] | null | undefined,
): T[] | null => {
  if (!views) return null;
  return [...views].sort((a, b) => orderOf(a.Name) - orderOf(b.Name));
};
