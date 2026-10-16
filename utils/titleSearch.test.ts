import { describe, expect, test } from "bun:test";
import { Jellyfin } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  BaseItemDtoQueryResult,
} from "@jellyfin/sdk/lib/generated-client/models";
import axios, { type AxiosRequestConfig } from "axios";
import {
  loadIndexedTitles,
  loadTitleIndex,
  matchTitles,
  mergeSearchResults,
  parseTitleIndex,
  searchKey,
  serializeTitleIndex,
  substringDistance,
  type TitleEntry,
  type TitleType,
  typoTolerance,
} from "./titleSearch";

const title = (
  name: string,
  type: TitleType = "Movie",
  year: number | null = null,
): TitleEntry => ({
  id: `${type}:${name}`,
  name,
  type,
  year,
  key: searchKey(name),
});

/** A small library, in the server's sort-name order. */
const LIBRARY: TitleEntry[] = [
  title("AfterMASH", "Series", 1983),
  title("The Amazing Spider-Man", "Movie", 2012),
  title("Amélie", "Movie", 2001),
  title("Breaking Bad", "Series", 2008),
  title("Bad Boys", "Movie", 1995),
  title("It", "Movie", 2017),
  title("At Close Range", "Movie", 1986),
  title("Law & Order", "Series", 1990),
  title("M*A*S*H", "Movie", 1970),
  title("M*A*S*H", "Series", 1972),
  title("The Mask", "Movie", 1994),
  title("Mib", "Movie", 2020),
  title("Mob Land", "Movie", 2025),
  title("MobLand", "Series", 2025),
  title("The Smashing Machine", "Movie", 2025),
  title("Spider-Man", "Movie", 2002),
  title("Spider-Man 2", "Movie", 2004),
  title("Spider-Man 3", "Movie", 2007),
  title("Spider-Man: No Way Home", "Movie", 2021),
  title("Spider-Man Collection", "BoxSet"),
];

const names = (entries: TitleEntry[]) => entries.map((entry) => entry.name);

describe("searchKey", () => {
  test("folds punctuation, spaces, case, accents and ampersands away", () => {
    for (const text of ["M*A*S*H", "M.A.S.H.", "MASH", "mash"])
      expect(searchKey(text)).toBe("mash");
    for (const text of ["MobLand", "mob land", "Mob Land"])
      expect(searchKey(text)).toBe("mobland");
    expect(searchKey("Spider-Man: No Way Home")).toBe("spidermannowayhome");
    expect(searchKey("Amélie")).toBe("amelie");
    expect(searchKey("Law & Order")).toBe("lawandorder");
  });

  test("keeps non-Latin letters and digits", () => {
    expect(searchKey("千と千尋の神隠し")).toBe("千と千尋の神隠し");
    expect(searchKey("Брат 2")).toBe("брат2");
    expect(searchKey("Ｆｕｌｌｗｉｄｔｈ ２")).toBe("fullwidth2");
  });
});

describe("matchTitles", () => {
  test('"MASH" ranks M*A*S*H, movie and series, above AfterMASH and The Smashing Machine', () => {
    const matches = matchTitles(LIBRARY, "MASH");
    expect(names(matches.Movie).slice(0, 2)).toEqual([
      "M*A*S*H",
      "The Smashing Machine",
    ]);
    expect(names(matches.Series)).toEqual(["M*A*S*H", "AfterMASH"]);
    // A typo match (tier 3) comes after every exact one
    expect(names(matches.Movie)).toContain("The Mask");
    expect(names(matches.Movie).indexOf("The Mask")).toBeGreaterThan(1);
  });

  test('"mob land" and "mobland" both find MobLand and Mob Land', () => {
    for (const query of ["mob land", "mobland", "Mob Land"]) {
      const matches = matchTitles(LIBRARY, query);
      expect(names(matches.Series)[0]).toBe("MobLand");
      expect(names(matches.Movie)[0]).toBe("Mob Land");
    }
  });

  test('"spiderman" and "spider man" rank Spider-Man, then the sequels, then The Amazing Spider-Man', () => {
    for (const query of ["spiderman", "spider man", "Spider-Man"]) {
      const matches = matchTitles(LIBRARY, query);
      expect(names(matches.Movie)).toEqual([
        "Spider-Man",
        "Spider-Man 2",
        "Spider-Man 3",
        "Spider-Man: No Way Home",
        "The Amazing Spider-Man",
      ]);
      expect(names(matches.BoxSet)).toEqual(["Spider-Man Collection"]);
    }
  });

  test("typos, accents and ampersands", () => {
    expect(names(matchTitles(LIBRARY, "breking bad").Series)).toEqual([
      "Breaking Bad",
    ]);
    expect(names(matchTitles(LIBRARY, "amelie").Movie)).toEqual(["Amélie"]);
    expect(names(matchTitles(LIBRARY, "law and order").Series)).toEqual([
      "Law & Order",
    ]);
  });

  test("2–3 character queries never use typo matching; under 2, nothing", () => {
    // "at" is one edit from "it", "mib" one from "mob"
    expect(names(matchTitles(LIBRARY, "it").Movie)).toEqual(["It"]);
    expect(names(matchTitles(LIBRARY, "mob").Movie)).toEqual(["Mob Land"]);
    expect(typoTolerance(2)).toBe(0);
    expect(typoTolerance(3)).toBe(0);
    expect(typoTolerance(4)).toBe(1);
    expect(typoTolerance(7)).toBe(1);
    expect(typoTolerance(8)).toBe(2);
    const none = matchTitles(LIBRARY, "M.");
    expect([...none.Movie, ...none.Series, ...none.BoxSet]).toEqual([]);
  });

  test("ranks by tier, then distance, then key length, then name; at most 50 per type", () => {
    const titles = [
      title("Zeta Mash"),
      title("Mash Up"),
      title("Mast"),
      title("Smash"),
      title("Mash"),
      title("Ma Sh Two"),
    ];
    expect(names(matchTitles(titles, "mash").Movie)).toEqual([
      "Mash",
      "Mash Up",
      "Ma Sh Two",
      "Smash",
      "Zeta Mash",
      "Mast",
    ]);
    const many = Array.from({ length: 80 }, (_, i) => title(`Mash ${i}`));
    expect(matchTitles(many, "mash").Movie).toHaveLength(50);
  });
});

describe("substringDistance", () => {
  /** Sellers' algorithm in full, without the cut-off. */
  const reference = (q: string, key: string) => {
    let column = Array.from({ length: q.length + 1 }, (_, i) => i);
    let best = column[q.length];
    for (const c of key) {
      const next = [0];
      for (let i = 1; i <= q.length; i++) {
        next[i] = Math.min(
          column[i] + 1,
          next[i - 1] + 1,
          column[i - 1] + (q[i - 1] === c ? 0 : 1),
        );
      }
      column = next;
      best = Math.min(best, column[q.length]);
    }
    return best;
  };

  test("agrees with the full algorithm within k and stays above k otherwise", () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const word = (length: number) =>
      Array.from({ length }, () => "abcd"[Math.floor(random() * 4)]).join("");
    for (let run = 0; run < 3000; run++) {
      const q = word(4 + Math.floor(random() * 8));
      const k = typoTolerance(q.length);
      const distance = substringDistance(q, k);
      for (let n = 0; n < 4; n++) {
        const key = word(Math.floor(random() * 20));
        const expected = reference(q, key);
        const actual = distance(key);
        if (expected <= k) expect(actual).toBe(expected);
        else expect(actual).toBeGreaterThan(k);
      }
    }
  });

  test("measures against the closest substring", () => {
    expect(substringDistance("brekingbad", 2)("breakingbad")).toBe(1);
    expect(substringDistance("mash", 1)("themask")).toBe(1);
    expect(substringDistance("mash", 1)("aftermash")).toBe(0);
    expect(substringDistance("mash", 1)("zzzz")).toBeGreaterThan(1);
  });
});

describe("mergeSearchResults", () => {
  const item = (Id: string): BaseItemDto => ({ Id, Name: Id });

  test("index matches first, then the server's extras in its order, without duplicates", () => {
    const merged = mergeSearchResults(
      [item("mash-series"), item("mash-movie")],
      [item("aftermash"), item("mash-movie"), item("smashing")],
    );
    expect(merged?.map((i) => i.Id)).toEqual([
      "mash-series",
      "mash-movie",
      "aftermash",
      "smashing",
    ]);
  });

  test("ids match with or without dashes", () => {
    const merged = mergeSearchResults(
      [item("0123456789abcdef0123456789abcdef")],
      [item("01234567-89ab-cdef-0123-456789abcdef"), item("other")],
    );
    expect(merged?.map((i) => i.Id)).toEqual([
      "0123456789abcdef0123456789abcdef",
      "other",
    ]);
  });

  test("without index matches the server's results stay as they are", () => {
    const server = [item("a"), item("b")];
    expect(mergeSearchResults(undefined, server)).toBe(server);
    expect(mergeSearchResults([], server)).toBe(server);
    expect(mergeSearchResults(undefined, undefined)).toBeUndefined();
    expect(
      mergeSearchResults([item("a")], undefined)?.map((i) => i.Id),
    ).toEqual(["a"]);
  });
});

function server(respond: (params: URLSearchParams) => BaseItemDtoQueryResult) {
  const requests: URLSearchParams[] = [];
  const client = axios.create({
    adapter: async (config) => {
      const url = new URL(axios.getUri(config as AxiosRequestConfig));
      requests.push(url.searchParams);
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
  };
}

describe("the title index", () => {
  test("is fetched in one lightweight request and kept compact", async () => {
    const { api, requests } = server(() => ({
      Items: [
        { Id: "a", Name: "M*A*S*H", Type: "Series", ProductionYear: 1972 },
        { Id: "b", Name: "Amélie", Type: "Movie" },
        { Id: "c", Name: "Spider-Man Collection", Type: "BoxSet" },
        { Id: "d", Name: "Pilot", Type: "Episode" },
        { Id: "e", Type: "Movie" },
      ],
    }));
    expect(await loadTitleIndex(api, "member", undefined)).toEqual([
      { id: "a", name: "M*A*S*H", type: "Series", year: 1972, key: "mash" },
      { id: "b", name: "Amélie", type: "Movie", year: null, key: "amelie" },
      {
        id: "c",
        name: "Spider-Man Collection",
        type: "BoxSet",
        year: null,
        key: "spidermancollection",
      },
    ]);
    const [params] = requests;
    expect(params.get("userId")).toBe("member");
    expect(params.get("recursive")).toBe("true");
    expect(params.getAll("includeItemTypes").join(",")).toBe(
      "Movie,Series,BoxSet",
    );
    expect(params.get("enableImages")).toBe("false");
    expect(params.get("enableUserData")).toBe("false");
    expect(params.get("enableTotalRecordCount")).toBe("false");
    expect(params.get("sortBy")).toBe("SortName");
  });

  test("is saved per member and read back only by that member", () => {
    const index = { owner: "server:member", at: 1234, titles: LIBRARY };
    const json = serializeTitleIndex(index);
    expect(parseTitleIndex(json, "server:member")).toEqual(index);
    expect(parseTitleIndex(json, "server:other")).toBeUndefined();
    expect(parseTitleIndex("not json", "server:member")).toBeUndefined();
    expect(parseTitleIndex(undefined, "server:member")).toBeUndefined();
    expect(
      parseTitleIndex(
        JSON.stringify({ ...JSON.parse(json), v: 0 }),
        "server:member",
      ),
    ).toBeUndefined();
  });

  test("matches are fetched by id in rank order; titles the member can't see drop out", async () => {
    const { api, requests } = server(() => ({
      Items: [
        { Id: "aftermash", Name: "AfterMASH" },
        { Id: "mash", Name: "M*A*S*H" },
      ],
    }));
    const items = await loadIndexedTitles(api, "member", [
      "mash",
      "hidden",
      "aftermash",
    ]);
    expect(items.map((i) => i.Id)).toEqual(["mash", "aftermash"]);
    expect(requests).toHaveLength(1);
    expect(requests[0].get("userId")).toBe("member");
    expect(requests[0].getAll("ids").join(",")).toBe("mash,hidden,aftermash");
    expect(await loadIndexedTitles(api, "member", [])).toEqual([]);
    expect(requests).toHaveLength(1);
  });
});
