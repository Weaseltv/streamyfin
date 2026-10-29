import { expect, test } from "bun:test";
import fixture from "../docs/request-notifications/request-stages.fixture.json";
import {
  claimPresentation,
  deriveRequestRowStage,
  deriveRequestStage,
  emptyRequestJournal,
  matchingRequestItemId,
  type OwnRequest,
  reconcileRequestJournal,
  requestAccountMatches,
  requestEventKey,
  requestScope,
} from "./requestStatus";

for (const c of fixture.cases)
  test(`TV parity: ${c.name}`, () => {
    const derived = deriveRequestRowStage(
      c.request as OwnRequest,
      !("fresh" in c) || c.fresh !== false,
    );
    expect(derived.kind).toBe(c.expectedKind);
    expect(requestEventKey(c.request as OwnRequest, derived) ?? null).toBe(
      c.expectedKey,
    );
  });
const movie: OwnRequest = {
  id: 11,
  type: "movie",
  status: 5,
  requestedBy: { id: 2 },
  media: { status: 5 },
};
const ready = { request: movie, stage: deriveRequestStage(movie), fresh: true };
test("scope normalizes the pinned origin, quality never falls back", () => {
  expect(requestScope("https://requests.theweasel.tv/", 2)).toBe(
    "weaselplex|2",
  );
  expect(
    matchingRequestItemId({
      ...movie,
      is4k: true,
      media: { jellyfinMediaId: "a".repeat(32) },
    }),
  ).toBeUndefined();
});
test("initial baseline is durable; a locally submitted already-ready item is exempt", () => {
  const baseline = reconcileRequestJournal(emptyRequestJournal(), [ready]);
  expect(baseline.pending).toHaveLength(0);
  expect(
    reconcileRequestJournal(JSON.parse(JSON.stringify(baseline)), [ready])
      .pending,
  ).toHaveLength(0);
  expect(
    reconcileRequestJournal({ ...emptyRequestJournal(), seeded: [11] }, [ready])
      .pending,
  ).toEqual(["v1|11|hd|ready|-"]);
});
test("failed season hydration retains initial baseline until a fresh snapshot", () => {
  const first = reconcileRequestJournal(emptyRequestJournal(), [
    { ...ready, fresh: false },
  ]);
  expect(first.awaitingBaseline).toEqual([11]);
  expect(reconcileRequestJournal(first, [ready]).pending).toHaveLength(0);
});
for (const pushFirst of [true, false])
  test(`push/poll share a synchronous presentation claim, pushFirst=${pushFirst}`, () => {
    const key = requestEventKey(movie, ready.stage)!;
    let j = { ...emptyRequestJournal(), initialized: true };
    if (pushFirst) j = claimPresentation(j, key).journal;
    j = reconcileRequestJournal(j, [ready]);
    const claim = claimPresentation(j, key);
    expect(claim.claimed).toBe(!pushFirst);
    expect(claimPresentation(claim.journal, key).claimed).toBe(false);
  });
test("failure and retry-ready differ, partial signatures progress P to A", () => {
  expect(
    requestEventKey(
      { ...movie, status: 4 },
      deriveRequestStage({ ...movie, status: 4 }),
    ),
  ).toBe("v1|11|hd|failed|-");
  const tv: OwnRequest = {
    ...movie,
    type: "tv",
    seasons: [{ seasonNumber: 2 }, { seasonNumber: 1 }],
    media: { seasons: [{ seasonNumber: 1, status: 4 }] },
  };
  expect(requestEventKey(tv, deriveRequestStage(tv))).toBe(
    "v1|11|hd|partial|1:P",
  );
  tv.media!.seasons![0]!.status = 5;
  expect(requestEventKey(tv, deriveRequestStage(tv))).toBe(
    "v1|11|hd|partial|1:A",
  );
});
test("library removal after completion does not create a failure event", () => {
  const removed = { ...movie, media: { status: 7 } };
  expect(deriveRequestStage(removed).kind).toBe("FAILED");
  expect(requestEventKey(removed, deriveRequestStage(removed))).toBeUndefined();
});

test("account identity is normalized and unknown/foreign sessions fail closed", () => {
  expect(
    requestAccountMatches(
      "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA",
      "a".repeat(32),
    ),
  ).toBe(true);
  expect(requestAccountMatches("a".repeat(32), "b".repeat(32))).toBe(false);
  expect(requestAccountMatches(undefined, "a".repeat(32))).toBe(false);
});
for (const sequence of fixture.transitionCases)
  test(`fixture transition ${sequence.name}`, () => {
    let journal = { ...emptyRequestJournal(), initialized: true };
    for (const name of sequence.cases) {
      const c = fixture.cases.find((r) => r.name === name)!;
      const request = c.request as OwnRequest;
      journal = reconcileRequestJournal(journal, [
        { request, stage: deriveRequestStage(request), fresh: true },
      ]);
    }
    if ("expectedPending" in sequence)
      expect(journal.pending).toEqual(sequence.expectedPending!);
  });
for (const scenario of fixture.presentationCases)
  test(`fixture presentation ${scenario.name}`, () => {
    const c = fixture.cases.find((r) => r.name === scenario.case)!;
    const request = c.request as OwnRequest,
      row = { request, stage: deriveRequestStage(request), fresh: true };
    let journal = {
      ...emptyRequestJournal(),
      initialized: !("seeded" in scenario),
      seeded: "seeded" in scenario ? [request.id] : [],
    };
    if ("pushFirst" in scenario && scenario.pushFirst)
      journal = claimPresentation(journal, c.expectedKey!).journal;
    journal = reconcileRequestJournal(journal, [row]);
    expect(claimPresentation(journal, c.expectedKey!).claimed).toBe(
      !("pushFirst" in scenario && scenario.pushFirst),
    );
  });
test("off suppresses new events; partial pending is superseded by ready", () => {
  const j = reconcileRequestJournal(
    { ...emptyRequestJournal(), initialized: true },
    [ready],
    false,
  );
  expect(j.pending).toEqual([]);
  expect(j.presented).toContain("v1|11|hd|ready|-");
});
