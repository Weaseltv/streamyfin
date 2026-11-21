import { describe, expect, test } from "bun:test";
import fixture from "../../docs/request-notifications/request-stages.fixture.json";
import {
  deriveRequestStage,
  eventKey,
  libraryItemId,
  libraryItemIdFor,
  percentOf,
  presentationKey,
  seasonStatusUnknownStage,
} from "./stage";
import type { OwnRequest } from "./types";

const NOW = Date.parse("2026-11-21T12:00:00Z");
const TODAY = "2026-11-21";
const byName = new Map(fixture.cases.map((c) => [c.name, c]));
const caseRequest = (name: string) =>
  byName.get(name)?.request as unknown as OwnRequest;

describe("TV fixture (docs/request-notifications/request-stages.fixture.json)", () => {
  for (const c of fixture.cases) {
    test(c.name, () => {
      const request = c.request as unknown as OwnRequest;
      // A row whose seasons could not be read keeps its last stage; a new one shows Checking.
      const stage =
        "fresh" in c && c.fresh === false
          ? seasonStatusUnknownStage()
          : deriveRequestStage(request, { nowMs: NOW, today: TODAY });
      expect(stage.kind).toBe(c.expectedKind as typeof stage.kind);
      expect(eventKey(request, stage)).toBe(c.expectedKey);
      if ("notify" in c) expect(stage.notify).toBe(c.notify as boolean);
    });
  }

  for (const example of fixture.eventExamples) {
    test(`event sequence ${example.sequence.join(" → ")}`, () => {
      const names =
        example.sequence[0] === "failed"
          ? ["failed", "retried_request_ready"]
          : ["season_partial_p", "season_partial_a", "tv_full_after_partial"];
      const keys = names.map((n) =>
        eventKey(
          caseRequest(n),
          deriveRequestStage(caseRequest(n), { nowMs: NOW, today: TODAY }),
        ),
      );
      expect(keys).toEqual(example.keys);
    });
  }
});

const movie = (extra: Partial<OwnRequest> = {}): OwnRequest => ({
  id: 1,
  status: 2,
  type: "movie",
  requestedBy: { id: 7 },
  media: { status: 3, tmdbId: 10 },
  ...extra,
});

describe("stages", () => {
  test("terminal keys are byte-equal to the TV and the website, HD and 4K", () => {
    const ready = movie({ id: 41, media: { status: 5, status4k: 5 } });
    expect(eventKey(ready, deriveRequestStage(ready))).toBe("v1|41|hd|ready|-");
    const ready4k = { ...ready, is4k: true };
    expect(eventKey(ready4k, deriveRequestStage(ready4k))).toBe(
      "v1|41|4k|ready|-",
    );
    const failed = movie({ id: 42, status: 4 });
    expect(eventKey(failed, deriveRequestStage(failed))).toBe(
      "v1|42|hd|failed|-",
    );
    const declined = movie({ id: 43, status: 3 });
    expect(eventKey(declined, deriveRequestStage(declined))).toBe(
      "v1|43|hd|failed|-",
    );
    const failed4k = movie({ id: 44, status: 4, is4k: true });
    expect(eventKey(failed4k, deriveRequestStage(failed4k))).toBe(
      "v1|44|4k|failed|-",
    );
  });

  test("failure reasons follow the TV's labels", () => {
    expect(deriveRequestStage(movie({ status: 3 })).failure).toBe("declined");
    expect(deriveRequestStage(movie({ status: 3 })).label.key).toBe(
      "request_status.status.request_declined",
    );
    expect(deriveRequestStage(movie({ media: { status: 6 } })).failure).toBe(
      "unavailable",
    );
    expect(deriveRequestStage(movie({ media: { status: 7 } })).label.key).toBe(
      "request_status.status.not_available",
    );
    expect(deriveRequestStage(movie({ status: 4 })).label.key).toBe(
      "request_status.status.couldnt_be_added",
    );
    // A removed title after completion is shown as failed but never notifies.
    expect(
      deriveRequestStage(movie({ status: 5, media: { status: 6 } })).notify,
    ).toBe(false);
  });

  test("download percent truncates and only movies get a time estimate", () => {
    const eta = "2026-11-21T12:30:00Z";
    const row = {
      status: "downloading",
      size: 100,
      sizeLeft: 71,
      estimatedCompletionTime: eta,
    };
    const m = deriveRequestStage(
      movie({ media: { status: 3, downloadStatus: [row] } }),
      {
        nowMs: NOW,
      },
    );
    expect(m.kind).toBe("DOWNLOADING");
    expect(m.label).toEqual({
      key: "request_status.status.downloading_percent",
      params: { percent: 29 },
    });
    expect(m.eta).toBe(Date.parse(eta));
    const show = deriveRequestStage(
      {
        id: 2,
        status: 2,
        type: "tv",
        seasons: [{ seasonNumber: 1 }],
        media: {
          status: 3,
          seasons: [{ seasonNumber: 1, status: 3 }],
          downloadStatus: [row],
        },
      },
      { nowMs: NOW },
    );
    expect(show.kind).toBe("DOWNLOADING");
    expect(show.eta).toBeUndefined();
    expect(percentOf(0.29)).toBe(29);
    expect(percentOf(1)).toBe(100);
  });

  test("an estimate in the past is not used", () => {
    const row = {
      status: "downloading",
      size: 100,
      sizeLeft: 50,
      estimatedCompletionTime: "2026-11-21T11:00:00Z",
    };
    const s = deriveRequestStage(
      movie({ media: { status: 3, downloadStatus: [row] } }),
      {
        nowMs: NOW,
      },
    );
    expect(s.eta).toBeUndefined();
  });

  test("an unreleased movie waits for its date; today or earlier does not", () => {
    const s = deriveRequestStage(movie(), {
      futureRelease: "2026-12-03",
      today: TODAY,
    });
    expect(s.kind).toBe("UNRELEASED");
    expect(s.label).toEqual({
      key: "request_status.status.not_out_yet",
      params: { date: "2026-12-03" },
    });
    expect(
      deriveRequestStage(movie(), { futureRelease: TODAY, today: TODAY }).kind,
    ).toBe("WAITING_LIBRARY");
    expect(
      deriveRequestStage(movie(), { futureRelease: "soon", today: TODAY }).kind,
    ).toBe("WAITING_LIBRARY");
  });

  test("after a download was seen and the queue empties, it checks the library", () => {
    const s = deriveRequestStage(movie(), { downloadObserved: true });
    expect(s.kind).toBe("CHECKING");
    expect(s.label.key).toBe("request_status.status.checking_library");
    expect(s.detail?.key).toBe(
      "request_status.detail.progress_no_longer_reported",
    );
    expect(s.downloadObserved).toBe(true);
    const fresh = deriveRequestStage(movie());
    expect(fresh.kind).toBe("WAITING_LIBRARY");
    expect(fresh.detail?.key).toBe("request_status.detail.no_progress_yet");
  });

  test("a partly ready show keeps the remaining seasons' stage as its detail", () => {
    const show: OwnRequest = {
      id: 8,
      status: 2,
      type: "tv",
      seasons: [{ seasonNumber: 2 }, { seasonNumber: 1 }],
      media: {
        status: 4,
        seasons: [
          { seasonNumber: 1, status: 5 },
          { seasonNumber: 2, status: 3 },
        ],
        downloadStatus: [
          {
            status: "downloading",
            size: 200,
            sizeLeft: 50,
            episode: { seasonNumber: 2 },
          },
          {
            status: "downloading",
            size: 999,
            sizeLeft: 0,
            episode: { seasonNumber: 1 },
          },
        ],
      },
    };
    const s = deriveRequestStage(show);
    expect(s.kind).toBe("PARTIAL");
    expect(s.signature).toBe("1:A");
    expect(s.detail?.key).toBe("request_status.status.downloading_percent");
    expect(s.progress).toBe(0.75);
  });
});

describe("keys and library ids", () => {
  test("partial keys share one presentation key; others are their own", () => {
    expect(presentationKey("v1|8|hd|partial|1:A,2:P")).toBe("v1|8|hd|partial");
    expect(presentationKey("v1|8|hd|partial|1:P")).toBe("v1|8|hd|partial");
    expect(presentationKey("v1|8|hd|ready|-")).toBe("v1|8|hd|ready|-");
    expect(presentationKey("v1|8|hd|partial")).toBe("v1|8|hd|partial");
  });

  test("a 4K request never opens the HD copy", () => {
    const id = "a".repeat(32);
    expect(
      libraryItemId(movie({ is4k: true, media: { jellyfinMediaId: id } })),
    ).toBeNull();
    expect(
      libraryItemId(movie({ is4k: true, media: { jellyfinMediaId4k: id } })),
    ).toBe(id);
    expect(libraryItemId(movie({ media: { jellyfinMediaId: id } }))).toBe(id);
    expect(
      libraryItemId(movie({ media: { jellyfinMediaId: "not-an-id" } })),
    ).toBeNull();
    expect(
      libraryItemIdFor(
        { jellyfinMediaId: "0123abcd-0123-abcd-0123-0123456789ab" },
        false,
      ),
    ).toBe("0123abcd-0123-abcd-0123-0123456789ab");
  });
});
