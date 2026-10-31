import { expect, test } from "bun:test";
import { deriveRequestStage, type OwnRequest } from "./requestStatus";
import { syncOwnRequests } from "./syncOwnRequests";

const movie = (id: number): OwnRequest => ({
  id,
  status: 2,
  type: "movie",
  requestedBy: { id: 1 },
  media: { status: 3 },
});
test("exhaustive paging never stops on a terminal page, and filters foreign owners", async () => {
  const skips: number[] = [];
  const result = await syncOwnRequests(
    {
      list: async (skip) => {
        skips.push(skip);
        return {
          results:
            skip === 0
              ? Array.from({ length: 50 }, (_, i) => ({
                  ...movie(i + 1),
                  status: 5,
                }))
              : [movie(51), { ...movie(52), requestedBy: { id: 99 } }],
        };
      },
      detail: async () => {
        throw new Error();
      },
    },
    1,
    [],
    [],
    new Map(),
    new AbortController().signal,
  );
  expect(skips).toEqual([0, 50]);
  expect(result.complete).toBe(true);
  expect(result.rows).toHaveLength(51);
});
test("missing rows survive one 404 and are removed only on a second sync", async () => {
  const r = movie(1),
    old = { request: r, stage: deriveRequestStage(r), fresh: true },
    missing = new Map<number, number>();
  const source = {
    list: async () => ({ results: [] }),
    detail: async () => {
      throw { response: { status: 404 } };
    },
  };
  const one = await syncOwnRequests(
    source,
    1,
    [old],
    [1],
    missing,
    new AbortController().signal,
  );
  expect(one.rows).toHaveLength(1);
  expect(one.rows[0]!.fresh).toBe(false);
  const two = await syncOwnRequests(
    source,
    1,
    one.rows,
    [1],
    missing,
    new AbortController().signal,
  );
  expect(two.rows).toHaveLength(0);
});
test("TV season reads are deduplicated, bounded at four, failure cannot notify", async () => {
  const requests = Array.from({ length: 8 }, (_, i) => ({
    ...movie(i + 1),
    type: "tv",
    seasons: [{ seasonNumber: 1 }],
    media: { id: Math.floor(i / 2), status: 5 },
  }));
  let active = 0,
    max = 0,
    calls = 0;
  const result = await syncOwnRequests(
    {
      list: async () => ({ results: requests }),
      detail: async (id) => {
        calls++;
        active++;
        max = Math.max(max, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        if (id === 1) throw new Error("offline");
        return {
          ...requests[id - 1]!,
          media: { seasons: [{ seasonNumber: 1, status: 5 }] },
        };
      },
    },
    1,
    [],
    [],
    new Map(),
    new AbortController().signal,
  );
  expect(max).toBeLessThanOrEqual(4);
  expect(calls).toBe(4);
  expect(result.rows.filter((r) => !r.fresh)).toHaveLength(2);
});

test("server-capped page size advances by actual rows and honors total metadata", async () => {
  const skips: number[] = [];
  const result = await syncOwnRequests(
    {
      list: async (skip) => {
        skips.push(skip);
        return {
          results: [movie(skip + 1), movie(skip + 2)],
          pageInfo: { results: 6 },
        };
      },
      detail: async () => {
        throw new Error();
      },
    },
    1,
    [],
    [],
    new Map(),
    new AbortController().signal,
  );
  expect(skips).toEqual([0, 2, 4]);
  expect(result.rows).toHaveLength(6);
  expect(result.complete).toBe(true);
});
test("unchanged ready TV snapshots are reused, new unhydrated rows show Checking", async () => {
  const request: OwnRequest = {
    ...movie(1),
    type: "tv",
    seasons: [{ seasonNumber: 1 }],
    updatedAt: "2026-10-29",
    media: {
      id: 1,
      updatedAt: "2026-10-29",
      status: 5,
      seasons: [{ seasonNumber: 1, status: 5 }],
    },
  };
  let calls = 0;
  const source = {
    list: async () => ({
      results: [
        { ...request, media: { ...request.media, seasons: undefined } },
      ],
    }),
    detail: async () => {
      calls++;
      throw new Error("offline");
    },
  };
  const first = await syncOwnRequests(
    source,
    1,
    [],
    [],
    new Map(),
    new AbortController().signal,
  );
  expect(first.rows[0]!.stage.kind).toBe("CHECKING");
  const old = { request, stage: deriveRequestStage(request), fresh: true };
  const second = await syncOwnRequests(
    source,
    1,
    [old],
    [1],
    new Map(),
    new AbortController().signal,
  );
  expect(second.rows[0]!.stage.kind).toBe("READY");
  expect(calls).toBe(1);
});
