import { describe, expect, test } from "bun:test";
import envelopes from "../../docs/request-notifications/progress-envelopes.fixture.json";
import {
  canCancel,
  cancelPath,
  mayRequest,
  PROGRESS_CLIENT_HEADER,
  progressCancelOutcome,
  seerrDeleteOutcome,
  verifyGoneOutcome,
} from "./cancel";
import { deriveRequestStage } from "./stage";
import type { OwnRequest, RequestStatusItem } from "./types";

const item = (over: Partial<OwnRequest> = {}): RequestStatusItem => {
  const request: OwnRequest = {
    id: 9002,
    status: 2,
    type: "movie",
    requestedBy: { id: 7 },
    media: { status: 3, tmdbId: 1 },
    ...over,
  };
  return { request, stage: deriveRequestStage(request), fresh: true };
};

describe("who may cancel", () => {
  test("own, allowed, pending/approved/failed, not ready, not in Ready", () => {
    expect(canCancel(item(), "ACTIVE", 7, 32)).toBe(true);
    expect(canCancel(item({ status: 1 }), "WAITING", 7, 16)).toBe(true);
    expect(canCancel(item({ status: 4 }), "WAITING", 7, 2)).toBe(true);
  });

  test("not another member's, not without permission, not finished or ready", () => {
    expect(canCancel(item(), "ACTIVE", 8, 32)).toBe(false);
    expect(canCancel(item(), "ACTIVE", 7, 64)).toBe(false);
    expect(canCancel(item({ status: 3 }), "WAITING", 7, 32)).toBe(false);
    expect(canCancel(item({ status: 5 }), "ACTIVE", 7, 32)).toBe(false);
    expect(
      canCancel(item({ media: { status: 5, tmdbId: 1 } }), "READY", 7, 32),
    ).toBe(false);
    expect(canCancel(item(), "READY", 7, 32)).toBe(false);
  });

  test("permissions follow Seerr: admin, request or manage requests", () => {
    expect(mayRequest(2)).toBe(true);
    expect(mayRequest(32 | 128)).toBe(true);
    expect(mayRequest(0)).toBe(false);
    expect(mayRequest(undefined)).toBe(false);
  });

  test("progress service when available; otherwise a pending request through the request server", () => {
    expect(cancelPath(item(), true)).toBe("progress");
    expect(cancelPath(item({ status: 1 }), false)).toBe("seerr");
    expect(cancelPath(item(), false)).toBeNull();
    expect(PROGRESS_CLIENT_HEADER).toBe("tv");
  });
});

describe("the progress service's answers (operator samples)", () => {
  const answers = envelopes.cancelAnswers;
  const outcome = (status: number, error?: string) => {
    const a = answers.find(
      (x) =>
        x.status === status &&
        (!error || (x.body as { error?: string })?.error === error),
    );
    return progressCancelOutcome(status, a?.body ?? null, 9002);
  };

  test("200 for the request sent forgets it; another id or an odd body does not", () => {
    expect(outcome(200)).toEqual({ kind: "forget" });
    expect(
      progressCancelOutcome(200, { ok: true, requestId: 1 }, 9002).kind,
    ).toBe("keep");
    expect(progressCancelOutcome(200, "ok", 9002).kind).toBe("keep");
  });

  test("the handler's JSON 404 is verified first; any other 404 is a plain failure", () => {
    expect(outcome(404)).toEqual({ kind: "verify" });
    expect(progressCancelOutcome(404, null, 9002)).toMatchObject({
      kind: "keep",
      wake: true,
    });
  });

  test("each 409 reason has its own line", () => {
    expect(outcome(409, "already_finished")).toMatchObject({
      message: { key: "request_status.cancel.already_finished" },
      wake: true,
    });
    expect(outcome(409, "in_progress")).toMatchObject({
      message: { key: "request_status.cancel.in_progress" },
      wake: false,
      refreshInMs: 10_000,
    });
    expect(outcome(409, "not_supported")).toMatchObject({
      message: { key: "request_status.cancel.not_supported" },
      wake: false,
    });
    expect(progressCancelOutcome(409, {}, 9002)).toMatchObject({
      message: { key: "request_status.cancel.failed" },
    });
  });

  test("401 probes; 403 is the header check (no probe); others are plain failures", () => {
    expect(outcome(401)).toMatchObject({ probe: true });
    const forbidden = outcome(403);
    expect(forbidden).toMatchObject({ kind: "keep" });
    expect((forbidden as { probe?: boolean }).probe).toBeUndefined();
    for (const s of [405, 503, 502, 500]) {
      expect(outcome(s)).toMatchObject({
        kind: "keep",
        message: { key: "request_status.cancel.failed" },
      });
    }
    expect(progressCancelOutcome(null, null, 9002).kind).toBe("keep");
  });

  test("after a 404: only the request server's 404 forgets; a 401/403 probes", () => {
    expect(verifyGoneOutcome(404)).toEqual({ kind: "forget" });
    expect(verifyGoneOutcome(200)).toMatchObject({ kind: "keep" });
    expect(verifyGoneOutcome(403)).toMatchObject({ probe: true });
    expect(verifyGoneOutcome(null)).toMatchObject({
      kind: "keep",
      probe: false,
    });
  });

  test("the request server's delete: any 2xx forgets", () => {
    expect(seerrDeleteOutcome(204)).toEqual({ kind: "forget" });
    expect(seerrDeleteOutcome(403)).toMatchObject({ kind: "keep" });
  });
});
