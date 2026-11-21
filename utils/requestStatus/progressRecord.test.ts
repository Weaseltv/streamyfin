import { describe, expect, test } from "bun:test";
import envelopes from "../../docs/request-notifications/progress-envelopes.fixture.json";
import {
  isValidRecord,
  matchesRow,
  normalizeRecord,
  recordFraction,
  recordStageLabel,
} from "./progressRecord";
import type { OwnRequest, RequestProgressRecord } from "./types";

const [downloading, airing, libraryComplete] = envelopes.snapshot.requests;
const ready = envelopes.readyRecord;
const rec = (over: Record<string, unknown> = {}) => ({
  ...downloading,
  ...over,
});

describe("isValidRecord", () => {
  test("every record the operator supplied is accepted", () => {
    for (const r of [
      ...envelopes.snapshot.requests,
      envelopes.update.request,
      ready,
    ]) {
      expect(isValidRecord(r)).toBe(true);
    }
  });

  test("optional fields may be missing; defaults are filled as the TV's decoder does", () => {
    const { seasons: _s, stale: _st, ...bare } = downloading;
    expect(isValidRecord(bare)).toBe(true);
    const n = normalizeRecord(bare as unknown as RequestProgressRecord);
    expect(n.seasons).toEqual([]);
    expect(n.stale).toBe(false);
  });

  test("impossible or wrongly typed values are rejected, never repaired", () => {
    const bad: Record<string, unknown>[] = [
      { requestId: 0 },
      { requestId: 1.5 },
      { tmdbId: "100001" },
      { mediaType: "episode" },
      { is4k: "false" },
      { availability: "most" },
      { stage: 3 },
      { seasons: [{ n: -1, availability: "full" }] },
      { seasons: [{ n: 1, availability: "half" }] },
      { stageProgress: 1.5 },
      { stageProgress: -0.1 },
      { bytesLeft: -1 },
      { etaSeconds: Number.NaN },
      { episodes: { total: -1 } },
      { episodes: { imported: 2.5 } },
      { schedule: { seasons: [{ n: 1, aired: "6", total: 10, imported: 6 }] } },
      { schedule: { next: { season: 3 }, seasons: [] } },
      { observedAt: "yesterday" },
      { updatedAt: "2026-11-20" },
      { observedAt: undefined },
    ];
    for (const over of bad) expect(isValidRecord(rec(over))).toBe(false);
    expect(isValidRecord(null)).toBe(false);
    expect(isValidRecord([downloading])).toBe(false);
  });

  test("an unknown stage or detail is accepted and shows Checking request status", () => {
    const r = rec({ stage: "teleporting", detail: "new_detail" });
    expect(isValidRecord(r)).toBe(true);
    expect(recordStageLabel(r as unknown as RequestProgressRecord).key).toBe(
      "request_status.status.checking_request_status",
    );
  });
});

describe("matchesRow", () => {
  const show: OwnRequest = {
    id: 9002,
    status: 2,
    type: "tv",
    seasons: [{ seasonNumber: 3 }],
    media: { tmdbId: 200002 },
  };
  const r = airing as unknown as RequestProgressRecord;

  test("same request, TMDB id, type, quality and season set", () => {
    expect(matchesRow(r, show)).toBe(true);
    expect(
      matchesRow(r, {
        ...show,
        seasons: [{ seasonNumber: 3 }, { seasonNumber: 3 }],
      }),
    ).toBe(true);
  });

  test("any difference refuses the record", () => {
    expect(matchesRow(r, { ...show, id: 9 })).toBe(false);
    expect(matchesRow(r, { ...show, type: "movie" })).toBe(false);
    expect(matchesRow(r, { ...show, media: { tmdbId: 1 } })).toBe(false);
    expect(matchesRow(r, { ...show, is4k: true })).toBe(false);
    expect(matchesRow(r, { ...show, seasons: [{ seasonNumber: 2 }] })).toBe(
      false,
    );
    expect(
      matchesRow(r, {
        ...show,
        seasons: [{ seasonNumber: 3 }, { seasonNumber: 4 }],
      }),
    ).toBe(false);
  });

  test("movies ignore seasons", () => {
    const movie: OwnRequest = {
      id: 9001,
      status: 2,
      type: "movie",
      media: { tmdbId: 100001 },
    };
    expect(
      matchesRow(downloading as unknown as RequestProgressRecord, movie),
    ).toBe(true);
  });
});

describe("labels and fraction", () => {
  const label = (stage: string, detail: string | null = null) =>
    recordStageLabel(rec({ stage, detail }) as unknown as RequestProgressRecord)
      .key;

  test("each service stage has the TV's label", () => {
    expect(label("pending_approval")).toBe(
      "request_status.status.waiting_for_approval",
    );
    expect(label("approved")).toBe("request_status.status.request_accepted");
    expect(label("waiting", "not_released_yet")).toBe(
      "request_status.status.waiting_for_release",
    );
    expect(label("waiting", "no_release_found_yet")).toBe(
      "request_status.status.waiting_for_download",
    );
    expect(label("searching")).toBe("request_status.status.searching");
    expect(label("queued")).toBe("request_status.status.queued");
    expect(label("downloading")).toBe("request_status.status.downloading");
    expect(label("checking")).toBe("request_status.status.checking_download");
    expect(label("unpacking")).toBe("request_status.status.unpacking");
    expect(label("importing")).toBe("request_status.status.importing");
    expect(label("adding_to_library")).toBe(
      "request_status.status.adding_to_library",
    );
    expect(label("confirming_availability")).toBe(
      "request_status.status.finishing_up",
    );
    expect(label("ready")).toBe("request_status.status.finishing_up");
    expect(label("paused")).toBe("request_status.status.paused");
    expect(label("declined")).toBe(
      "request_status.status.checking_request_status",
    );
  });

  test("a bar only while downloading or unpacking", () => {
    expect(
      recordFraction(downloading as unknown as RequestProgressRecord),
    ).toBe(0.418);
    expect(
      recordFraction(
        rec({
          stage: "unpacking",
          stageProgress: 0.5,
        }) as unknown as RequestProgressRecord,
      ),
    ).toBe(0.5);
    expect(
      recordFraction(
        rec({
          stage: "importing",
          stageProgress: 0.5,
        }) as unknown as RequestProgressRecord,
      ),
    ).toBeUndefined();
    expect(
      recordFraction(libraryComplete as unknown as RequestProgressRecord),
    ).toBeUndefined();
  });
});
