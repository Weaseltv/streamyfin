import { describe, expect, test } from "bun:test";
import {
  MediaRequestStatus,
  MediaStatus,
} from "@/utils/jellyseerr/server/constants/media";
import {
  allSeasonsSelected,
  initialSeasonSelection,
  pickableSeasonNumbers,
  type RequestSeason,
  requestSeasonsFor,
  toggleAllSeasons,
  toggleSeasonSelection,
} from "./requestSeasons";

const season = (seasonNumber: number, episodeCount = 10) => ({
  seasonNumber,
  episodeCount,
});

describe("requestSeasonsFor", () => {
  test("leaves out specials and sorts by season", () => {
    const rows = requestSeasonsFor({
      seasons: [season(2), season(0), season(1)],
    });
    expect(rows.map((r) => r.seasonNumber)).toEqual([1, 2]);
    expect(rows.every((r) => r.status === MediaStatus.UNKNOWN)).toBe(true);
  });

  test("a season's own status wins over its requests", () => {
    const rows = requestSeasonsFor({
      seasons: [season(1), season(2)],
      mediaInfo: {
        seasons: [{ seasonNumber: 1, status: MediaStatus.AVAILABLE }],
        requests: [
          {
            seasons: [
              { seasonNumber: 1, status: MediaRequestStatus.PENDING },
              { seasonNumber: 2, status: MediaRequestStatus.APPROVED },
            ],
          },
        ],
      },
    });
    expect(rows.map((r) => r.status)).toEqual([
      MediaStatus.AVAILABLE,
      MediaStatus.PROCESSING,
    ]);
  });

  test("a pending request is pending, not requestable (enum values overlap)", () => {
    const [row] = requestSeasonsFor({
      seasons: [season(1)],
      mediaInfo: {
        requests: [
          {
            seasons: [{ seasonNumber: 1, status: MediaRequestStatus.PENDING }],
          },
        ],
      },
    });
    expect(row.status).toBe(MediaStatus.PENDING);
  });

  test("declined, failed and 4K-only requests leave a season pickable", () => {
    const rows = requestSeasonsFor({
      seasons: [season(1), season(2), season(3)],
      mediaInfo: {
        seasons: [{ seasonNumber: 3, status: MediaStatus.DELETED }],
        requests: [
          {
            seasons: [
              { seasonNumber: 1, status: MediaRequestStatus.DECLINED },
              { seasonNumber: 2, status: MediaRequestStatus.FAILED },
            ],
          },
          {
            is4k: true,
            seasons: [{ seasonNumber: 3, status: MediaRequestStatus.PENDING }],
          },
        ],
      },
    });
    expect(pickableSeasonNumbers(rows)).toEqual([1, 2, 3]);
  });

  test("the strongest live request wins", () => {
    const [row] = requestSeasonsFor({
      seasons: [season(1)],
      mediaInfo: {
        requests: [
          {
            seasons: [{ seasonNumber: 1, status: MediaRequestStatus.DECLINED }],
          },
          {
            seasons: [{ seasonNumber: 1, status: MediaRequestStatus.APPROVED }],
          },
          {
            seasons: [{ seasonNumber: 1, status: MediaRequestStatus.PENDING }],
          },
        ],
      },
    });
    expect(row.status).toBe(MediaStatus.PROCESSING);
  });
});

const rows: RequestSeason[] = [
  { seasonNumber: 1, episodeCount: 8, status: MediaStatus.AVAILABLE },
  { seasonNumber: 2, episodeCount: 8, status: MediaStatus.UNKNOWN },
  { seasonNumber: 3, episodeCount: 8, status: MediaStatus.PENDING },
  { seasonNumber: 4, episodeCount: 8, status: MediaStatus.UNKNOWN },
];

describe("season picker selection", () => {
  test("opening from the show's Request button ticks nothing", () => {
    expect(initialSeasonSelection(rows, "none")).toEqual([]);
  });

  test("a single pickable season is ticked from the start", () => {
    expect(initialSeasonSelection(rows.slice(0, 3), "none")).toEqual([2]);
  });

  test("Request all ticks only pickable seasons", () => {
    expect(initialSeasonSelection(rows, "all")).toEqual([2, 4]);
  });

  test("a season's Request badge ticks just that season", () => {
    expect(initialSeasonSelection(rows, 4)).toEqual([4]);
    expect(initialSeasonSelection(rows, 1)).toEqual([]);
  });

  test("Select all ticks pickable seasons, then unticks them", () => {
    const all = toggleAllSeasons(rows, [4]);
    expect(all).toEqual([2, 4]);
    expect(allSeasonsSelected(rows, all)).toBe(true);
    expect(toggleAllSeasons(rows, all)).toEqual([]);
  });

  test("Select all is never on when nothing can be picked", () => {
    const none = rows.filter((r) => r.status !== MediaStatus.UNKNOWN);
    expect(allSeasonsSelected(none, [])).toBe(false);
    expect(toggleAllSeasons(none, [])).toEqual([]);
  });

  test("toggling keeps season order", () => {
    expect(toggleSeasonSelection([4], 2)).toEqual([2, 4]);
    expect(toggleSeasonSelection([2, 4], 2)).toEqual([4]);
  });
});
