import { describe, expect, test } from "bun:test";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  countEpisodes,
  formatEpisodeNumber,
  getAdjacentEpisode,
} from "./episodes";

const episode = (
  start: number,
  end?: number | null,
  season = 4,
): BaseItemDto => ({
  Id: `regular-s${season}e${start}`,
  Type: "Episode",
  SeriesId: "regular-show",
  ParentIndexNumber: season,
  IndexNumber: start,
  IndexNumberEnd: end,
  LocationType: "FileSystem",
});

const exit9B: BaseItemDto = {
  ...episode(1, 2),
  Name: "Exit 9B / Starter Pack",
};

describe("episode range labels", () => {
  test("Regular Show S4 lists 1-2, then 3 and keeps the season style", () => {
    const items = [exit9B, episode(3)];
    expect(items.map((item) => formatEpisodeNumber(item))).toEqual([
      "1-2",
      "3",
    ]);
    expect(formatEpisodeNumber(exit9B, { includeSeason: true })).toBe(
      "S4:E1-2",
    );
    expect(
      formatEpisodeNumber(exit9B, {
        includeSeason: true,
        seasonSeparator: "",
      }),
    ).toBe("S4E1-2");
  });

  test("Regular Show S3 pairs and padded download/notification labels", () => {
    const pair = episode(6, 7, 3);
    expect(formatEpisodeNumber(pair)).toBe("6-7");
    expect(
      formatEpisodeNumber(pair, {
        includeSeason: true,
        seasonSeparator: "",
        padLength: 2,
      }),
    ).toBe("S03E06-07");
  });

  test("single episodes, specials and non-increasing ends stay single", () => {
    for (const end of [undefined, null, 1, 0, -1, Number.NaN]) {
      expect(formatEpisodeNumber(episode(1, end, 1))).toBe("1");
      expect(
        formatEpisodeNumber(episode(1, end, 1), { includeSeason: true }),
      ).toBe("S1:E1");
    }
    expect(formatEpisodeNumber(episode(0, 0, 0))).toBe("0");
    expect(formatEpisodeNumber(episode(100, 101))).toBe("100-101");
    expect(formatEpisodeNumber(episode(1, 4))).toBe("1-4");
  });

  test("missing start cannot create a spurious range", () => {
    expect(formatEpisodeNumber({ IndexNumberEnd: 2 })).toBe("?");
    expect(formatEpisodeNumber({}, { fallback: "–" })).toBe("–");
    expect(
      formatEpisodeNumber({}, { includeSeason: true, fallback: "??" }),
    ).toBe("S??:E??");
  });

  test("range metadata survives JSON decoding and offline persistence", () => {
    const decoded: { Items: BaseItemDto[] } = JSON.parse(
      JSON.stringify({ Items: [exit9B] }),
    );
    const downloaded = JSON.parse(JSON.stringify({ item: decoded.Items[0] }));
    expect(formatEpisodeNumber(downloaded.item)).toBe("1-2");
    expect(downloaded.item.IndexNumberEnd).toBe(2);
  });
});

describe("episode coverage counts", () => {
  test("counts both covered episodes without inventing files or changing state", () => {
    const items = [
      { ...exit9B, UserData: { Played: true, PlaybackPositionTicks: 123 } },
      episode(3),
    ];
    const before = structuredClone(items);
    expect(countEpisodes(items)).toBe(3);
    expect(items).toEqual(before);
    expect(items).toHaveLength(2);
  });

  test("overlapping items or a virtual episode inside a range count once", () => {
    expect(
      countEpisodes([
        episode(3, 5),
        exit9B,
        { ...episode(2), LocationType: "Virtual" },
        { ...episode(1, 2), Id: "alternate-version" },
        episode(5, 7),
      ]),
    ).toBe(7);
  });

  test("keeps seasons and series separate, and counts unnumbered items", () => {
    expect(
      countEpisodes([
        exit9B,
        episode(1, 2, 3),
        { ...exit9B, SeriesId: "another-series" },
        { Id: "unnumbered" },
      ]),
    ).toBe(7);
    expect(countEpisodes(undefined)).toBe(0);
  });
});

describe("adjacent files", () => {
  test("next after 1-2 is file 3 and previous from 3 is the same combined file", () => {
    const three = episode(3);
    const items = [exit9B, three, episode(4, 5)];
    expect(getAdjacentEpisode(items, exit9B.Id, "next")).toBe(three);
    expect(getAdjacentEpisode(items, three.Id, "previous")).toBe(exit9B);
    expect(getAdjacentEpisode(items, exit9B.Id, "previous")).toBeNull();
    expect(getAdjacentEpisode(items, items[2].Id, "next")).toBeNull();
  });

  test("uses actual IDs and supplied order across gaps and seasons", () => {
    const items = [episode(1, undefined, 1), exit9B, episode(6, 7)];
    expect(getAdjacentEpisode(items, exit9B.Id, "next")).toBe(items[2]);
    expect(getAdjacentEpisode(items, exit9B.Id, "previous")).toBe(items[0]);
    expect(getAdjacentEpisode(items, "absent", "next")).toBeNull();
    expect(getAdjacentEpisode(undefined, exit9B.Id, "next")).toBeNull();
  });

  test("does not navigate to virtual placeholders or replay the current file", () => {
    expect(
      getAdjacentEpisode(
        [exit9B, { ...episode(3), LocationType: "Virtual" }],
        exit9B.Id,
        "next",
      ),
    ).toBeNull();
    expect(getAdjacentEpisode([exit9B, exit9B], exit9B.Id, "next")).toBeNull();
  });
});
