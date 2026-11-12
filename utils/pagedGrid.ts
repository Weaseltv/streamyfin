import type {
  BaseItemDto,
  BaseItemDtoQueryResult,
} from "@jellyfin/sdk/lib/generated-client/models";

/**
 * A paged grid shows a tile for each title it has not loaded yet, up to
 * `tiles` of them, so a fast scroll runs on over them instead of stopping at
 * the last loaded title. The tiles carry no title: nothing is known about a title
 * until its page arrives.
 */
const PENDING_ID_PREFIX = "pending:";

export const isPendingTile = (item: Pick<BaseItemDto, "Id">) =>
  item.Id?.startsWith(PENDING_ID_PREFIX) === true;

type Pages =
  | {
      pages: (BaseItemDtoQueryResult | null)[];
      pageParams: unknown[];
    }
  | undefined;

/**
 * Where the loaded pages sit in the whole list and the tiles to draw after
 * them. `firstIndex` is the list position of the first loaded title (not 0
 * after a jump to a letter); keying each cell by its list position lets a
 * tile and the title that replaces it share a key, so the grid holds its
 * place when a page arrives.
 */
export function pagedGridAhead(
  data: Pages,
  tiles: number,
  hasNextPage: boolean,
): { firstIndex: number; pending: BaseItemDto[] } {
  const pages = data?.pages ?? [];
  if (!pages.length) return { firstIndex: 0, pending: [] };
  const firstIndex = Number(data?.pageParams[0] ?? 0) || 0;
  const loaded = pages.reduce(
    (count, page) => count + (page?.Items?.length ?? 0),
    0,
  );
  const end = firstIndex + loaded;
  if (!hasNextPage) return { firstIndex, pending: [] };
  const total = pages.at(-1)?.TotalRecordCount;
  const ahead = Math.min(
    tiles,
    total == null ? tiles : Math.max(0, total - end),
  );
  return {
    firstIndex,
    pending: Array.from({ length: ahead }, (_, offset) => ({
      Id: `${PENDING_ID_PREFIX}${end + offset}`,
    })),
  };
}

/**
 * True when the last title on screen is close enough to the last loaded title
 * that the next page should be asked for now: within 60 % of a page, but
 * never before the viewer is halfway through what is loaded, so opening a
 * list and not scrolling asks for nothing more.
 */
export const nearLoadedEnd = (
  lastVisibleIndex: number,
  loadedCount: number,
  pageSize: number,
) =>
  lastVisibleIndex >=
  loadedCount -
    Math.min(Math.floor(pageSize * 0.6), Math.floor(loadedCount / 2));
