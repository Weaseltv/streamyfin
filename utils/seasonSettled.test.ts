import { describe, expect, test } from "bun:test";
import { isSeasonSettled } from "./seasonSettled";

const loaded = {
  seasonsPending: false,
  seasonCount: 3,
  seasonChosen: true,
  seasonFound: true,
  episodesPending: false,
};

describe("isSeasonSettled", () => {
  test("waits for the season list", () => {
    expect(
      isSeasonSettled({
        seasonsPending: true,
        seasonCount: 0,
        seasonChosen: false,
        seasonFound: false,
        episodesPending: true,
      }),
    ).toBe(false);
  });

  test("waits for the first season to be picked once the list arrives", () => {
    expect(
      isSeasonSettled({
        ...loaded,
        seasonChosen: false,
        seasonFound: false,
        episodesPending: true,
      }),
    ).toBe(false);
  });

  test("waits for the chosen season's episodes", () => {
    expect(isSeasonSettled({ ...loaded, episodesPending: true })).toBe(false);
  });

  test("is settled when the episodes have arrived or failed", () => {
    expect(isSeasonSettled(loaded)).toBe(true);
  });

  test("a remembered season waits for the list like any other", () => {
    expect(
      isSeasonSettled({
        ...loaded,
        seasonsPending: true,
        seasonCount: 0,
        seasonFound: false,
        episodesPending: true,
      }),
    ).toBe(false);
  });

  test("a show with no seasons, or a failed season list, does not wait", () => {
    expect(
      isSeasonSettled({
        seasonsPending: false,
        seasonCount: 0,
        seasonChosen: false,
        seasonFound: false,
        episodesPending: true,
      }),
    ).toBe(true);
  });

  test("a remembered season the list no longer has does not wait", () => {
    expect(
      isSeasonSettled({
        ...loaded,
        seasonFound: false,
        episodesPending: true,
      }),
    ).toBe(true);
  });
});
