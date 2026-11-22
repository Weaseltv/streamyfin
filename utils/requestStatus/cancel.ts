/**
 * Cancelling a request from the phone queue (plan 5.7), with the progress service's answers as the
 * Unraid operator read them from the running code (2026-11-21). Pure.
 *
 * The progress service cancels members' requests (they are approved automatically, so the request
 * server won't let members delete them) and stops the downloads. Without it (another server, or no
 * transport proof for this scope) only a request still waiting for approval can be cancelled,
 * through the request server. A failed progress cancel never falls over to the other path.
 */
import type { ActivitySection } from "./activityRow";
import { isReadyStage } from "./stage";
import type { RequestStatusItem, Text } from "./types";

/**
 * The cancel route accepts only this exact `X-WeaselPlex-Client` value; anything else, `phone`
 * included, is a 403. It is cross-site protection only; the service neither logs nor uses it
 * (owner decision 18: send `tv`).
 */
export const PROGRESS_CLIENT_HEADER = "tv";

/** Seerr permission bits (`server/lib/permissions.ts`). */
const ADMIN = 2;
const MANAGE_REQUESTS = 16;
const REQUEST = 32;

/** REQUEST or MANAGE_REQUESTS (an admin has every permission, as in Seerr's `hasPermission`). */
export function mayRequest(permissions: number | null | undefined): boolean {
  const p = permissions ?? 0;
  return (
    (p & ADMIN) !== 0 || (p & REQUEST) !== 0 || (p & MANAGE_REQUESTS) !== 0
  );
}

/**
 * Who may cancel (the TV's `canCancel` and `SeerrRequestsPage.kt` :868-875): a current own row,
 * a member allowed to request, status pending, approved or failed, not ready or partly ready, shown
 * in Active or Waiting.
 */
export function canCancel(
  item: RequestStatusItem,
  section: ActivitySection,
  seerrUserId: number | null | undefined,
  permissions: number | null | undefined,
): boolean {
  const r = item.request;
  return (
    seerrUserId != null &&
    r.requestedBy?.id === seerrUserId &&
    mayRequest(permissions) &&
    (r.status === 1 || r.status === 2 || r.status === 4) &&
    !isReadyStage(item.stage) &&
    section !== "READY"
  );
}

export type CancelPath = "progress" | "seerr" | null;

/** The progress service when it is available for this scope; otherwise the request server, for a pending request only. */
export function cancelPath(
  item: RequestStatusItem,
  progressAvailable: boolean,
): CancelPath {
  if (progressAvailable) return "progress";
  return item.request.status === 1 ? "seerr" : null;
}

export const CANCEL_FAILED: Text = { key: "request_status.cancel.failed" };

export type CancelOutcome =
  /** Forget the row (journal and live record) and wake the sync. */
  | { kind: "forget" }
  /** The service's own 404: read the request through the request server first. */
  | { kind: "verify" }
  | {
      kind: "keep";
      message: Text;
      /** Wake the canonical sync now. */
      wake: boolean;
      /** One coalesced canonical refresh after this many ms. */
      refreshInMs?: number;
      /** Run the shared session probe (5.3 rule 6), under its throttle. */
      probe?: boolean;
      /** One log line, no bodies or ids. */
      log?: string;
    };

const keep = (
  message: Text,
  extra: Partial<Extract<CancelOutcome, { kind: "keep" }>> = {},
): CancelOutcome => ({
  kind: "keep",
  message,
  wake: true,
  ...extra,
});

const errorOf = (body: unknown): string | null =>
  body &&
  typeof body === "object" &&
  typeof (body as { error?: unknown }).error === "string"
    ? (body as { error: string }).error
    : null;

/** Map the progress service's cancel answer (`POST /progress/v1/requests/{id}/cancel`). */
export function progressCancelOutcome(
  status: number | null,
  body: unknown,
  sentId: number,
): CancelOutcome {
  if (status === null) return keep(CANCEL_FAILED);
  const error = errorOf(body);
  if (status === 200) {
    const b = body as { ok?: unknown; requestId?: unknown } | null;
    return b?.ok === true && b.requestId === sentId
      ? { kind: "forget" }
      : keep(CANCEL_FAILED);
  }
  // Only the handler's own JSON 404 means gone (or another member's): verify it first.
  if (status === 404)
    return error === "not_found" ? { kind: "verify" } : keep(CANCEL_FAILED);
  if (status === 409) {
    if (error === "already_finished")
      return keep({ key: "request_status.cancel.already_finished" });
    if (error === "in_progress") {
      return keep(
        { key: "request_status.cancel.in_progress" },
        { wake: false, refreshInMs: 10_000 },
      );
    }
    if (error === "not_supported")
      return keep(
        { key: "request_status.cancel.not_supported" },
        { wake: false },
      );
    return keep(CANCEL_FAILED);
  }
  // The service checks the session afresh: an auth denial, recovered by the shared probe.
  if (status === 401) return keep(CANCEL_FAILED, { probe: true });
  // The header check, not a sign-out: no probe, no live stop, the proof is kept.
  if (status === 403)
    return keep(CANCEL_FAILED, {
      log: "Request cancel refused by the client header check",
    });
  return keep(CANCEL_FAILED);
}

/** After the service's 404: the request server's own read of that request. */
export function verifyGoneOutcome(status: number | null): CancelOutcome {
  if (status === 404) return { kind: "forget" };
  return keep(CANCEL_FAILED, { probe: status === 401 || status === 403 });
}

/** The request server's `DELETE /api/v1/request/{id}` (pending requests, no progress service). */
export function seerrDeleteOutcome(status: number | null): CancelOutcome {
  return status !== null && status >= 200 && status < 300
    ? { kind: "forget" }
    : keep(CANCEL_FAILED);
}
