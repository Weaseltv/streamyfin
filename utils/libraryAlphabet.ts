import type {
  BaseItemDto,
  BaseItemDtoQueryResult,
} from "@jellyfin/sdk/lib/generated-client/models";

export const LIBRARY_ALPHABET = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
export const ALPHABET_RAIL_WIDTH = 28;
const INDEX_PAGE_SIZE = 1000;

export type AlphabetEntry = {
  letter: string;
  index: number;
  itemId: string;
};

export function getLibraryLetter(item: Pick<BaseItemDto, "SortName" | "Name">) {
  // Use the server's sort title, including custom sort titles and its article
  // handling. Do not re-sort locally: the server's collation is authoritative.
  const initial = (item.SortName || item.Name || "")
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .charAt(0)
    .toUpperCase();
  return /^[A-Z]$/.test(initial) ? initial : "#";
}

/** Retain only letter offsets/IDs; discard each metadata batch as it arrives. */
export async function loadLibraryAlphabet(
  fetchPage: (
    startIndex: number,
    limit: number,
  ) => Promise<BaseItemDtoQueryResult>,
  signal?: AbortSignal,
) {
  const entries = new Map<string, AlphabetEntry>();
  let startIndex = 0;
  let totalCount: number | undefined;
  while (true) {
    signal?.throwIfAborted();
    const page = await fetchPage(startIndex, INDEX_PAGE_SIZE);
    signal?.throwIfAborted();
    if (
      totalCount !== undefined &&
      page.TotalRecordCount !== undefined &&
      totalCount !== page.TotalRecordCount
    ) {
      throw new Error("Library changed while building its alphabet index");
    }
    totalCount = page.TotalRecordCount ?? totalCount;
    const items = page.Items ?? [];
    for (const [offset, item] of items.entries()) {
      const letter = getLibraryLetter(item);
      if (item.Id && !entries.has(letter)) {
        entries.set(letter, {
          letter,
          index: startIndex + offset,
          itemId: item.Id,
        });
      }
    }
    startIndex += items.length;
    if (
      items.length === 0 ||
      (totalCount !== undefined && startIndex >= totalCount)
    ) {
      return {
        entries: [...entries.values()],
        totalCount: totalCount ?? startIndex,
      };
    }
  }
}

export function getNextLibraryPage(
  page: BaseItemDtoQueryResult | null,
  startIndex: number,
) {
  const count = page?.Items?.length ?? 0;
  if (!count) return undefined;
  const next = startIndex + count;
  return page?.TotalRecordCount !== undefined && next >= page.TotalRecordCount
    ? undefined
    : next;
}

export function getPreviousLibraryPage(startIndex: number, pageSize: number) {
  return startIndex > 0 ? Math.max(0, startIndex - pageSize) : undefined;
}

export function getAlphabetTouchLetter(
  y: number,
  height: number,
  letters: readonly string[],
) {
  if (height <= 0 || letters.length === 0) return undefined;
  return letters[
    Math.max(
      0,
      Math.min(letters.length - 1, Math.floor((y / height) * letters.length)),
    )
  ];
}
