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
  type TitleEntry,
  type TitleType,
  titleKey,
  typoTolerance,
  wordStartDistance,
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
  ...titleKey(name),
});

/** A small library, in the server's sort-name order. */
const LIBRARY: TitleEntry[] = [
  title("AfterMASH", "Series", 1983),
  title("The Amazing Spider-Man", "Movie", 2012),
  title("Amélie", "Movie", 2001),
  title("At Close Range", "Movie", 1986),
  title("Bad Boys", "Movie", 1995),
  title("Breaking Bad", "Series", 2008),
  title("A Christmas Story", "Movie", 1983),
  title("The Flash", "Series", 2014),
  title("Game of Thrones", "Series", 2011),
  title("The Godfather", "Movie", 1972),
  title("The Godfather Part II", "Movie", 1974),
  title("Interstellar", "Movie", 2014),
  title("It", "Movie", 2017),
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
  title("Washington Black", "Series", 2025),
];

const names = (entries: TitleEntry[]) => entries.map((entry) => entry.name);
/** Every title the query finds, in any section or tier. */
const everything = (query: string) =>
  Object.values(matchTitles(LIBRARY, query)).flatMap((section) =>
    names([...section.matches, ...section.typos]),
  );

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

  test("a title's key is its search key, with where each word starts", () => {
    expect(titleKey("The Godfather Part II")).toEqual({
      key: "thegodfatherpartii",
      starts: [0, 3, 12, 16],
    });
    expect(titleKey("Law & Order")).toEqual({
      key: "lawandorder",
      starts: [0, 3, 6],
    });
    expect(titleKey("M*A*S*H")).toEqual({ key: "mash", starts: [0, 1, 2, 3] });
    expect(titleKey("Amélie").key).toBe(searchKey("Amélie"));
    expect(titleKey("***")).toEqual({ key: "", starts: [] });
  });
});

describe("matchTitles", () => {
  test('"MASH" ranks M*A*S*H, movie and series, above AfterMASH and The Smashing Machine', () => {
    const matches = matchTitles(LIBRARY, "MASH");
    expect(names(matches.Movie.matches)).toEqual([
      "M*A*S*H",
      "The Smashing Machine",
    ]);
    expect(names(matches.Series.matches)).toEqual(["M*A*S*H", "AfterMASH"]);
  });

  test('"mash" never typo-matches: no Christmas, Flash or Washington; "flash" no Christmas', () => {
    const mash = everything("mash");
    for (const name of [
      "A Christmas Story",
      "The Flash",
      "Washington Black",
      "The Mask",
    ])
      expect(mash).not.toContain(name);
    expect(everything("flash")).toEqual(["The Flash"]);
  });

  test('"mob land" and "mobland" both find MobLand and Mob Land', () => {
    for (const query of ["mob land", "mobland", "Mob Land"]) {
      const matches = matchTitles(LIBRARY, query);
      expect(names(matches.Series.matches)[0]).toBe("MobLand");
      expect(names(matches.Movie.matches)[0]).toBe("Mob Land");
    }
  });

  test('"spiderman" and "spider man" rank Spider-Man, then the sequels, then The Amazing Spider-Man', () => {
    for (const query of ["spiderman", "spider man", "Spider-Man"]) {
      const matches = matchTitles(LIBRARY, query);
      expect(names(matches.Movie.matches)).toEqual([
        "Spider-Man",
        "Spider-Man 2",
        "Spider-Man 3",
        "Spider-Man: No Way Home",
        "The Amazing Spider-Man",
      ]);
      expect(names(matches.BoxSet.matches)).toEqual(["Spider-Man Collection"]);
    }
  });

  test("typos from a word start, accents and ampersands", () => {
    const breaking = matchTitles(LIBRARY, "breking bad").Series;
    expect(names(breaking.matches)).toEqual([]);
    expect(names(breaking.typos)).toEqual(["Breaking Bad"]);
    expect(names(matchTitles(LIBRARY, "godfater").Movie.typos)).toEqual([
      "The Godfather",
      "The Godfather Part II",
    ]);
    expect(names(matchTitles(LIBRARY, "interstelar").Movie.typos)).toEqual([
      "Interstellar",
    ]);
    expect(names(matchTitles(LIBRARY, "game of throns").Series.typos)).toEqual([
      "Game of Thrones",
    ]);
    expect(names(matchTitles(LIBRARY, "amelie").Movie.matches)).toEqual([
      "Amélie",
    ]);
    expect(names(matchTitles(LIBRARY, "law and order").Series.matches)).toEqual(
      ["Law & Order"],
    );
  });

  test("queries under 5 characters never use typo matching; under 2, nothing", () => {
    // "at" is one edit from "it", "mib" one from "mob"
    expect(everything("it")).toEqual(["It"]);
    expect(everything("mob")).toEqual(["Mob Land", "MobLand"]);
    expect(typoTolerance(4)).toBe(0);
    expect(typoTolerance(5)).toBe(1);
    expect(typoTolerance(8)).toBe(1);
    expect(typoTolerance(9)).toBe(2);
    expect(everything("M.")).toEqual([]);
  });

  test("matches rank by tier, then key length, then name, at most 50", () => {
    const titles = [
      title("Zeta Mash"),
      title("Mash Up"),
      title("Smash"),
      title("Mash"),
      title("Ma Sh Two"),
      title("Mash Uq"),
    ];
    expect(names(matchTitles(titles, "mash").Movie.matches)).toEqual([
      "Mash",
      "Mash Up",
      "Mash Uq",
      "Ma Sh Two",
      "Smash",
      "Zeta Mash",
    ]);
    const many = Array.from({ length: 80 }, (_, i) => title(`Mash ${i}`));
    expect(matchTitles(many, "mash").Movie.matches).toHaveLength(50);
  });

  test("typos rank by distance, then key length, then name, at most 10; only from a word start", () => {
    const titles = [
      title("Abcdefgxyj"),
      title("The Abcdefghxj"),
      title("Abcdefghiqq"),
      title("Abcdefghiz"),
      title("Abcdefghiq"),
      title("Xyabcdefghiq"),
    ];
    const { matches, typos } = matchTitles(titles, "abcdefghij").Movie;
    expect(names(matches)).toEqual([]);
    expect(names(typos)).toEqual([
      "Abcdefghiq",
      "Abcdefghiz",
      "Abcdefghiqq",
      "The Abcdefghxj",
      "Abcdefgxyj",
    ]);
    const many = Array.from({ length: 30 }, (_, i) =>
      title(`Interstelar ${i}`),
    );
    expect(matchTitles(many, "interstellar").Movie.typos).toHaveLength(10);
  });

  test("remaining ties keep the index's sort-name order", () => {
    const titles = [
      { ...title("Mash"), id: "first" },
      { ...title("Mash"), id: "second" },
    ];
    expect(matchTitles(titles, "mash").Movie.matches.map((t) => t.id)).toEqual([
      "first",
      "second",
    ]);
  });
});

describe("wordStartDistance", () => {
  /** The prefix distance from every start in full, without the band. */
  const reference = (q: string, key: string, starts: number[]) => {
    let best = Number.POSITIVE_INFINITY;
    for (const start of starts) {
      const text = key.slice(start);
      let row = Array.from({ length: text.length + 1 }, (_, j) => j);
      for (let i = 1; i <= q.length; i++) {
        const next = [i];
        for (let j = 1; j <= text.length; j++) {
          next[j] = Math.min(
            row[j] + 1,
            next[j - 1] + 1,
            row[j - 1] + (q[i - 1] === text[j - 1] ? 0 : 1),
          );
        }
        row = next;
      }
      best = Math.min(best, ...row);
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
      Array.from({ length }, () => "abc"[Math.floor(random() * 3)]).join("");
    for (let run = 0; run < 3000; run++) {
      const q = word(5 + Math.floor(random() * 8));
      const k = typoTolerance(q.length);
      const distance = wordStartDistance(q, k);
      for (let n = 0; n < 4; n++) {
        const key = word(Math.floor(random() * 24));
        const starts = [0];
        for (let i = 1; i < key.length; i++) if (random() < 0.2) starts.push(i);
        const expected = reference(q, key, key ? starts : []);
        const actual = distance(key, key ? starts : []);
        if (expected <= k) expect(actual).toBe(expected);
        else expect(actual).toBeGreaterThan(k);
      }
    }
  });

  test("measures from the closest word start", () => {
    const { key, starts } = titleKey("Breaking Bad");
    expect(wordStartDistance("brekingbad", 2)(key, starts)).toBe(1);
    const godfather = titleKey("The Godfather");
    expect(
      wordStartDistance("godfater", 1)(godfather.key, godfather.starts),
    ).toBe(1);
    // "mas" isn't a word start in "christmas"
    const christmas = titleKey("A Christmas Story");
    expect(
      wordStartDistance("masher", 1)(christmas.key, christmas.starts),
    ).toBeGreaterThan(1);
  });
});

describe("mergeSearchResults", () => {
  const item = (Id: string): BaseItemDto => ({ Id, Name: Id });
  const ids = (items: BaseItemDto[] | undefined) => items?.map((i) => i.Id);

  test("matches first, then the server's extras in its order, then typos, without duplicates", () => {
    const merged = mergeSearchResults(
      {
        matches: [item("mash-series"), item("mash-movie")],
        typos: [item("mush"), item("smashing")],
      },
      [item("aftermash"), item("mash-movie"), item("smashing")],
    );
    expect(ids(merged)).toEqual([
      "mash-series",
      "mash-movie",
      "aftermash",
      "smashing",
      "mush",
    ]);
  });

  test("ids match with or without dashes", () => {
    const merged = mergeSearchResults(
      { matches: [item("0123456789abcdef0123456789abcdef")], typos: [] },
      [item("01234567-89ab-cdef-0123-456789abcdef"), item("other")],
    );
    expect(ids(merged)).toEqual(["0123456789abcdef0123456789abcdef", "other"]);
  });

  test("without index matches the server's results stay as they are", () => {
    const server = [item("a"), item("b")];
    expect(mergeSearchResults(undefined, server)).toBe(server);
    expect(mergeSearchResults({ matches: [], typos: [] }, server)).toBe(server);
    expect(mergeSearchResults(undefined, undefined)).toBeUndefined();
    expect(
      ids(mergeSearchResults({ matches: [], typos: [item("t")] }, undefined)),
    ).toEqual(["t"]);
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
      {
        id: "a",
        name: "M*A*S*H",
        type: "Series",
        year: 1972,
        key: "mash",
        starts: [0, 1, 2, 3],
      },
      {
        id: "b",
        name: "Amélie",
        type: "Movie",
        year: null,
        key: "amelie",
        starts: [0],
      },
      {
        id: "c",
        name: "Spider-Man Collection",
        type: "BoxSet",
        year: null,
        key: "spidermancollection",
        starts: [0, 6, 9],
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
    // An index saved before word starts were kept is fetched again
    expect(
      parseTitleIndex(
        JSON.stringify({ ...JSON.parse(json), v: 1 }),
        "server:member",
      ),
    ).toBeUndefined();
  });

  test("matches and typos are fetched by id in one request, in rank order; titles the member can't see drop out", async () => {
    const { api, requests } = server(() => ({
      Items: [
        { Id: "breaking", Name: "Breaking Bad" },
        { Id: "aftermash", Name: "AfterMASH" },
        { Id: "mash", Name: "M*A*S*H" },
      ],
    }));
    const items = await loadIndexedTitles(
      api,
      "member",
      ["mash", "hidden", "aftermash"],
      ["breaking"],
    );
    expect(items.matches.map((i) => i.Id)).toEqual(["mash", "aftermash"]);
    expect(items.typos.map((i) => i.Id)).toEqual(["breaking"]);
    expect(requests).toHaveLength(1);
    expect(requests[0].get("userId")).toBe("member");
    expect(requests[0].getAll("ids").join(",")).toBe(
      "mash,hidden,aftermash,breaking",
    );
    expect(await loadIndexedTitles(api, "member", [], [])).toEqual({
      matches: [],
      typos: [],
    });
    expect(requests).toHaveLength(1);
  });
});
