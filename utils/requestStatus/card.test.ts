import { describe, expect, test } from "bun:test";
import { cardMayShow, cardModel } from "./card";
import { deriveRequestStage } from "./stage";
import type { OwnRequest, RequestStatusItem } from "./types";

const ID = "a".repeat(32);
const item = (
  id: number,
  media: OwnRequest["media"],
  over: Partial<OwnRequest> = {},
): RequestStatusItem => {
  const request: OwnRequest = { id, status: 2, type: "movie", media, ...over };
  return { request, stage: deriveRequestStage(request), fresh: true };
};
const ev = (requestId: number, kind = "ready") => ({
  key: `v1|${requestId}|hd|${kind}|-`,
  requestId,
});

describe("request update card (TV wording)", () => {
  test("one ready request with its library id: Watch now", () => {
    const m = cardModel([ev(1)], [item(1, { status: 5, jellyfinMediaId: ID })]);
    expect(m?.primary).toEqual({
      kind: "watch",
      requestId: 1,
      itemId: ID,
      mediaType: "movie",
    });
    expect(m?.primaryLabel.key).toBe("request_status.row.watch_now");
    expect(m?.status.key).toBe("request_status.status.ready_to_watch");
    expect(m?.title).toBeNull();
    expect(m?.instruction.key).toBe("request_status.card.ready_instruction");
  });

  test("one without a library id of its quality: Details", () => {
    const m = cardModel(
      [ev(1)],
      [item(1, { status4k: 5, jellyfinMediaId: ID }, { is4k: true })],
    );
    expect(m?.primary).toEqual({ kind: "details", requestId: 1 });
    expect(m?.primaryLabel.key).toBe("request_status.card.details");
  });

  test("a failed request: Details and the update line", () => {
    const m = cardModel(
      [ev(1, "failed")],
      [item(1, { status: 3 }, { status: 4 })],
    );
    expect(m?.primary.kind).toBe("details");
    expect(m?.instruction.key).toBe("request_status.card.update_instruction");
  });

  test("several: View requests, a count title", () => {
    const ready = [item(1, { status: 5 }), item(2, { status: 5 })];
    const m = cardModel([ev(1), ev(2)], ready);
    expect(m?.primary).toEqual({ kind: "view_all" });
    expect(m?.title).toEqual({
      key: "request_status.card.n_ready",
      params: { count: 2 },
    });
    expect(m?.status.key).toBe("request_status.status.ready_to_watch");
    const mixed = cardModel(
      [ev(1), ev(3, "failed")],
      [ready[0], item(3, { status: 3 }, { status: 4 })],
    );
    expect(mixed?.title).toEqual({
      key: "request_status.card.n_updates",
      params: { count: 2 },
    });
    expect(mixed?.status.key).toBe("request_status.card.request_updates");
  });

  test("updates whose rows aren't loaded yet are left for later", () => {
    expect(cardModel([ev(9)], [])).toBeNull();
    expect(
      cardModel([ev(1), ev(9)], [item(1, { status: 5 })])?.events,
    ).toHaveLength(1);
  });

  test("shown only at a safe moment", () => {
    const safe = {
      tabsFocused: true,
      appActive: true,
      keyboardOpen: false,
      sheetOpen: false,
      submissionShowing: false,
    };
    expect(cardMayShow(safe)).toBe(true);
    for (const k of ["tabsFocused", "appActive"] as const)
      expect(cardMayShow({ ...safe, [k]: false })).toBe(false);
    for (const k of ["keyboardOpen", "sheetOpen", "submissionShowing"] as const)
      expect(cardMayShow({ ...safe, [k]: true })).toBe(false);
  });
});
