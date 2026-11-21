import { describe, expect, test } from "bun:test";
import { deriveRequestStage } from "./stage";
import {
  httpStatus,
  lookupLibraryItemId,
  MAX_ROWS,
  type RequestReadApi,
  refreshOneRequest,
  replaceItem,
  type SyncInput,
  type SyncResult,
  syncOwnRequests,
} from "./sync";
import type { OwnRequest, RequestStatusItem } from "./types";

const ME = 7;
const httpError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status } });
const movie = (id: number, over: Partial<OwnRequest> = {}): OwnRequest => ({
  id,
  status: 2,
  type: "movie",
  updatedAt: `2026-11-${String(10 + (id % 10)).padStart(2, "0")}T00:00:00Z`,
  requestedBy: { id: ME },
  media: { status: 3, tmdbId: 1000 + id },
  ...over,
});
const show = (
  id: number,
  tmdbId: number,
  over: Partial<OwnRequest> = {},
): OwnRequest => ({
  id,
  status: 2,
  type: "tv",
  updatedAt: "2026-11-15T00:00:00Z",
  requestedBy: { id: ME },
  seasons: [{ seasonNumber: 1 }],
  media: { status: 4, tmdbId, updatedAt: "2026-11-15T00:00:00Z" },
  ...over,
});
const asItem = (request: OwnRequest, fresh = true): RequestStatusItem => ({
  request,
  stage: deriveRequestStage(request),
  fresh,
});

interface FakeOptions {
  list: OwnRequest[];
  details?: Record<number, OwnRequest | number>;
}
function fakeApi({ list, details = {} }: FakeOptions) {
  const calls = {
    list: [] as number[],
    detail: [] as number[],
    inFlight: 0,
    maxInFlight: 0,
  };
  const api: RequestReadApi = {
    async listOwn({ take, skip, requestedBy }) {
      calls.list.push(skip);
      expect(requestedBy).toBe(ME);
      const results = list.slice(skip, skip + take);
      return {
        results,
        pageInfo: {
          page: Math.floor(skip / take) + 1,
          pages: Math.max(1, Math.ceil(list.length / take)),
        },
      };
    },
    async detail(id) {
      calls.detail.push(id);
      calls.inFlight++;
      calls.maxInFlight = Math.max(calls.maxInFlight, calls.inFlight);
      await new Promise((r) => setTimeout(r, 1));
      calls.inFlight--;
      const d = details[id];
      if (typeof d === "number") throw httpError(d);
      if (!d) throw httpError(404);
      return d;
    },
  };
  return { api, calls };
}
const input = (over: Partial<SyncInput> = {}): SyncInput => ({
  seerrUserId: ME,
  previous: [],
  trackedIds: [],
  downloadObserved: new Set(),
  missing: new Map(),
  isCurrent: () => true,
  ...over,
});
type OkResult = Extract<SyncResult, { kind: "ok" }>;
const ok = (r: SyncResult): OkResult => {
  if (r.kind !== "ok") throw new Error("superseded");
  return r;
};

describe("paging", () => {
  test("pages of 50 until a short page; complete; newest update first", async () => {
    const list = Array.from({ length: 110 }, (_, i) => movie(i + 1));
    const { api, calls } = fakeApi({ list });
    const r = ok(await syncOwnRequests(api, input()));
    expect(calls.list).toEqual([0, 50, 100]);
    expect(r.items).toHaveLength(110);
    expect(r.complete).toBe(true);
    expect(r.syncComplete).toBe(true);
    expect(r.error).toBeNull();
    const updated = r.items.map((i) => i.request.updatedAt ?? "");
    expect([...updated].sort().reverse()).toEqual(updated);
  });

  test("stops at 1,000 requests and reports a limited history", async () => {
    const list = Array.from({ length: 1050 }, (_, i) => movie(i + 1));
    const { api, calls } = fakeApi({ list });
    const r = ok(await syncOwnRequests(api, input()));
    expect(calls.list).toHaveLength(MAX_ROWS / 50);
    expect(r.items).toHaveLength(1000);
    expect(r.complete).toBe(false);
    expect(r.syncComplete).toBe(false);
    expect(r.error).toBe("limited_history");
  });

  test("another member's request in the answer is never kept", async () => {
    const { api } = fakeApi({
      list: [
        movie(1),
        movie(2, { requestedBy: { id: 8 } }),
        movie(3, { requestedBy: null }),
      ],
    });
    const r = ok(await syncOwnRequests(api, input()));
    expect(r.items.map((i) => i.request.id)).toEqual([1]);
  });

  test("a read that finishes after the session changed is thrown away", async () => {
    let current = true;
    const { api } = fakeApi({ list: [movie(1)] });
    const slow: RequestReadApi = {
      ...api,
      async listOwn(p) {
        const page = await api.listOwn(p);
        current = false;
        return page;
      },
    };
    expect(
      (await syncOwnRequests(slow, input({ isCurrent: () => current }))).kind,
    ).toBe("superseded");
  });

  test("a failure to read the list itself is thrown to the caller with its status", async () => {
    const api: RequestReadApi = {
      listOwn: async () => {
        throw httpError(401);
      },
      detail: async () => movie(1),
    };
    const error = await syncOwnRequests(api, input()).catch((e) => e);
    expect(httpStatus(error)).toBe(401);
  });
});

describe("show seasons", () => {
  test("one detail read per show, at most four at a time", async () => {
    const shows = Array.from({ length: 9 }, (_, i) => show(i + 1, 500 + i));
    const details = Object.fromEntries(
      shows.map((s) => [
        s.id,
        {
          ...s,
          media: { ...s.media, seasons: [{ seasonNumber: 1, status: 5 }] },
        },
      ]),
    );
    const sameShowAgain = show(20, 500, { seasons: [{ seasonNumber: 2 }] });
    const { api, calls } = fakeApi({
      list: [...shows, sameShowAgain],
      details,
    });
    const r = ok(await syncOwnRequests(api, input()));
    expect(calls.detail).toHaveLength(9);
    expect(calls.maxInFlight).toBeLessThanOrEqual(4);
    expect(r.items.find((i) => i.request.id === 1)?.stage.kind).toBe("READY");
    // Requests for the same show share its season read.
    expect(
      r.items.find((i) => i.request.id === 20)?.request.media?.seasons,
    ).toEqual([{ seasonNumber: 1, status: 5 }]);
  });

  test("an unchanged ready show reuses its seasons without a read", async () => {
    const s = show(1, 500, {
      media: {
        status: 4,
        tmdbId: 500,
        updatedAt: "x",
        seasons: [{ seasonNumber: 1, status: 5 }],
      },
    });
    const { api, calls } = fakeApi({
      list: [{ ...s, media: { ...s.media, seasons: undefined } }],
    });
    const r = ok(await syncOwnRequests(api, input({ previous: [asItem(s)] })));
    expect(calls.detail).toEqual([]);
    expect(r.items[0].stage.kind).toBe("READY");
  });

  test("a failed season read keeps the last stage, not fresh, and says so", async () => {
    const prior = show(1, 500, {
      media: {
        status: 4,
        tmdbId: 500,
        seasons: [{ seasonNumber: 1, status: 4 }],
      },
    });
    const { api } = fakeApi({
      list: [show(1, 500, { updatedAt: "2026-11-16T00:00:00Z" })],
      details: { 1: 500 },
    });
    const r = ok(
      await syncOwnRequests(api, input({ previous: [asItem(prior)] })),
    );
    expect(r.items[0].fresh).toBe(false);
    expect(r.items[0].stage.kind).toBe("PARTIAL");
    expect(r.items[0].request.media?.seasons).toEqual([
      { seasonNumber: 1, status: 4 },
    ]);
    expect(r.error).toBe("season_statuses");
    expect(r.syncComplete).toBe(false);
  });

  test("a new show whose seasons can't be read shows Checking", async () => {
    const { api } = fakeApi({ list: [show(1, 500)], details: { 1: 503 } });
    const r = ok(await syncOwnRequests(api, input()));
    expect(r.items[0].stage.kind).toBe("CHECKING");
    expect(r.items[0].stage.detail?.key).toBe(
      "request_status.detail.season_status_not_refreshed",
    );
  });

  test("a season read answered for another member counts as failed", async () => {
    const { api } = fakeApi({
      list: [show(1, 500)],
      details: { 1: show(1, 500, { requestedBy: { id: 8 } }) },
    });
    expect(ok(await syncOwnRequests(api, input())).items[0].fresh).toBe(false);
  });
});

describe("removal", () => {
  test("a request missing from a complete list goes after two 404s on separate syncs", async () => {
    const gone = asItem(movie(5));
    const { api } = fakeApi({ list: [movie(1)] });
    const first = ok(
      await syncOwnRequests(api, input({ previous: [asItem(movie(1)), gone] })),
    );
    expect(first.confirmedGone.size).toBe(0);
    expect(first.items.find((i) => i.request.id === 5)?.fresh).toBe(false);
    expect(first.missing.get(5)).toBe(1);
    const second = ok(
      await syncOwnRequests(
        api,
        input({ previous: first.items, missing: first.missing }),
      ),
    );
    expect([...second.confirmedGone]).toEqual([5]);
    expect(second.items.some((i) => i.request.id === 5)).toBe(false);
  });

  test("another failure resets the count; an own detail brings the row back", async () => {
    const gone = asItem(movie(5));
    const { api } = fakeApi({ list: [], details: { 5: 500 } });
    const r = ok(
      await syncOwnRequests(
        api,
        input({ previous: [gone], missing: new Map([[5, 1]]) }),
      ),
    );
    expect(r.missing.get(5)).toBe(0);
    expect(r.items[0].fresh).toBe(false);
    const back = fakeApi({
      list: [],
      details: { 5: movie(5, { media: { status: 5, tmdbId: 1005 } }) },
    });
    const r2 = ok(
      await syncOwnRequests(
        back.api,
        input({ previous: [gone], missing: new Map([[5, 1]]) }),
      ),
    );
    expect(r2.items[0].stage.kind).toBe("READY");
    expect(r2.missing.has(5)).toBe(false);
  });

  test("a limited list never reads details; missing rows stay, not fresh", async () => {
    const list = Array.from({ length: 1000 }, (_, i) => movie(i + 1));
    const { api, calls } = fakeApi({ list: [...list, movie(2000)] });
    const r = ok(
      await syncOwnRequests(
        api,
        input({ previous: [asItem(movie(3000))], trackedIds: [4000] }),
      ),
    );
    expect(calls.detail).toEqual([]);
    expect(r.items.find((i) => i.request.id === 3000)?.fresh).toBe(false);
    expect(r.items.some((i) => i.request.id === 4000)).toBe(false);
  });

  test("ids the journal still tracks are checked even with no row on screen", async () => {
    const { api, calls } = fakeApi({ list: [], details: { 9: 404 } });
    const r = ok(
      await syncOwnRequests(
        api,
        input({ trackedIds: [9], missing: new Map([[9, 1]]) }),
      ),
    );
    expect(calls.detail).toEqual([9]);
    expect([...r.confirmedGone]).toEqual([9]);
  });
});

describe("one request, library id", () => {
  const prior = asItem(movie(1));
  const base = {
    id: 1,
    prior,
    journalInitialized: true,
    seerrUserId: ME,
    downloadObserved: false,
    isCurrent: () => true,
  };
  const detailApi = (d: OwnRequest | number) => ({
    detail: async () => {
      if (typeof d === "number") throw httpError(d);
      return d;
    },
  });

  test("a matching detail replaces the row", async () => {
    const r = await refreshOneRequest(
      detailApi(movie(1, { media: { status: 5, tmdbId: 1001 } })),
      base,
    );
    expect(r.kind).toBe("refreshed");
    if (r.kind === "refreshed") expect(r.item.stage.kind).toBe("READY");
  });

  test("unknown row, another owner, another quality or a 404 hands over to a full sync", async () => {
    expect(
      (
        await refreshOneRequest(detailApi(movie(1)), {
          ...base,
          prior: undefined,
        })
      ).kind,
    ).toBe("full_sync");
    expect(
      (
        await refreshOneRequest(detailApi(movie(1)), {
          ...base,
          journalInitialized: false,
        })
      ).kind,
    ).toBe("full_sync");
    expect(
      (
        await refreshOneRequest(
          detailApi(movie(1, { requestedBy: { id: 8 } })),
          base,
        )
      ).kind,
    ).toBe("full_sync");
    expect(
      (await refreshOneRequest(detailApi(movie(1, { is4k: true })), base)).kind,
    ).toBe("full_sync");
    expect((await refreshOneRequest(detailApi(404), base)).kind).toBe(
      "full_sync",
    );
  });

  test("a sign-in answer goes to the caller; other failures keep the row", async () => {
    expect(await refreshOneRequest(detailApi(401), base)).toEqual({
      kind: "auth",
      status: 401,
    });
    expect((await refreshOneRequest(detailApi(500), base)).kind).toBe("keep");
    const showPrior = asItem(show(2, 600));
    const noSeasons = await refreshOneRequest(detailApi(show(2, 600)), {
      ...base,
      id: 2,
      prior: showPrior,
    });
    expect(noSeasons.kind).toBe("keep");
    expect(
      (
        await refreshOneRequest(detailApi(movie(1)), {
          ...base,
          isCurrent: () => false,
        })
      ).kind,
    ).toBe("superseded");
  });

  test("replacing a row keeps the TV's order", () => {
    const items = [asItem(movie(1)), asItem(movie(2))];
    const next = replaceItem(
      items,
      asItem(movie(1, { updatedAt: "2026-12-01T00:00:00Z" })),
    );
    expect(next.map((i) => i.request.id)).toEqual([1, 2]);
  });

  test("library id: the row's own first, else one verified title read, never the other quality", async () => {
    const id = "b".repeat(32);
    const titles = {
      movie: async (tmdb: number) => ({
        id: tmdb,
        mediaInfo: { jellyfinMediaId: id },
      }),
      tv: async (tmdb: number) => ({
        id: tmdb + 1,
        mediaInfo: { jellyfinMediaId: id },
      }),
    };
    expect(
      await lookupLibraryItemId(
        titles,
        movie(1, { media: { tmdbId: 5, jellyfinMediaId: "c".repeat(32) } }),
      ),
    ).toBe("c".repeat(32));
    expect(await lookupLibraryItemId(titles, movie(1))).toBe(id);
    expect(
      await lookupLibraryItemId(titles, movie(1, { is4k: true })),
    ).toBeNull();
    expect(await lookupLibraryItemId(titles, show(2, 600))).toBeNull();
  });
});
