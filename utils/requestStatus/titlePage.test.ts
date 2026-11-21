import { describe, expect, test } from "bun:test";
import { deriveRequestStage } from "./stage";
import { ownRequestForTitle, titleStageAction } from "./titlePage";
import type { OwnRequest, RequestStatusItem } from "./types";

const item = (over: Partial<OwnRequest>): RequestStatusItem => {
  const request: OwnRequest = {
    id: 1,
    status: 2,
    type: "movie",
    media: { status: 3, tmdbId: 10 },
    ...over,
  };
  return { request, stage: deriveRequestStage(request), fresh: true };
};

describe("title page stage button", () => {
  test("unfinished HD first, then any unfinished, then the first", () => {
    const readyHd = item({
      id: 1,
      media: { status: 5, status4k: 3, tmdbId: 10 },
    });
    const pending4k = item({
      id: 2,
      is4k: true,
      media: { status: 5, status4k: 3, tmdbId: 10 },
    });
    const pendingHd = item({ id: 3 });
    expect(
      ownRequestForTitle([readyHd, pending4k, pendingHd], "movie", 10)?.request
        .id,
    ).toBe(3);
    expect(
      ownRequestForTitle([readyHd, pending4k], "movie", 10)?.request.id,
    ).toBe(2);
    expect(ownRequestForTitle([readyHd], "movie", 10)?.request.id).toBe(1);
  });

  test("only the same type and TMDB id", () => {
    expect(ownRequestForTitle([item({})], "tv", 10)).toBeNull();
    expect(ownRequestForTitle([item({})], "movie", 11)).toBeNull();
    expect(ownRequestForTitle([item({})], "movie", null)).toBeNull();
  });

  test("ready with a library id of its own quality opens the title; otherwise the queue row", () => {
    const id = "a".repeat(32);
    expect(
      titleStageAction(
        item({ media: { status: 5, tmdbId: 10, jellyfinMediaId: id } }),
      ),
    ).toEqual({
      kind: "library",
      itemId: id,
    });
    expect(
      titleStageAction(
        item({
          is4k: true,
          media: { status4k: 5, tmdbId: 10, jellyfinMediaId: id },
        }),
      ),
    ).toEqual({ kind: "queue", requestId: 1 });
    expect(titleStageAction(item({}))).toEqual({ kind: "queue", requestId: 1 });
  });
});
