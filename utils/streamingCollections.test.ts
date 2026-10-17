import { describe, expect, test } from "bun:test";
import { Jellyfin } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  BaseItemDtoQueryResult,
} from "@jellyfin/sdk/lib/generated-client/models";
import axios, { type AxiosRequestConfig } from "axios";
import {
  applyStreamingOrder,
  collectionCardPresentation,
  loadStreamingCollectionAlphabet,
  loadStreamingCollectionItems,
  loadStreamingCollections,
  rowBadges,
  STREAMING_COLLECTION_TAG,
  streamingService,
  streamingServiceCode,
} from "./streamingCollections";

const collection = (name: string, children?: number): BaseItemDto => ({
  Id: name,
  Name: name,
  Type: "BoxSet",
  ChildCount: children,
});

function server(respond: (params: URLSearchParams) => BaseItemDtoQueryResult) {
  const requests: URLSearchParams[] = [];
  const headers: unknown[] = [];
  const client = axios.create({
    adapter: async (config) => {
      const url = new URL(axios.getUri(config as AxiosRequestConfig));
      requests.push(url.searchParams);
      headers.push(config.headers.get("Authorization"));
      return {
        data: respond(url.searchParams),
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    },
  });
  const jellyfin = new Jellyfin({
    clientInfo: { name: "WeaselPlex", version: "test" },
    deviceInfo: { name: "test", id: "test" },
  });
  return {
    api: jellyfin.createApi("https://jellyfin.example", "test-token", client),
    requests,
    headers,
  };
}

describe("collection poster presentation", () => {
  const layout = () => ({ width: 132 });

  test("only the exact streaming tag on BoxSets removes captions, irrespective of names", () => {
    for (const tag of [STREAMING_COLLECTION_TAG]) {
      expect(
        collectionCardPresentation(
          { Type: "BoxSet", Tags: ["Other", tag] },
          layout(),
        ).imageOnly,
      ).toBe(true);
      for (const Type of [
        "Movie",
        "Series",
        "Episode",
        "CollectionFolder",
      ] as const) {
        expect(
          collectionCardPresentation({ Type, Tags: [tag] }, layout()).imageOnly,
        ).toBe(false);
      }
    }
    for (const Tags of [
      undefined,
      null,
      [],
      ["Sports"],
      ["WeaselPlex Curated"],
      ["WeaselPlex Streaming extra"],
      ["weaselplex streaming"],
    ]) {
      expect(
        collectionCardPresentation({ Type: "BoxSet", Tags }, layout())
          .imageOnly,
      ).toBe(false);
    }
  });

  test("streaming collections keep the standard rail width", () => {
    for (const width of [116, 132]) {
      for (const tag of [STREAMING_COLLECTION_TAG]) {
        expect(
          collectionCardPresentation(
            { Type: "BoxSet", Tags: [tag] },
            { width },
          ),
        ).toEqual({ imageOnly: true, width });
      }
    }
  });
});

describe("streaming collections via the Jellyfin SDK", () => {
  test("the row query requests and retains Tags for data-driven artwork cards", async () => {
    const { api, requests } = server((params) => ({
      Items: [
        {
          ...collection("Art already carries the title", 4),
          Tags: [params.get("tags")!],
        },
      ],
    }));
    for (const load of [loadStreamingCollections]) {
      const [item] = await load(api, "member-art");
      expect(requests.at(-1)!.getAll("fields")).toContain("Tags");
      expect(
        collectionCardPresentation(item, {
          width: 132,
          viewportWidth: 390,
          gutter: 16,
          gap: 10,
        }).imageOnly,
      ).toBe(true);
      expect(item.Name).toBe("Art already carries the title");
    }
  });
  test("discovers by tag, scopes to the member, hides empty collections, and keeps the server's sort-name order", async () => {
    // The owner's order, as the server sorts it (~01 Netflix … ~23 Criterion Channel)
    const owners = [
      "Netflix",
      "YouTube",
      "Prime Video",
      "Disney+",
      "HBO Max",
      "Hulu",
      "Paramount+",
      "Showtime",
      "Peacock",
      "Apple TV",
      "Tubi",
      "Pluto TV",
      "Starz",
      "Crunchyroll",
      "Discovery+",
      "AMC+",
      "MGM+",
      "Hallmark",
      "BritBox",
      "Shudder",
      "Acorn TV",
      "Angel",
      "Criterion Channel",
    ];
    const { api, requests, headers } = server((params) => {
      // Untagged collections (Showtime Network, sports) are never returned by this query.
      if (params.get("tags") !== STREAMING_COLLECTION_TAG)
        return { Items: [collection("Showtime Network", 7)] };
      return {
        Items: [
          ...owners.map((name) => collection(name, 12)),
          collection("Empty service", 0),
        ],
      };
    });
    const items = await loadStreamingCollections(api, "member-a");
    expect(items.map((item) => item.Name)).toEqual(owners);
    expect(requests[0].get("sortBy")).toBe("SortName");
    expect(requests[0].get("sortOrder")).toBe("Ascending");
    expect(requests[0].get("userId")).toBe("member-a");
    expect(requests[0].get("includeItemTypes")).toBe("BoxSet");
    expect(requests[0].get("recursive")).toBe("true");
    expect(requests[0].getAll("fields")).toEqual([
      "ChildCount",
      "Overview",
      "Tags",
    ]);
    expect(requests[0].has("parentId")).toBe(false);
    expect(headers[0]).toContain('Token="test-token"');
    expect(headers[0]).toStartWith("MediaBrowser ");
  });

  test("probes absent/null child counts with userId and never shows an empty or unidentified tile", async () => {
    const { api, requests } = server((params) => {
      if (!params.has("parentId"))
        return {
          Items: [
            collection("Netflix"),
            { ...collection("Hulu"), ChildCount: null },
            collection("Zero", 0),
            { ...collection("Missing id", 1), Id: undefined },
          ],
        };
      return {
        Items:
          params.get("parentId") === "Netflix"
            ? [{ Id: "movie", Type: "Movie" }]
            : [],
      };
    });
    expect(
      (await loadStreamingCollections(api, "member-b")).map((i) => i.Name),
    ).toEqual(["Netflix"]);
    expect(requests).toHaveLength(3);
    for (const params of requests.slice(1)) {
      expect(params.get("userId")).toBe("member-b");
      expect(params.get("limit")).toBe("1");
    }
  });

  test("All / Movies / Shows and each sort reach the server with direct member-scoped children and page offsets", async () => {
    const { api, requests } = server((params) => ({
      Items: params.get("userId") ? [{ Id: "child" }] : [],
    }));
    for (const mediaType of ["All", "Movie", "Series"] as const) {
      for (const sortBy of [
        "SortName",
        "DateCreated",
        "PremiereDate",
      ] as const) {
        const result = await loadStreamingCollectionItems(
          api,
          "member-c",
          "discovered-id",
          {
            mediaType,
            sortBy,
            sortOrder: "Descending",
            startIndex: 18,
            limit: 18,
          },
        );
        expect(result.Items).toHaveLength(1);
        const params = requests.at(-1)!;
        expect(params.get("userId")).toBe("member-c");
        expect(params.get("parentId")).toBe("discovered-id");
        expect(params.getAll("includeItemTypes")).toEqual(
          mediaType === "All" ? ["Movie", "Series"] : [mediaType],
        );
        expect(params.get("recursive")).toBe("false");
        expect(params.get("sortBy")).toBe(sortBy);
        expect(params.get("sortOrder")).toBe("Descending");
        expect(params.get("startIndex")).toBe("18");
      }
    }
  });

  test("surfaces server failures and respects cancellation instead of pretending a service is empty", async () => {
    const { api } = server(() => {
      throw new Error("unreachable");
    });
    await expect(loadStreamingCollections(api, "member-d")).rejects.toThrow();
    const controller = new AbortController();
    controller.abort();
    await expect(
      loadStreamingCollections(api, "member-d", controller.signal),
    ).rejects.toThrow();
  });

  test("indexes every collection page with server sort titles and movie/show scoping in either direction", async () => {
    const titles: BaseItemDto[] = [
      { Id: "number", SortName: "12 monkeys" },
      ...Array.from({ length: 1000 }, (_, i) => ({
        Id: `a-${i}`,
        SortName: `a ${i}`,
      })),
      { Id: "m", Name: "The Matrix", SortName: "matrix" },
      { Id: "z", SortName: "z title" },
    ];
    const { api, requests } = server((params) => {
      const sorted =
        params.get("sortOrder") === "Descending"
          ? [...titles].reverse()
          : titles;
      const start = Number(params.get("startIndex"));
      return {
        Items: sorted.slice(start, start + Number(params.get("limit"))),
        TotalRecordCount: sorted.length,
      };
    });
    const index = await loadStreamingCollectionAlphabet(
      api,
      "member-e",
      "tagged-collection",
      "All",
      "Ascending",
    );
    expect(index.totalCount).toBe(1003);
    expect(index.entries).toEqual([
      { letter: "#", index: 0, itemId: "number" },
      { letter: "A", index: 1, itemId: "a-0" },
      { letter: "M", index: 1001, itemId: "m" },
      { letter: "Z", index: 1002, itemId: "z" },
    ]);
    expect(requests.map((p) => p.get("startIndex"))).toEqual(["0", "1000"]);
    for (const mediaType of ["Movie", "Series"] as const) {
      const reversed = await loadStreamingCollectionAlphabet(
        api,
        "member-e",
        "tagged-collection",
        mediaType,
        "Descending",
      );
      expect(reversed.entries.map((e) => e.letter)).toEqual([
        "Z",
        "M",
        "A",
        "#",
      ]);
      expect(requests.at(-1)!.getAll("includeItemTypes")).toEqual([mediaType]);
    }
    for (const params of requests) {
      expect(params.get("userId")).toBe("member-e");
      expect(params.get("parentId")).toBe("tagged-collection");
      expect(params.get("recursive")).toBe("false");
      expect(params.get("sortBy")).toBe("SortName");
      expect(params.getAll("fields")).toEqual(["SortName"]);
      expect(params.get("enableImages")).toBe("false");
      expect(params.get("enableUserData")).toBe("false");
    }
  });
});

describe("Home rows as on the TV", () => {
  test("MOVIE / SHOW badges only on rows that mix movies and shows; episodes read SHOW", () => {
    const mixed = rowBadges([{ Type: "Movie" }, { Type: "Episode" }]);
    expect(mixed({ Type: "Movie" })).toBe("MOVIE");
    expect(mixed({ Type: "Episode" })).toBe("SHOW");
    expect(mixed({ Type: "Season" })).toBe("SHOW");
    expect(mixed({ Type: "Series" })).toBe("SHOW");
    expect(mixed({ Type: "BoxSet" })).toBeNull();
    for (const items of [
      [{ Type: "Movie" }, { Type: "Movie" }],
      [{ Type: "Series" }, { Type: "Episode" }],
      [],
    ] as const) {
      const badge = rowBadges(items);
      expect(badge({ Type: "Movie" })).toBeNull();
      expect(badge({ Type: "Series" })).toBeNull();
    }
  });

  test("services resolve to their bundled wordmark and brand colour, including server aliases", () => {
    expect(streamingService("Netflix")).toEqual({
      wordmark: "netflix",
      brand: "#E50914",
      code: "nfx",
    });
    expect(streamingService(" HBO Max ")?.code).toBe("mxx");
    expect(streamingService("Max")?.code).toBe("mxx");
    expect(streamingService("Apple TV")?.code).toBe("atp");
    expect(streamingService("Apple TV+")?.code).toBe("atp");
    expect(streamingService("Hallmark+")?.wordmark).toBe("hallmark");
    expect(streamingService("Angel Studios")?.wordmark).toBe("angel");
    expect(streamingService("Some new service")).toBeNull();
  });

  test("the services listed 2026-10-16 have JustWatch codes but no bundled wordmark or brand color", () => {
    const codes: Record<string, string> = {
      Tubi: "tbv",
      "Pluto TV": "ptv",
      "Discovery+": "dpu",
      Shudder: "shd",
      "Acorn TV": "act",
      "Criterion Channel": "crc",
      YouTube: "yfr",
    };
    for (const [name, code] of Object.entries(codes)) {
      expect(streamingService(name)).toEqual({ code });
    }
    for (const [alias, code] of [
      ["Discovery Plus", "dpu"],
      ["The Criterion Channel", "crc"],
      ["Pluto", "ptv"],
      ["Tubi TV", "tbv"],
      ["Acorn", "act"],
    ]) {
      expect(streamingService(alias)?.code).toBe(code);
    }
  });

  test("Showtime keeps its own code for Paramount+ Premium's lists; the Showtime network collection is not a service", () => {
    expect(streamingService("Showtime")).toEqual({ code: "sho" });
    expect(streamingService("Paramount+")?.code).toBe("ppp");
    expect(streamingService("Showtime Network")).toBeNull();
  });

  test("the server's `service_codes` key a collection's lists, over the built-in table", () => {
    const netflix = {
      Id: "5f1c0000-0000-0000-0000-000000000AE2",
      Name: "Netflix",
    };
    const fubo = { Id: "1234567890abcdef1234567890abcdef", Name: "Fubo" };
    const youtube = { Id: "fedcba0987654321fedcba0987654321", Name: "YouTube" };
    const codes = new Map([
      ["5f1c0000000000000000000000000ae2", "nfa"],
      ["1234567890abcdef1234567890abcdef", "fub"],
    ]);
    // The server's mapping wins, ids matched without dashes or case
    expect(streamingServiceCode(netflix, codes)).toBe("nfa");
    // A service added on the server gets lists without an app release
    expect(streamingServiceCode(fubo, codes)).toBe("fub");
    // With the mapping present, a collection without an entry has no lists
    expect(streamingServiceCode(youtube, codes)).toBeNull();
    expect(streamingServiceCode(netflix, new Map())).toBeNull();
    // Without it (an older server job), the built-in table by name
    for (const missing of [null, undefined]) {
      expect(streamingServiceCode(netflix, missing)).toBe("nfx");
      expect(streamingServiceCode(youtube, missing)).toBe("yfr");
      expect(streamingServiceCode(fubo, missing)).toBeNull();
    }
  });

  test("the member's saved order comes first, then the default order; an empty order resets", async () => {
    const items = ["Netflix", "Hulu", "HBO Max", "Starz"].map((name) =>
      collection(name, 3),
    );
    expect(
      applyStreamingOrder(items, ["HBO Max", "Netflix"]).map((i) => i.Name),
    ).toEqual(["HBO Max", "Netflix", "Hulu", "Starz"]);
    expect(applyStreamingOrder(items, ["Gone"]).map((i) => i.Name)).toEqual([
      "Netflix",
      "Hulu",
      "HBO Max",
      "Starz",
    ]);

    const { api } = server(() => ({ Items: [...items] }));
    expect(
      (
        await loadStreamingCollections(api, "member-order", undefined, [
          "Starz",
          "Hulu",
        ])
      ).map((i) => i.Name),
    ).toEqual(["Starz", "Hulu", "Netflix", "HBO Max"]);
    expect(
      (await loadStreamingCollections(api, "member-order")).map((i) => i.Name),
    ).toEqual(["Netflix", "Hulu", "HBO Max", "Starz"]);
  });
});
