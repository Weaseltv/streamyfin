import { describe, expect, test } from "bun:test";
import { Jellyfin } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  BaseItemDtoQueryResult,
} from "@jellyfin/sdk/lib/generated-client/models";
import axios, { type AxiosRequestConfig } from "axios";
import {
  CURATED_COLLECTION_TAG,
  collectionCardPresentation,
  loadCuratedCollections,
  loadStreamingCollectionAlphabet,
  loadStreamingCollectionItems,
  loadStreamingCollections,
  STREAMING_COLLECTION_TAG,
  STREAMING_SERVICE_ORDER,
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
  const layout = (viewportWidth = 390) => ({
    width: 132,
    viewportWidth,
    gutter: 16,
    gap: 10,
  });

  test("only the two exact tags on BoxSets remove captions, irrespective of names", () => {
    for (const tag of [STREAMING_COLLECTION_TAG, CURATED_COLLECTION_TAG]) {
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
      ["WeaselPlex Curated extra"],
      ["weaselplex curated"],
    ]) {
      expect(
        collectionCardPresentation({ Type: "BoxSet", Tags }, layout())
          .imageOnly,
      ).toBe(false);
    }
  });

  test("Picks retain 2:3 art and at least 2.5 visible cards across phone widths, rotation and split views", () => {
    for (const viewport of [
      320, 360, 375, 390, 412, 430, 480, 768, 844, 1024,
    ]) {
      const card = collectionCardPresentation(
        { Type: "BoxSet", Tags: [CURATED_COLLECTION_TAG] },
        layout(viewport),
      );
      expect(card.posterDimensions!.w).toBe(card.width);
      expect(card.posterDimensions!.h / card.width).toBe(1.5);
      expect(16 + 2.5 * card.width + 2 * 10).toBeLessThanOrEqual(viewport);
      expect(card.width).toBeLessThanOrEqual(132 * 1.35);
      const streaming = collectionCardPresentation(
        { Type: "BoxSet", Tags: [STREAMING_COLLECTION_TAG] },
        layout(viewport),
      );
      expect(streaming.width).toBe(132);
      expect(streaming.posterDimensions).toBeUndefined();
    }
    expect(
      collectionCardPresentation(
        { Type: "BoxSet", Tags: [CURATED_COLLECTION_TAG] },
        layout(844),
      ).width,
    ).toBe(178);
  });
});

describe("streaming collections via the Jellyfin SDK", () => {
  test("both row queries request and retain Tags for data-driven artwork cards", async () => {
    const { api, requests } = server((params) => ({
      Items: [
        {
          ...collection("Art already carries the title", 4),
          Tags: [params.get("tags")!],
        },
      ],
    }));
    for (const load of [loadStreamingCollections, loadCuratedCollections]) {
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
  test("Picks requests member-scoped curated BoxSets in server SortName order without reordering names", async () => {
    const { api, requests, headers } = server((params) => ({
      Items:
        params.get("tags") === CURATED_COLLECTION_TAG
          ? [
              collection("Spooky Season", 8),
              collection("Z picks", 3),
              collection("Empty", 0),
              collection("A picks", 2),
            ]
          : [collection("Netflix", 10), collection("Sports", 10)],
    }));
    const items = await loadCuratedCollections(api, "member-picks");
    expect(items.map((item) => item.Name)).toEqual([
      "Spooky Season",
      "Z picks",
      "A picks",
    ]);
    expect(requests).toHaveLength(1);
    const params = requests[0];
    expect(params.get("userId")).toBe("member-picks");
    expect(params.getAll("includeItemTypes")).toEqual(["BoxSet"]);
    expect(params.getAll("tags")).toEqual(["WeaselPlex Curated"]);
    expect(params.get("recursive")).toBe("true");
    expect(params.getAll("sortBy")).toEqual(["SortName"]);
    expect(params.getAll("sortOrder")).toEqual(["Ascending"]);
    expect(params.getAll("fields")).toEqual(["ChildCount", "Overview", "Tags"]);
    expect(params.has("parentId")).toBe(false);
    expect(headers[0]).toStartWith("MediaBrowser ");
    expect(headers[0]).toContain('Token="test-token"');
  });

  test("Picks rediscovers replacement seasonal IDs and Monday's order on every request", async () => {
    let items: BaseItemDto[] = [
      { ...collection("Spooky Season", 4), Id: "old-season" },
      collection("Spin the Wheel", 1),
    ];
    const { api, requests } = server(() => ({ Items: items }));
    expect((await loadCuratedCollections(api, "member-picks"))[0].Id).toBe(
      "old-season",
    );
    items = [];
    expect(await loadCuratedCollections(api, "member-picks")).toEqual([]);
    items = [
      collection("Spin the Wheel", 7),
      { ...collection("Cozy Season", 5), Id: "new-season" },
    ];
    expect(await loadCuratedCollections(api, "member-picks")).toEqual(items);
    expect(requests).toHaveLength(3);
    expect(
      requests.every((p) => p.get("tags") === CURATED_COLLECTION_TAG),
    ).toBe(true);
  });

  test("Picks probes missing child counts with userId without changing the server's order", async () => {
    const { api, requests } = server((params) => {
      if (!params.has("parentId"))
        return {
          Items: [
            collection("Z picks"),
            collection("Empty"),
            collection("A picks", 1),
          ],
        };
      return {
        Items: params.get("parentId") === "Z picks" ? [{ Id: "movie" }] : [],
      };
    });
    expect(
      (await loadCuratedCollections(api, "member-picks")).map((i) => i.Name),
    ).toEqual(["Z picks", "A picks"]);
    for (const params of requests.slice(1)) {
      expect(params.get("userId")).toBe("member-picks");
      expect(params.get("limit")).toBe("1");
    }
  });

  test("discovers by tag, scopes to the member, hides empty collections, and orders services before new names", async () => {
    const services = STREAMING_SERVICE_ORDER.map((name) =>
      collection(name, 12),
    ).reverse();
    const { api, requests, headers } = server((params) => {
      // Untagged sports collections are never returned by this query.
      if (params.get("tags") !== STREAMING_COLLECTION_TAG)
        return { Items: [collection("Boxing", 7)] };
      return {
        Items: [
          ...services,
          collection("Z service", 1),
          collection("A service", 2),
          collection("Empty service", 0),
        ],
      };
    });
    const items = await loadStreamingCollections(api, "member-a");
    expect(items.map((item) => item.Name)).toEqual([
      ...STREAMING_SERVICE_ORDER,
      "A service",
      "Z service",
    ]);
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
