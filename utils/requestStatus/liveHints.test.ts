import { describe, expect, test } from "bun:test";
import envelopes from "../../docs/request-notifications/progress-envelopes.fixture.json";
import { liveHint } from "./liveHints";
import { normalizeRecord } from "./progressRecord";
import { deriveRequestStage } from "./stage";
import type {
  OwnRequest,
  RequestProgressRecord,
  RequestStatusItem,
} from "./types";

const record = (
  over: Partial<RequestProgressRecord> = {},
): RequestProgressRecord => ({
  ...normalizeRecord(
    envelopes.snapshot.requests[0] as unknown as RequestProgressRecord,
  ),
  ...over,
});
const movie: OwnRequest = {
  id: 9001,
  status: 2,
  type: "movie",
  media: { status: 3, tmdbId: 100001 },
};
const row = (request: OwnRequest, fresh = true): RequestStatusItem => ({
  request,
  stage: deriveRequestStage(request),
  fresh,
});

describe("live hints (the TV's onLiveRecord)", () => {
  test("a record for a request with no row: the full sync finds it", () => {
    expect(liveHint(record(), undefined).kind).toBe("unknown_request");
  });

  test("agreeing record: nothing to do", () => {
    expect(liveHint(record(), row(movie)).kind).toBe("none");
  });

  test("availability or request status differs, or the row is not fresh: re-read that request", () => {
    expect(liveHint(record({ availability: "full" }), row(movie)).kind).toBe(
      "refresh",
    );
    expect(liveHint(record({ seerrStatus: 5 }), row(movie)).kind).toBe(
      "refresh",
    );
    expect(liveHint(record(), row(movie, false)).kind).toBe("refresh");
  });

  test("a stale or mismatched record is ignored", () => {
    expect(
      liveHint(record({ availability: "full", stale: true }), row(movie)).kind,
    ).toBe("none");
    expect(
      liveHint(record({ availability: "full", is4k: true }), row(movie)).kind,
    ).toBe("none");
  });

  test("a show's season availability that moved", () => {
    const show: OwnRequest = {
      id: 9002,
      status: 2,
      type: "tv",
      seasons: [{ seasonNumber: 3 }],
      media: {
        status: 4,
        tmdbId: 200002,
        seasons: [{ seasonNumber: 3, status: 4 }],
      },
    };
    const live = normalizeRecord(
      envelopes.snapshot.requests[1] as unknown as RequestProgressRecord,
    );
    expect(liveHint(live, row(show)).kind).toBe("none");
    expect(
      liveHint(
        { ...live, seasons: [{ n: 3, availability: "full" }] },
        row(show),
      ).kind,
    ).toBe("refresh");
  });
});
