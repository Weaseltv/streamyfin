import { describe, expect, test } from "bun:test";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/query-core";
import {
  getAlphabetTouchLetter,
  getLibraryLetter,
  getNextLibraryPage,
  getPreviousLibraryPage,
  LIBRARY_ALPHABET,
  loadLibraryAlphabet,
} from "./libraryAlphabet";

const item = (id: number, sortName: string, name = sortName): BaseItemDto => ({
  Id: String(id),
  SortName: sortName,
  Name: name,
});

describe("library alphabet", () => {
  test("follows server sort titles, articles, accents and the # bucket", () => {
    expect(getLibraryLetter(item(1, "matrix", "The Matrix"))).toBe("M");
    expect(getLibraryLetter(item(2, "zebra", "A Custom Title"))).toBe("Z");
    expect(getLibraryLetter({ Name: "  Éclair" })).toBe("E");
    for (const name of [
      "12 Monkeys",
      "#Alive",
      '"Sr."',
      "東京",
      "",
      undefined,
    ]) {
      expect(getLibraryLetter({ Name: name })).toBe("#");
    }
  });

  test("indexes 8,324 titles in small metadata batches and retains only letter positions", async () => {
    const items = Array.from({ length: 8324 }, (_, i) =>
      item(
        i,
        i < 4
          ? "12 monkeys"
          : `${String.fromCharCode(65 + Math.floor((i - 4) / 320))} title`,
      ),
    );
    const requests: number[] = [];
    const index = await loadLibraryAlphabet(async (startIndex, limit) => {
      requests.push(startIndex);
      return {
        Items: items.slice(startIndex, startIndex + limit),
        TotalRecordCount: items.length,
      };
    });
    expect(requests).toEqual([
      0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000,
    ]);
    expect(index.totalCount).toBe(8324);
    expect(index.entries).toHaveLength(27);
    expect(index.entries.find((entry) => entry.letter === "Z")).toEqual({
      letter: "Z",
      index: 8004,
      itemId: "8004",
    });
    expect(index.entries[0]).toEqual({ letter: "#", index: 0, itemId: "0" });
  });

  test("preserves descending server order and omits unavailable letters", async () => {
    const items = [
      item(1, "zulu"),
      item(2, "zebra"),
      item(3, "matrix"),
      item(4, "alpha"),
      item(5, "42"),
    ];
    const result = await loadLibraryAlphabet(async () => ({
      Items: items,
      TotalRecordCount: items.length,
    }));
    expect(result.entries.map((entry) => [entry.letter, entry.index])).toEqual([
      ["Z", 0],
      ["M", 2],
      ["A", 3],
      ["#", 4],
    ]);
  });

  test("advances by actual returned count when a server caps the requested batch", async () => {
    const starts: number[] = [];
    const items = [item(0, "alpha"), item(1, "bravo"), item(2, "charlie")];
    const result = await loadLibraryAlphabet(async (start) => {
      starts.push(start);
      return { Items: items.slice(start, start + 2), TotalRecordCount: 3 };
    });
    expect(starts).toEqual([0, 2]);
    expect(result.entries[2].index).toBe(2);
  });

  test("stops on empty results and supports a server that omits the count", async () => {
    const starts: number[] = [];
    const result = await loadLibraryAlphabet(async (start) => {
      starts.push(start);
      return { Items: start === 0 ? [item(0, "alpha")] : [] };
    });
    expect(starts).toEqual([0, 1]);
    expect(result.totalCount).toBe(1);
    expect(
      (
        await loadLibraryAlphabet(async () => ({
          Items: [],
          TotalRecordCount: 0,
        }))
      ).entries,
    ).toEqual([]);
  });

  test("cancels a superseded filter index before requesting another batch", async () => {
    const controller = new AbortController();
    let calls = 0;
    await expect(
      loadLibraryAlphabet(async () => {
        calls++;
        controller.abort();
        return { Items: [item(1, "alpha")], TotalRecordCount: 8000 };
      }, controller.signal),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });

  test("rejects changing library counts rather than publishing wrong offsets", async () => {
    await expect(
      loadLibraryAlphabet(async (start) => ({
        Items: [item(start, "alpha")],
        TotalRecordCount: start === 0 ? 2 : 3,
      })),
    ).rejects.toThrow("Library changed");
  });

  test("touch selection clamps the rail edges and works in reverse order", () => {
    expect(getAlphabetTouchLetter(-12, 540, LIBRARY_ALPHABET)).toBe("#");
    expect(getAlphabetTouchLetter(540, 540, LIBRARY_ALPHABET)).toBe("Z");
    expect(getAlphabetTouchLetter(5400, 540, LIBRARY_ALPHABET)).toBe("Z");
    expect(getAlphabetTouchLetter(260, 540, LIBRARY_ALPHABET)).toBe("M");
    expect(
      getAlphabetTouchLetter(0, 540, [...LIBRARY_ALPHABET].reverse()),
    ).toBe("Z");
    expect(getAlphabetTouchLetter(1, 0, LIBRARY_ALPHABET)).toBeUndefined();
  });
});

describe("navigation from an arbitrary library page", () => {
  test("next offsets include the jump origin and stop on the last or empty page", () => {
    expect(
      getNextLibraryPage(
        { Items: [item(1, "Z"), item(2, "Z")], TotalRecordCount: 8324 },
        8208,
      ),
    ).toBe(8210);
    expect(
      getNextLibraryPage(
        { Items: [item(1, "Z")], TotalRecordCount: 8324 },
        8323,
      ),
    ).toBeUndefined();
    expect(
      getNextLibraryPage({ Items: [], TotalRecordCount: 8324 }, 8208),
    ).toBeUndefined();
    expect(getPreviousLibraryPage(8208, 36)).toBe(8172);
    expect(getPreviousLibraryPage(20, 36)).toBe(0);
    expect(getPreviousLibraryPage(0, 36)).toBeUndefined();
  });

  test("React Query loads both sides of a jump without gaps, duplicates or losing its origin", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const requests: number[] = [];
    const items = Array.from({ length: 110 }, (_, i) => item(i, `Title ${i}`));
    const observer = new InfiniteQueryObserver(client, {
      queryKey: ["library-items", "movies", 72],
      queryFn: async ({ pageParam }: { pageParam: number }) => {
        requests.push(pageParam);
        return {
          Items: items.slice(pageParam, pageParam + 36),
          TotalRecordCount: items.length,
        };
      },
      initialPageParam: 72,
      getNextPageParam: (page, _pages, param) =>
        getNextLibraryPage(page, param),
      getPreviousPageParam: (_page, _pages, param) =>
        getPreviousLibraryPage(param, 36),
    });
    await observer.refetch();
    expect(requests).toEqual([72]);
    expect(observer.getCurrentResult().hasPreviousPage).toBe(true);
    await observer.fetchNextPage();
    expect(observer.getCurrentResult().hasNextPage).toBe(false);
    await observer.fetchPreviousPage();
    await observer.fetchPreviousPage();
    const data = observer.getCurrentResult().data!;
    expect(data.pageParams).toEqual([0, 36, 72, 108]);
    expect(
      data.pages.flatMap((page) => page.Items.map((item) => item.Id)),
    ).toEqual(items.map((item) => item.Id));
    expect(observer.getCurrentResult().hasPreviousPage).toBe(false);
    observer.destroy();
    client.clear();
  });
});
