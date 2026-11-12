import { describe, expect, test } from "bun:test";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/query-core";
import { findLibraryStandIn, libraryGridItemType } from "./libraryStandIn";

const LIBRARY_ID = "f137a2dd21bbc1b99aa5c0f6bf02a805";
/** The library as the list of libraries gives it. */
const listEntry: BaseItemDto = {
  Id: LIBRARY_ID,
  Name: "Movies",
  Type: "CollectionFolder",
  CollectionType: "movies",
};
/** The same library as its own request gives it: the same, and more. */
const fullItem: BaseItemDto = {
  ...listEntry,
  ServerId: "server",
  Etag: "etag",
  DateCreated: "2026-01-01T00:00:00.0000000Z",
  ChildCount: 4100,
  DisplayPreferencesId: "prefs",
  UserData: { Played: false, PlaybackPositionTicks: 0 },
};
const views: BaseItemDto[] = [
  { Id: "shows", Name: "TV Shows", CollectionType: "tvshows" },
  listEntry,
  { Id: "collections", Name: "Collections", CollectionType: "boxsets" },
];
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

describe("findLibraryStandIn", () => {
  test("is the library's own entry in the list", () => {
    expect(findLibraryStandIn(views, LIBRARY_ID)).toBe(listEntry);
  });
  test("is nothing when the list is not there, or does not hold the library", () => {
    expect(findLibraryStandIn(undefined, LIBRARY_ID)).toBeUndefined();
    expect(findLibraryStandIn(null, LIBRARY_ID)).toBeUndefined();
    expect(findLibraryStandIn(views, "another-library")).toBeUndefined();
    expect(findLibraryStandIn(views, undefined)).toBeUndefined();
    expect(findLibraryStandIn(views, "")).toBeUndefined();
  });
});

describe("libraryGridItemType", () => {
  test("lists one kind of item for a typed library, anything for the rest", () => {
    expect(libraryGridItemType("movies")).toBe("Movie");
    expect(libraryGridItemType("tvshows")).toBe("Series");
    expect(libraryGridItemType("boxsets")).toBe("BoxSet");
    expect(libraryGridItemType("homevideos")).toBe("Video");
    expect(libraryGridItemType("musicvideos")).toBe("MusicVideo");
    expect(libraryGridItemType("playlists")).toBe("Playlist");
    expect(libraryGridItemType("livetv")).toBeUndefined();
    expect(libraryGridItemType(undefined)).toBeUndefined();
    expect(libraryGridItemType(null)).toBeUndefined();
  });
  test("is the same for the list entry and the full item", () => {
    expect(libraryGridItemType(listEntry.CollectionType)).toBe(
      libraryGridItemType(fullItem.CollectionType),
    );
  });
});

/**
 * The library page's grid, as far as the library record reaches into it
 * (`app/(auth)/(tabs)/(libraries)/[libraryId].tsx`): the request is named by
 * the library's id and the filters, takes its item type from the record, and
 * runs once a record is there and the filters are ready.
 */
describe("the swap from the list entry to the full item", () => {
  const grid = (
    library: BaseItemDto | undefined,
    onRequest: (itemType: string | undefined) => void,
    staleTime: number,
    filtersReady = true,
  ) => ({
    queryKey: ["library-items", LIBRARY_ID, [], [], [], ["SortName"], 0, 36],
    // A new function for every record, as a re-created request would be
    queryFn: async () => {
      const itemType = libraryGridItemType(library?.CollectionType);
      onRequest(itemType);
      return { Items: [{ Id: "one" }, { Id: "two" }], TotalRecordCount: 2 };
    },
    initialPageParam: 0,
    getNextPageParam: () => undefined,
    enabled: !!library && filtersReady,
    staleTime,
  });

  // 0 is the page's freshness under a playback filter or sort, where any
  // excuse to ask again would be taken.
  for (const staleTime of [0, 60_000]) {
    test(`neither asks again nor replaces the grid (fresh for ${staleTime} ms)`, async () => {
      const client = new QueryClient();
      const requests: (string | undefined)[] = [];
      const onRequest = (itemType: string | undefined) => {
        requests.push(itemType);
      };
      const observer = new InfiniteQueryObserver(
        client,
        grid(findLibraryStandIn(views, LIBRARY_ID), onRequest, staleTime),
      );
      const unsubscribe = observer.subscribe(() => {});
      await tick(5);
      // The grid starts from the list entry, already asking for movies only
      expect(requests).toEqual(["Movie"]);
      const shown = observer.getCurrentResult().data;
      expect(shown?.pages).toHaveLength(1);
      await tick(5);

      observer.setOptions(grid(fullItem, onRequest, staleTime));
      await tick(5);
      expect(requests).toEqual(["Movie"]);
      expect(observer.getCurrentResult().data).toBe(shown);
      expect(observer.getCurrentResult().isFetching).toBe(false);
      // The list entry was never stored as the library's record
      expect(client.getQueryData(["library", LIBRARY_ID])).toBeUndefined();
      unsubscribe();
      client.clear();
    });
  }

  test("the filter gate still holds the grid back with a list entry in hand", async () => {
    const client = new QueryClient();
    const requests: (string | undefined)[] = [];
    const onRequest = (itemType: string | undefined) => {
      requests.push(itemType);
    };
    const observer = new InfiniteQueryObserver(
      client,
      grid(listEntry, onRequest, 60_000, false),
    );
    const unsubscribe = observer.subscribe(() => {});
    await tick(5);
    expect(requests).toEqual([]);
    observer.setOptions(grid(listEntry, onRequest, 60_000, true));
    await tick(5);
    expect(requests).toEqual(["Movie"]);
    unsubscribe();
    client.clear();
  });
});
