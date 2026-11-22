import { describe, expect, test } from "bun:test";
import envelopes from "../../docs/request-notifications/progress-envelopes.fixture.json";
import {
  type ActivityRowView,
  activityRow,
  detailLine,
  etaText,
  liveRecordFor,
  orderRows,
  type RowFormat,
  sectionCounts,
} from "./activityRow";
import { normalizeRecord } from "./progressRecord";
import { deriveRequestStage } from "./stage";
import type {
  OwnRequest,
  RequestProgressRecord,
  RequestStatusItem,
} from "./types";

const NOW = Date.parse("2026-11-20T21:15:00Z");
const fmt: RowFormat = {
  requestedOn: (ms) => `day:${new Date(ms).toISOString().slice(0, 10)}`,
  releaseOn: (day) => `release:${day}`,
  airingAt: (ms) => `air:${new Date(ms).toISOString()}`,
};
const record = (
  r: unknown,
  over: Partial<RequestProgressRecord> = {},
): RequestProgressRecord => ({
  ...normalizeRecord(r as RequestProgressRecord),
  ...over,
});
const [liveMovie, liveAiring, liveComplete] = envelopes.snapshot.requests.map(
  (r) => record(r),
);

const item = (
  request: OwnRequest,
  extra: Partial<RequestStatusItem> = {},
): RequestStatusItem => ({
  request,
  stage: deriveRequestStage(request, { nowMs: NOW }),
  fresh: true,
  ...extra,
});
const movie = (over: Partial<OwnRequest> = {}): OwnRequest => ({
  id: 9001,
  status: 2,
  type: "movie",
  createdAt: "2026-11-03T10:00:00Z",
  requestedBy: { id: 7 },
  media: { status: 3, tmdbId: 100001 },
  ...over,
});
const show = (
  id: number,
  tmdbId: number,
  seasons: Record<number, number>,
  over: Partial<OwnRequest> = {},
): OwnRequest => ({
  id,
  status: 2,
  type: "tv",
  createdAt: "2026-11-01T10:00:00Z",
  requestedBy: { id: 7 },
  seasons: Object.keys(seasons).map((n) => ({ seasonNumber: Number(n) })),
  media: {
    status: 4,
    tmdbId,
    seasons: Object.entries(seasons).map(([n, s]) => ({
      seasonNumber: Number(n),
      status: s,
    })),
  },
  ...over,
});
const row = (
  i: RequestStatusItem,
  live: RequestProgressRecord | null = null,
  liveStale = false,
) => activityRow(i, live, liveStale, NOW, fmt);
const key = (v: ActivityRowView) => ({
  section: v.section,
  status: v.status.key,
  detail: v.detail?.key ?? null,
});

describe("live record selection", () => {
  const records = new Map([[9001, liveMovie]]);

  test("an own, matching, unfinished row gets its record", () => {
    expect(liveRecordFor(item(movie()), records, 7)).toBe(liveMovie);
  });

  test("another member's row, a mismatch or a finished row gets none", () => {
    expect(
      liveRecordFor(item(movie({ requestedBy: { id: 8 } })), records, 7),
    ).toBeNull();
    expect(liveRecordFor(item(movie()), records, null)).toBeNull();
    expect(liveRecordFor(item(movie({ is4k: true })), records, 7)).toBeNull();
    expect(
      liveRecordFor(
        item(movie({ media: { status: 5, tmdbId: 100001 } })),
        records,
        7,
      ),
    ).toBeNull();
    expect(liveRecordFor(item(movie({ status: 4 })), records, 7)).toBeNull();
  });

  test("a failed request with a matching live ready record stays failed", () => {
    const failed = item(movie({ status: 4 }));
    const liveReady = record(envelopes.readyRecord, {
      requestId: 9001,
      tmdbId: 100001,
    });
    const live = liveRecordFor(failed, new Map([[9001, liveReady]]), 7);
    expect(live).toBeNull();
    expect(key(row(failed, live))).toEqual({
      section: "WAITING",
      status: "request_status.status.couldnt_be_added",
      detail: "request_status.detail.failed_why",
    });
  });
});

describe("rule 1: ready", () => {
  test("canonical ready shows Requested on the request day", () => {
    const v = row(item(movie({ media: { status: 5, tmdbId: 100001 } })));
    expect(v.section).toBe("READY");
    expect(v.watchable).toBe(true);
    expect(v.progress).toEqual({
      kind: "note",
      text: {
        key: "request_status.progress.requested_on",
        params: { date: "day:2026-11-03" },
      },
      emphasized: false,
    });
  });

  test("without a request date it says Requested recently", () => {
    const v = row(
      item(movie({ createdAt: null, media: { status: 5, tmdbId: 100001 } })),
    );
    expect(v.progress).toMatchObject({
      text: { key: "request_status.progress.requested_recently" },
    });
  });

  test("library_complete: a show the request server still calls partial is ready", () => {
    const partial = item(show(9003, 300003, { 1: 5, 2: 4 }));
    expect(partial.stage.kind).toBe("PARTIAL");
    const v = row(partial, liveComplete);
    expect(v.section).toBe("READY");
    expect(v.watchable).toBe(true);
  });

  test("an ordinary live ready record on an unfinished row is ready", () => {
    const pending = item(
      movie({ id: 9005, media: { status: 3, tmdbId: 100005 } }),
    );
    const v = row(pending, record(envelopes.readyRecord));
    expect(v.section).toBe("READY");
  });
});

describe("rule 2: partly watchable show", () => {
  const airingShow = item(show(9002, 200002, { 3: 4 }));

  test("airing: every aired episode imported, next one in a requested season", () => {
    const v = row(airingShow, liveAiring);
    expect(key(v)).toEqual({
      section: "WAITING",
      status: "request_status.status.season_airing",
      detail: "request_status.detail.next_episode",
    });
    expect(v.status.params).toEqual({ season: 3 });
    expect(v.detail?.params).toEqual({ date: "air:2026-11-23T02:00:00.000Z" });
    expect(v.progress).toEqual({
      kind: "note",
      text: {
        key: "request_status.progress.episodes_out",
        params: { aired: 6, total: 10 },
      },
      emphasized: true,
    });
    expect(v.watchable).toBe(true);
  });

  test("coming: no episode of the season aired yet", () => {
    const live = record(liveAiring, {
      schedule: {
        ...liveAiring.schedule,
        seasons: [
          {
            n: 3,
            aired: 0,
            total: 10,
            imported: 0,
            nextAiring: "2026-11-23T02:00:00.000Z",
          },
        ],
      } as RequestProgressRecord["schedule"],
    });
    const v = row(airingShow, live);
    expect(v.status.key).toBe("request_status.status.season_coming");
    expect(v.detail?.key).toBe("request_status.detail.first_episode");
    expect(v.progress).toMatchObject({
      text: { params: { aired: 0, total: 10 } },
    });
  });

  test("past air time: the episode aired and is missing, so it is not airing", () => {
    const v = activityRow(
      airingShow,
      liveAiring,
      false,
      Date.parse("2026-11-23T03:00:00Z"),
      fmt,
    );
    expect(key(v)).toEqual({
      section: "WAITING",
      status: "request_status.status.some_episodes_ready",
      detail: "request_status.detail.rest_not_out_yet",
    });
    expect(v.progress).toEqual({
      kind: "note",
      text: {
        key: "request_status.progress.imported_count",
        params: { imported: 6, total: 6 },
      },
      emphasized: true,
    });
  });

  test("airing with unusable season counts shows the imported count", () => {
    const live = record(liveAiring, {
      schedule: {
        ...liveAiring.schedule,
        seasons: [{ n: 3, aired: 12, total: 10, imported: 6 }],
      } as RequestProgressRecord["schedule"],
    });
    expect(row(airingShow, live).progress).toMatchObject({
      text: { key: "request_status.progress.imported_count" },
    });
  });

  test("the next episode must be in a requested season", () => {
    const live = record(liveAiring, {
      schedule: {
        ...liveAiring.schedule,
        next: { season: 4, episode: 1 },
      } as RequestProgressRecord["schedule"],
    });
    expect(row(airingShow, live).status.key).toBe(
      "request_status.status.some_episodes_ready",
    );
  });

  test("the four 'The rest' lines", () => {
    const partialRow = item(show(9002, 200002, { 3: 4 }));
    const rest = (over: Partial<RequestProgressRecord>) =>
      row(partialRow, record(liveAiring, { schedule: null, ...over })).detail
        ?.key;
    expect(rest({ stage: "waiting", detail: "not_released_yet" })).toBe(
      "request_status.detail.rest_not_out_yet",
    );
    expect(rest({ stage: "waiting", detail: "no_release_found_yet" })).toBe(
      "request_status.detail.rest_not_available",
    );
    expect(rest({ stage: "downloading", detail: null })).toBe(
      "request_status.detail.rest_downloading",
    );
    expect(row(partialRow).detail?.key).toBe(
      "request_status.detail.rest_added_automatically",
    );
    expect(row(partialRow).progress).toEqual({ kind: "none" });
  });

  test("a live partial record makes an unfinished show partly watchable", () => {
    const pending = item(
      show(
        9002,
        200002,
        { 3: 3 },
        {
          media: {
            status: 3,
            tmdbId: 200002,
            seasons: [{ seasonNumber: 3, status: 3 }],
          },
        },
      ),
    );
    expect(pending.stage.kind).not.toBe("PARTIAL");
    expect(
      row(pending, record(liveAiring, { schedule: null })).status.key,
    ).toBe("request_status.status.some_episodes_ready");
  });
});

describe("rules 3 to 5: waiting", () => {
  test("failed, declined and unavailable each have their line", () => {
    expect(key(row(item(movie({ status: 3 }))))).toEqual({
      section: "WAITING",
      status: "request_status.status.request_declined",
      detail: "request_status.detail.declined_why",
    });
    expect(key(row(item(movie({ media: { status: 6, tmdbId: 1 } }))))).toEqual({
      section: "WAITING",
      status: "request_status.status.not_available",
      detail: "request_status.detail.unavailable_why",
    });
  });

  test("live waiting: not released, no release found, no download", () => {
    const pending = item(movie());
    const w = (detail: string | null) =>
      key(row(pending, record(liveMovie, { stage: "waiting", detail })));
    expect(w("not_released_yet")).toEqual({
      section: "WAITING",
      status: "request_status.status.waiting_for_release",
      detail: "request_status.detail.not_released_yet",
    });
    expect(w("no_release_found_yet")).toEqual({
      section: "WAITING",
      status: "request_status.status.waiting_for_release",
      detail: "request_status.detail.no_release_found_yet",
    });
    expect(w(null)).toEqual({
      section: "WAITING",
      status: "request_status.status.waiting_for_download",
      detail: "request_status.detail.no_download_active",
    });
  });

  test("unreleased with no live record: Coming date, or not released yet", () => {
    const unreleased = (date: string | null) => ({
      ...item(movie()),
      stage: deriveRequestStage(movie(), {
        futureRelease: "2026-12-03",
        today: "2026-11-20",
      }),
      availabilityDate: date,
    });
    const v = row(unreleased("2026-12-03"));
    expect(key(v)).toEqual({
      section: "WAITING",
      status: "request_status.status.waiting_for_release",
      detail: "request_status.detail.coming_on",
    });
    expect(v.detail?.params).toEqual({ date: "release:2026-12-03" });
    expect(row(unreleased(null)).detail?.key).toBe(
      "request_status.detail.not_released_yet",
    );
  });
});

describe("rule 6: active", () => {
  test("a downloading movie: live label, bar and time left (rounded up)", () => {
    const v = row(item(movie()), liveMovie);
    expect(v.section).toBe("ACTIVE");
    expect(v.status.key).toBe("request_status.status.downloading");
    expect(v.progress).toEqual({ kind: "bar", fraction: 0.418 });
    expect(v.detail).toEqual({
      key: "request_status.detail.eta_minutes",
      params: { minutes: 9 },
    });
  });

  test("no time left when the live data is stale, and never for shows", () => {
    expect(row(item(movie()), liveMovie, true).detail).toBeNull();
    const tv = item(
      show(
        9010,
        400004,
        { 1: 3 },
        {
          media: {
            status: 3,
            tmdbId: 400004,
            seasons: [{ seasonNumber: 1, status: 3 }],
          },
        },
      ),
    );
    const live = record(liveMovie, {
      requestId: 9010,
      mediaType: "tv",
      tmdbId: 400004,
      seasons: [{ n: 1, availability: "none" }],
      episodes: { total: 10, imported: 4, active: 1 },
    });
    const v = row(tv, live);
    expect(v.detail).toEqual({
      key: "request_status.detail.episodes_imported",
      params: { imported: 4, total: 10 },
    });
  });

  test("canonical download: Downloading, bytes fraction and estimate", () => {
    const canonical = movie({
      media: {
        status: 3,
        tmdbId: 100001,
        downloadStatus: [
          {
            status: "downloading",
            size: 100,
            sizeLeft: 25,
            estimatedCompletionTime: "2026-11-20T21:15:30Z",
          },
        ],
      },
    });
    const v = row(item(canonical));
    expect(v.status.key).toBe("request_status.status.downloading");
    expect(v.progress).toEqual({ kind: "bar", fraction: 0.75 });
    expect(v.detail).toEqual({ key: "request_status.detail.eta_under_minute" });
  });

  test("confirming, replacement download, canonical detail", () => {
    expect(
      row(
        item(movie()),
        record(liveMovie, {
          stage: "confirming_availability",
          etaSeconds: null,
        }),
      ).detail?.key,
    ).toBe("request_status.detail.confirming_ready");
    expect(
      row(
        item(movie()),
        record(liveMovie, {
          stage: "searching",
          detail: "download_failed_retrying",
        }),
      ).detail?.key,
    ).toBe("request_status.detail.replacement_download");
    expect(row(item(movie())).detail?.key).toBe(
      "request_status.detail.no_progress_yet",
    );
    expect(
      row(
        item(movie()),
        record(liveMovie, { stage: "searching", etaSeconds: null }),
      ).detail,
    ).toBeNull();
    expect(
      row(item(movie()), record(liveMovie, { stage: "searching" })).progress,
    ).toEqual({ kind: "none" });
  });

  test("time left text", () => {
    expect(etaText(59)).toEqual({
      key: "request_status.detail.eta_under_minute",
    });
    expect(etaText(60)).toEqual({
      key: "request_status.detail.eta_minutes",
      params: { minutes: 1 },
    });
    expect(etaText(61)).toEqual({
      key: "request_status.detail.eta_minutes",
      params: { minutes: 2 },
    });
  });
});

describe("rule 7, order and counts", () => {
  const translate = (k: string, p?: Record<string, string | number>) =>
    p ? `${k}(${Object.values(p).join(",")})` : k;

  test("stale rows append Last known status, or show it alone", () => {
    const stale = row({ ...item(movie()), fresh: false });
    expect(stale.stale).toBe(true);
    expect(detailLine(stale, translate)).toBe(
      "request_status.detail.with_last_known(request_status.detail.no_progress_yet)",
    );
    const ready = row({
      ...item(movie({ media: { status: 5, tmdbId: 100001 } })),
      fresh: false,
    });
    expect(detailLine(ready, translate)).toBe(
      "request_status.detail.last_known_status",
    );
    expect(detailLine(row(item(movie())), translate)).toBe(
      "request_status.detail.no_progress_yet",
    );
    expect(row(item(movie()), liveMovie, true).stale).toBe(true);
  });

  test("sections in page order; Ready newest request first; others keep their order", () => {
    const rows = [
      row(
        item(
          movie({
            id: 1,
            createdAt: "2026-11-01T00:00:00Z",
            media: { status: 5 },
          }),
        ),
      ),
      row(item(movie({ id: 2 }))),
      row(item(movie({ id: 3, status: 4 }))),
      row(
        item(
          movie({
            id: 4,
            createdAt: "2026-11-10T00:00:00Z",
            media: { status: 5 },
          }),
        ),
      ),
      row(item(movie({ id: 5 }))),
    ];
    expect(orderRows(rows).map((r) => r.item.request.id)).toEqual([
      2, 5, 3, 4, 1,
    ]);
    expect(sectionCounts(rows)).toEqual({ ACTIVE: 2, WAITING: 1, READY: 2 });
  });
});
