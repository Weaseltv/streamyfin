import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Jellyfin } from "@jellyfin/sdk";
import {
  getItemsApi,
  getMediaInfoApi,
  getTvShowsApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
import axios, { AxiosHeaders, type AxiosInstance } from "axios";
import {
  checkKidPlayback,
  getKidHomeCollections,
  installKidContentGuard,
} from "./kidContentGuard";

const jellyfin = new Jellyfin({
  clientInfo: { name: "WeaselPlex", version: "test" },
  deviceInfo: { name: "Phone", id: "test-device" },
});
const basePath = "https://jellyfin.example/subpath";
const movie = (
  Id: string,
  OfficialRating: string,
  Genres = ["Comedy"],
  ProductionYear = 2000,
) => ({
  Id,
  Type: "Movie",
  OfficialRating,
  Genres,
  ProductionYear,
  LockedFields: [],
});
const boxSet = (Id: string) => ({ Id, Type: "BoxSet" });
const moonstruck = movie("moonstruck", "PG", ["Comedy", "Drama"], 1987);
const poltergeist = movie("poltergeist", "PG", ["Horror"], 1982);
const pinkPanther = movie("pinkpanther", "PG", ["Comedy"], 1963);
const ginny = {
  Id: "ginny",
  Type: "Series",
  OfficialRating: "TV-MA",
  Genres: ["Drama"],
};
const episode = (Id: string, Type = "Episode") => ({
  Id,
  Type,
  SeriesId: "ginny",
  Genres: [],
  OfficialRating: "TV-G",
});
const listing = (Items: unknown[], TotalRecordCount = Items.length) => ({
  Items,
  TotalRecordCount,
});
const ids = (data: { Items?: { Id?: string | null }[] | null }) =>
  data.Items?.map((item) => item.Id);

type Reply = (path: string, query: URLSearchParams) => unknown;

function fixture(
  ceiling: number | undefined,
  reply: Reply,
  facts: Reply = () => listing([]),
) {
  const requests: string[] = [];
  const lookups: { url: URL; auth: string }[] = [];
  const transport = (
    handle: Reply,
    seen: (url: URL, auth: string) => void,
  ): AxiosInstance => {
    const client = axios.create({
      adapter: async (config) => {
        const url = new URL(client.getUri(config));
        expect(url.pathname.startsWith("/subpath/")).toBe(true);
        seen(url, String(config.headers.get("Authorization")));
        const data = handle(
          url.pathname.slice("/subpath".length),
          url.searchParams,
        );
        if (data instanceof Error) throw data;
        return {
          data,
          status: 200,
          statusText: "OK",
          headers: new AxiosHeaders({
            "content-type":
              typeof data === "string" ? "application/json" : undefined,
          }),
          config,
        };
      },
    });
    return client;
  };

  const api = jellyfin.createApi(
    basePath,
    "kid-session",
    transport(reply, (url) => requests.push(url.pathname + url.search)),
  );
  if (ceiling !== undefined) {
    installKidContentGuard(
      api,
      transport(facts, (url, auth) => lookups.push({ url, auth })),
      ceiling,
    );
  }
  return { api, lookups, requests };
}

describe("TV kid content checkpoint", () => {
  // In a full Bun run, Axios's V8 stack rewrite can throw on its plain
  // object target and replace the actual HTTP error we need to assert.
  const captureStackTrace = Object.getOwnPropertyDescriptor(
    Error,
    "captureStackTrace",
  );
  beforeAll(() => {
    Reflect.deleteProperty(Error, "captureStackTrace");
  });
  afterAll(() => {
    if (captureStackTrace)
      Object.defineProperty(Error, "captureStackTrace", captureStackTrace);
  });

  test("adults go straight through and kid library requests add rule fields and remove hidden titles", async () => {
    const films = [
      poltergeist,
      pinkPanther,
      moonstruck,
      movie("angrymen", "NR"),
      movie("locked", "R"),
    ];
    const adult = fixture(undefined, () => listing(films));
    expect(ids((await getItemsApi(adult.api).getItems({})).data)).toEqual(
      films.map((item) => item.Id),
    );
    expect(adult.requests[0]).toBe("/subpath/Items");

    for (const [ceiling, expected] of [
      [14, ["pinkpanther", "moonstruck"]],
      [10, ["moonstruck"]],
    ] as const) {
      const kid = fixture(ceiling, (_, query) => {
        expect(query.get("fields")).toBe("Overview,Genres,Settings");
        return listing(films, 40);
      });
      const result = await getItemsApi(kid.api).getItems({
        fields: ["Overview"],
      });
      expect(ids(result.data)).toEqual(expected);
      expect(result.data.TotalRecordCount).toBe(
        40 - films.length + expected.length,
      );
      expect(kid.lookups).toHaveLength(0);
    }
  });

  test("top-level arrays, nested fields and nested query counts are filtered independently", async () => {
    const { api } = fixture(10, () => [
      poltergeist,
      { Related: listing([poltergeist, moonstruck], 9), Hidden: poltergeist },
      { Type: "Button", Id: "button", Name: "An ordinary object" },
      { Type: "FutureKind", Id: "unknown", ServerId: "jellyfin", Genres: [] },
    ]);
    const result = await api.axiosInstance.get(
      api.getUri("/Movies/Recommendations"),
    );
    expect(result.data).toEqual([
      { Related: listing([moonstruck], 8) },
      { Type: "Button", Id: "button", Name: "An ordinary object" },
    ]);
  });

  test("a hidden item is a 404 whether it is the response or an item named in the path", async () => {
    const { api, requests, lookups } = fixture(
      14,
      () => poltergeist,
      () => poltergeist,
    );
    await expect(
      getUserLibraryApi(api).getItem({ itemId: poltergeist.Id }),
    ).rejects.toMatchObject({
      response: { status: 404 },
    });
    await expect(
      getUserLibraryApi(api).getSpecialFeatures({ itemId: poltergeist.Id }),
    ).rejects.toMatchObject({
      response: { status: 404 },
    });
    expect(requests).toEqual(["/subpath/Items/poltergeist"]);
    expect(lookups).toHaveLength(1);
    expect(lookups[0].auth).toContain('Token="kid-session"');
  });

  test("search hints and missing locked fields are hydrated as the same kid, and lookup failures hide titles", async () => {
    const { api, lookups } = fixture(
      10,
      () => ({
        SearchHints: [
          { ItemId: "MOON-STRUCK", Type: "Movie" },
          { ...pinkPanther, LockedFields: null },
          { ItemId: "missing", Type: "Movie" },
        ],
        TotalRecordCount: 3,
      }),
      (_, query) => {
        expect(query.get("fields")).toBe("Genres,Settings");
        expect(query.get("ids")).toBe("moonstruck,pinkpanther,missing");
        return listing([
          moonstruck,
          { ...pinkPanther, LockedFields: ["OfficialRating"] },
        ]);
      },
    );
    const search = await api.axiosInstance.get(api.getUri("/Search/Hints"));
    expect(
      search.data.SearchHints.map(
        (item: { ItemId?: string; Id?: string }) => item.ItemId ?? item.Id,
      ),
    ).toEqual(["MOON-STRUCK", "pinkpanther"]);
    expect(search.data.TotalRecordCount).toBe(2);
    expect(lookups[0].auth).toContain('Token="kid-session"');

    const offline = fixture(
      10,
      () => listing([{ Id: moonstruck.Id, Type: "Movie" }]),
      () => new Error("offline"),
    );
    expect(ids((await getItemsApi(offline.api).getItems({})).data)).toEqual([]);
  });

  test("Next Up hides a blocked series' episodes and loads its facts once", async () => {
    const { api, lookups } = fixture(
      14,
      () =>
        listing([
          episode("first"),
          episode("second"),
          episode("season", "Season"),
        ]),
      (_, query) => {
        expect(query.get("ids")).toBe("ginny");
        return listing([ginny]);
      },
    );
    expect(ids((await getTvShowsApi(api).getNextUp({})).data)).toEqual([]);
    expect(ids((await getTvShowsApi(api).getNextUp({})).data)).toEqual([]);
    expect(lookups).toHaveLength(1);

    const embedded = fixture(14, () => listing([ginny, episode("first")]));
    expect(ids((await getTvShowsApi(embedded.api).getNextUp({})).data)).toEqual(
      [],
    );
    expect(embedded.lookups).toHaveLength(0);
  });

  test("a changed rating stops PlaybackInfo and the player's separate fresh check", async () => {
    let current = moonstruck;
    const { api, lookups, requests } = fixture(
      10,
      (path) =>
        path.endsWith("PlaybackInfo")
          ? { MediaSources: [] }
          : listing([current]),
      () => current,
    );
    expect(ids((await getItemsApi(api).getItems({})).data)).toEqual([
      moonstruck.Id,
    ]);
    await getMediaInfoApi(api).getPlaybackInfo({ itemId: moonstruck.Id });
    expect(await checkKidPlayback(api, moonstruck.Id, false)).toBe(true);
    current = { ...moonstruck, OfficialRating: "R" };
    await expect(
      getMediaInfoApi(api).getPlaybackInfo({ itemId: moonstruck.Id }),
    ).rejects.toMatchObject({
      response: { status: 404 },
    });
    expect(await checkKidPlayback(api, moonstruck.Id, false)).toBe(false);
    expect(await checkKidPlayback(api, moonstruck.Id, true)).toBe(false);
    expect(lookups).toHaveLength(4);
    expect(
      requests.filter((request) => request.endsWith("PlaybackInfo")),
    ).toHaveLength(1);
  });

  test("an unknown ceiling shows containers and no titles, and Horror leaves both genre filters", async () => {
    const library = { Id: "movies", Type: "CollectionFolder", Name: "Movies" };
    const { api, lookups } = fixture(NaN, (path) =>
      path.startsWith("/Items/Filters")
        ? {
            Genres: [
              "Horror-Comedy",
              "Comedy",
              { Name: "HORROR" },
              { Name: "Drama" },
            ],
            Years: [1990],
          }
        : listing([
            library,
            moonstruck,
            boxSet("empty"),
            { Id: "horror", Type: "Genre", Name: "Horror" },
          ]),
    );
    expect(ids((await getItemsApi(api).getItems({})).data)).toEqual([
      library.Id,
    ]);
    expect(lookups).toHaveLength(0);
    for (const path of ["/Items/Filters", "/Items/Filters2"]) {
      const { data } = await api.axiosInstance.get(api.getUri(path));
      expect(data).toEqual({
        Genres: ["Comedy", { Name: "Drama" }],
        Years: [1990],
      });
    }
  });

  test("only kids Home's dedicated list skips child probes; ordinary collections page through nested sets", async () => {
    const { api, lookups } = fixture(
      10,
      () => listing([boxSet("root"), boxSet("empty")]),
      (_, query) => {
        const parent = query.get("parentId");
        if (parent === "root" && query.get("startIndex") === "0") {
          return listing(
            Array.from({ length: 100 }, () => poltergeist),
            101,
          );
        }
        if (parent === "root") return listing([boxSet("nested")], 101);
        if (parent === "nested") return listing([moonstruck]);
        return listing([poltergeist]);
      },
    );
    expect(
      (await getKidHomeCollections(api, "user")).map((item) => item.Id),
    ).toEqual(["root", "empty"]);
    expect(lookups).toHaveLength(0);
    expect(
      ids(
        (
          await getItemsApi(api).getItems({
            tags: ["WeaselPlex Kids"],
            includeItemTypes: ["BoxSet"],
            recursive: true,
            sortBy: ["SortName"],
          })
        ).data,
      ),
    ).toEqual(["root"]);
    expect(
      lookups.filter(({ url }) => url.searchParams.get("parentId") === "root"),
    ).toHaveLength(2);
    expect(
      lookups.filter(
        ({ url }) => url.searchParams.get("parentId") === "nested",
      ),
    ).toHaveLength(1);
  });

  test("a box set traversal stops at the TV request budget", async () => {
    const { api, lookups } = fixture(
      10,
      () => listing([boxSet("root")]),
      () =>
        listing(
          Array.from({ length: 100 }, () => poltergeist),
          10_000,
        ),
    );
    expect(ids((await getItemsApi(api).getItems({})).data)).toEqual([]);
    expect(lookups).toHaveLength(20);
  });

  test("unreadable JSON is rejected while a response with no media objects is unchanged", async () => {
    const malformed = fixture(10, () => "{Invalid JSON");
    await expect(
      getItemsApi(malformed.api).getItems({}),
    ).rejects.toBeInstanceOf(SyntaxError);
    const control = {
      Id: "user",
      Name: "Riley",
      Policy: { MaxParentalRating: 10 },
    };
    const { api } = fixture(10, () => control);
    expect((await api.axiosInstance.get(api.getUri("/Users/Me"))).data).toEqual(
      control,
    );
  });
});
