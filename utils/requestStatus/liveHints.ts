/**
 * When a live record should make the canonical layer re-read one request (the TV's
 * `onLiveRecord`, `services/RequestStatusRepository.kt` :297-332). Progress records carry no
 * library ids or ownership, so a disagreement is verified through the request server. Pure.
 */
import { matchesRow } from "./progressRecord";
import type { RequestProgressRecord, RequestStatusItem } from "./types";

export type LiveHint =
  /** No row for this request yet: the full sync finds it. */
  | { kind: "unknown_request" }
  /** The row and the record disagree: re-read this one request. */
  | { kind: "refresh" }
  | { kind: "none" };

const availabilityOf = (status: number | null | undefined) =>
  status === 5 ? "full" : status === 4 ? "partial" : "none";

export function liveHint(
  record: RequestProgressRecord,
  row: RequestStatusItem | undefined,
): LiveHint {
  if (!row) return { kind: "unknown_request" };
  if (!matchesRow(record, row.request) || record.stale) return { kind: "none" };
  const availability =
    row.stage.kind === "READY"
      ? "full"
      : row.stage.kind === "PARTIAL"
        ? "partial"
        : "none";
  const seasonsChanged = record.seasons.some((season) => {
    const old = row.request.media?.seasons?.find(
      (s) => s.seasonNumber === season.n,
    );
    return (
      season.availability !==
      availabilityOf(record.is4k ? old?.status4k : old?.status)
    );
  });
  const statusChanged =
    record.seerrStatus != null && record.seerrStatus !== row.request.status;
  return !row.fresh ||
    record.availability !== availability ||
    seasonsChanged ||
    statusChanged
    ? { kind: "refresh" }
    : { kind: "none" };
}
