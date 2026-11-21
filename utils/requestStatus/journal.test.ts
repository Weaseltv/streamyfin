import { describe, expect, test } from "bun:test";
import fixture from "../../docs/request-notifications/request-stages.fixture.json";
import {
  badgeCount,
  badgeLabel,
  decodeJournal,
  emptyJournal,
  forgetRequest,
  type JournalStorage,
  markDelivered,
  markOpened,
  type RequestJournal,
  readJournal,
  seedRequest,
  setEnabled,
  trackEvents,
  writeJournal,
} from "./journal";
import { deriveRequestStage, eventKey } from "./stage";
import type { OwnRequest, RequestStatusItem } from "./types";

const SCOPE = "request_notifications_weaselplex|7";
const none = new Set<number>();
const item = (request: OwnRequest, fresh = true): RequestStatusItem => ({
  request,
  stage: deriveRequestStage(request),
  fresh,
});
const caseItem = (name: string) => {
  const c = fixture.cases.find((x) => x.name === name);
  if (!c) throw new Error(name);
  return item(c.request as unknown as OwnRequest);
};
const movie = (id: number, mediaStatus: number, status = 2): OwnRequest => ({
  id,
  status,
  type: "movie",
  requestedBy: { id: 7 },
  media: { status: mediaStatus },
});
const show = (
  id: number,
  availability: Record<number, number>,
): OwnRequest => ({
  id,
  status: 2,
  type: "tv",
  requestedBy: { id: 7 },
  seasons: Object.keys(availability).map((n) => ({ seasonNumber: Number(n) })),
  media: {
    status: 4,
    seasons: Object.entries(availability).map(([n, s]) => ({
      seasonNumber: Number(n),
      status: s,
    })),
  },
});
const track = (
  j: RequestJournal,
  items: RequestStatusItem[],
  visible = false,
) => trackEvents(j, items, SCOPE, none, visible);
const pendingKeys = (j: RequestJournal) => j.pending.map((e) => e.key);

describe("baseline", () => {
  test("the first sync announces nothing already finished, and stays quiet after reload", () => {
    const ready = item(movie(11, 5));
    const first = track(emptyJournal(), [ready]);
    expect(first.initialized).toBe(true);
    expect(first.pending).toEqual([]);
    expect(first.delivered).toEqual(["v1|11|hd|ready|-"]);
    const reloaded = decodeJournal(JSON.parse(JSON.stringify(first)));
    expect(track(reloaded, [ready]).pending).toEqual([]);
  });

  test("a request submitted here is exempt from the baseline", () => {
    const seeded = seedRequest(emptyJournal(), 11, false);
    const next = track(seeded, [item(movie(11, 5))]);
    expect(pendingKeys(next)).toEqual(["v1|11|hd|ready|-"]);
    expect(next.seeded).toEqual([]);
  });

  test("a row whose seasons failed stays awaiting its baseline until a fresh read", () => {
    const stale = { ...item(show(8, { 1: 5 })), fresh: false };
    const first = track(emptyJournal(), [stale]);
    expect(first.awaitingBaseline).toEqual([8]);
    const second = track(first, [item(show(8, { 1: 5 }))]);
    expect(second.pending).toEqual([]);
    expect(second.awaitingBaseline).toEqual([]);
  });

  test("a new request finishing after the baseline is announced and counted as unread", () => {
    const base = track(emptyJournal(), [item(movie(11, 3))]);
    const next = track(base, [item(movie(11, 5))]);
    expect(pendingKeys(next)).toEqual(["v1|11|hd|ready|-"]);
    expect(next.unread).toEqual([11]);
    expect(next.pending[0]?.scopeKey).toBe(SCOPE);
  });
});

describe("milestones", () => {
  for (const tc of fixture.transitionCases) {
    test(`fixture transition ${tc.name}`, () => {
      let j = emptyJournal();
      for (const name of tc.cases) j = track(j, [caseItem(name)]);
      expect(pendingKeys(j)).toEqual(tc.expectedPending);
    });
  }

  test("partial steps share one pending update that stays current, then ready replaces it", () => {
    let j = track(emptyJournal(), [item(show(8, { 1: 3, 2: 3 }))]);
    j = track(j, [item(show(8, { 1: 4, 2: 3 }))]);
    expect(pendingKeys(j)).toEqual(["v1|8|hd|partial|1:P"]);
    j = track(j, [item(show(8, { 1: 5, 2: 3 }))]);
    expect(pendingKeys(j)).toEqual(["v1|8|hd|partial|1:A"]);
    j = track(j, [item(show(8, { 1: 5, 2: 5 }))]);
    expect(pendingKeys(j)).toEqual(["v1|8|hd|ready|-"]);
  });

  test("a dismissed partial suppresses later partial signatures for that request and quality", () => {
    let j = track(emptyJournal(), [item(show(8, { 1: 3, 2: 3 }))]);
    j = track(j, [item(show(8, { 1: 4, 2: 3 }))]);
    j = markDelivered(j, j.pending);
    j = track(j, [item(show(8, { 1: 5, 2: 3 }))]);
    expect(j.pending).toEqual([]);
  });

  test("a pending update whose row moved on is dropped", () => {
    let j = track(emptyJournal(), [item(movie(11, 3))]);
    j = track(j, [item(movie(11, 5))]);
    j = track(j, [item(movie(11, 3))]);
    expect(j.pending).toEqual([]);
  });

  test("a confirmed removal drops every trace of the request", () => {
    let j = track(emptyJournal(), [item(movie(11, 3))]);
    j = track(j, [item(movie(11, 5))]);
    j = trackEvents(j, [], SCOPE, new Set([11]), false);
    expect(j.pending).toEqual([]);
    expect(j.unread).toEqual([]);
    expect(j.baselined).toEqual([]);
  });
});

describe("presentation", () => {
  const ready = caseItem("movie_ready");
  const key = eventKey(ready.request, ready.stage) as string;
  for (const pc of fixture.presentationCases) {
    test(`fixture presentation ${pc.name}`, () => {
      let j: RequestJournal = { ...emptyJournal(), initialized: true };
      if ("seeded" in pc && pc.seeded) {
        j = track(seedRequest(emptyJournal(), ready.request.id, false), [
          ready,
        ]);
        expect(pendingKeys(j)).toEqual([key]);
        return;
      }
      if ("pushFirst" in pc && pc.pushFirst) {
        j = markDelivered(j, [{ key, requestId: ready.request.id }]);
        j = track(j, [ready]);
        expect(j.pending).toEqual([]);
      } else {
        j = track(j, [ready]);
        expect(pendingKeys(j)).toEqual([key]);
        j = markDelivered(j, [{ key, requestId: ready.request.id }]);
        expect(j.pending).toEqual([]);
      }
      expect(j.delivered).toContain(key);
    });
  }
});

describe("switch, unread, badge, forget", () => {
  test("with updates off, new milestones are acknowledged, not pending; the badge still counts", () => {
    let j = setEnabled(track(emptyJournal(), [item(movie(11, 3))]), false);
    j = track(j, [item(movie(11, 5))]);
    expect(j.pending).toEqual([]);
    expect(j.delivered).toContain("v1|11|hd|ready|-");
    expect(badgeCount([item(movie(11, 5))], j)).toBe(1);
  });

  test("turning updates off acknowledges what was pending", () => {
    let j = track(track(emptyJournal(), [item(movie(11, 3))]), [
      item(movie(11, 5)),
    ]);
    j = setEnabled(j, false);
    expect(j.pending).toEqual([]);
    expect(j.delivered).toContain("v1|11|hd|ready|-");
    expect(setEnabled(j, true).enabled).toBe(true);
  });

  test("no unread is added while the queue is on screen", () => {
    const base = track(emptyJournal(), [item(movie(11, 3))]);
    const j = track(base, [item(movie(11, 5))], true);
    expect(j.unread).toEqual([]);
    expect(pendingKeys(j)).toEqual(["v1|11|hd|ready|-"]);
  });

  test("a failed request is announced but never counted as unread", () => {
    const base = track(emptyJournal(), [item(movie(12, 3))]);
    const j = track(base, [item(movie(12, 3, 4))]);
    expect(pendingKeys(j)).toEqual(["v1|12|hd|failed|-"]);
    expect(j.unread).toEqual([]);
  });

  test("opening the queue clears every unread; a card's action clears one", () => {
    const j: RequestJournal = { ...emptyJournal(), unread: [1, 2] };
    expect(markOpened(j).unread).toEqual([]);
    expect(markOpened(j, 1).unread).toEqual([2]);
  });

  test("badge label shows 9+ above nine", () => {
    expect(badgeLabel(0)).toBeNull();
    expect(badgeLabel(3)).toBe("3");
    expect(badgeLabel(9)).toBe("9");
    expect(badgeLabel(10)).toBe("9+");
  });

  test("forget removes a cancelled request but keeps what was already shown", () => {
    const j: RequestJournal = {
      ...emptyJournal(),
      baselined: [1, 2],
      seeded: [1],
      unread: [1],
      awaitingBaseline: [1],
      downloadObserved: [1],
      delivered: ["v1|1|hd|ready|-"],
      pending: [{ key: "v1|1|hd|failed|-", requestId: 1 }],
    };
    const f = forgetRequest(j, 1);
    expect(f.baselined).toEqual([2]);
    expect(f.seeded).toEqual([]);
    expect(f.unread).toEqual([]);
    expect(f.pending).toEqual([]);
    expect(f.delivered).toEqual(["v1|1|hd|ready|-"]);
  });

  test("download seen is remembered until the request finishes", () => {
    const downloading: OwnRequest = {
      ...movie(13, 3),
      media: {
        status: 3,
        downloadStatus: [{ status: "downloading", size: 10, sizeLeft: 5 }],
      },
    };
    let j = track(emptyJournal(), [item(downloading)]);
    expect(j.downloadObserved).toEqual([13]);
    j = track(j, [item(movie(13, 5))]);
    expect(j.downloadObserved).toEqual([]);
  });
});

describe("storage", () => {
  test("malformed stored values decode to safe defaults", () => {
    expect(decodeJournal(null)).toEqual(emptyJournal());
    expect(decodeJournal([1, 2])).toEqual(emptyJournal());
    const j = decodeJournal({
      enabled: false,
      initialized: true,
      baselined: [1, -2, 1.5, "3", 4, 4],
      delivered: ["v1|1|hd|ready|-", "bogus", 5],
      pending: [
        { key: "v1|1|hd|ready|-", requestId: 1 },
        { key: "x", requestId: 2 },
        null,
      ],
    });
    expect(j.enabled).toBe(false);
    expect(j.baselined).toEqual([1, 4]);
    expect(j.delivered).toEqual(["v1|1|hd|ready|-"]);
    expect(j.pending).toEqual([
      { key: "v1|1|hd|ready|-", requestId: 1, scopeKey: null },
    ]);
  });

  test("read and write go through the injected storage; unreadable data is empty", () => {
    const values = new Map<string, string>();
    const storage: JournalStorage = {
      getString: (k) => values.get(k),
      set: (k, v) => values.set(k, v),
    };
    expect(readJournal(storage, SCOPE)).toEqual(emptyJournal());
    const j = { ...emptyJournal(), initialized: true, baselined: [5] };
    writeJournal(storage, SCOPE, j);
    expect(readJournal(storage, SCOPE)).toEqual(j);
    values.set(SCOPE, "{not json");
    expect(readJournal(storage, SCOPE)).toEqual(emptyJournal());
  });
});
