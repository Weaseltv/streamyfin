/**
 * The one check for a request notification's data (plan 5.10 steps 3-5), shared by the foreground
 * receipt, both tap sources and the notifications still listed on the phone. The website sends
 * `{v: 1, kind: "request", event, eventKey, requestId, tmdbId, mediaType, is4k,
 * recipientJellyfinUserId, url}` (`weaseltv-platform` `packages/workflows/src/weaselplex-request-push.ts`).
 * Pure.
 */

export interface RequestPush {
  requestId: number;
  tmdbId: number;
  mediaType: "movie" | "tv";
  is4k: boolean;
  event: "ready" | "failed";
  /** The website's form: lower case, no dashes. */
  recipient: string;
  /** `v1|requestId|hd-or-4k|ready-or-failed|-`, rebuilt from the fields and equal to the sent one. */
  eventKey: string;
}

/** A request notification by its kind alone: it never takes the generic path, even if invalid. */
export function isRequestKind(data: unknown): boolean {
  return (
    !!data &&
    typeof data === "object" &&
    (data as { kind?: unknown }).kind === "request"
  );
}

/** The website's `normalizeMediaUserId`. */
export function normalizeRecipient(value: unknown): string | null {
  return typeof value === "string" &&
    /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(
      value,
    )
    ? value.replaceAll("-", "").toLowerCase()
    : null;
}

const positiveId = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) > 0;

export function parseRequestPush(data: unknown): RequestPush | null {
  if (!isRequestKind(data)) return null;
  const d = data as Record<string, unknown>;
  if (d.v !== 1) return null;
  if (!positiveId(d.requestId) || !positiveId(d.tmdbId)) return null;
  if (d.mediaType !== "movie" && d.mediaType !== "tv") return null;
  if (typeof d.is4k !== "boolean") return null;
  if (d.event !== "ready" && d.event !== "failed") return null;
  const recipient = normalizeRecipient(d.recipientJellyfinUserId);
  if (!recipient) return null;
  const eventKey = `v1|${d.requestId}|${d.is4k ? "4k" : "hd"}|${d.event}|-`;
  if (d.eventKey !== eventKey) return null;
  return {
    requestId: d.requestId,
    tmdbId: d.tmdbId,
    mediaType: d.mediaType,
    is4k: d.is4k,
    event: d.event,
    recipient,
    eventKey,
  };
}

/** The notification is for the person signed in now. */
export function pushIsForViewer(
  push: RequestPush,
  jellyfinUserId: string | null | undefined,
): boolean {
  return normalizeRecipient(jellyfinUserId) === push.recipient;
}
