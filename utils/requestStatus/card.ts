/**
 * The in-app request update card (plan 5.9; the TV's `RequestNotificationCard.kt` :73-96 and
 * `RequestChipHost.kt`). Pure: what the card says and what its button does.
 */
import type { RequestEvent } from "./journal";
import { isReadyStage, libraryItemId } from "./stage";
import type { RequestStatusItem, Text } from "./types";

/** The card stays one minute; touching it resets the minute. */
export const CARD_VISIBLE_MS = 60_000;

export type CardPrimary =
  /** One canonical ready or partly ready request with a library id of its own quality. */
  | { kind: "watch"; requestId: number; itemId: string; mediaType: string }
  /** One request without one: its row in the queue. */
  | { kind: "details"; requestId: number }
  /** Several: the queue. */
  | { kind: "view_all" };

export interface CardModel {
  events: RequestEvent[];
  rows: RequestStatusItem[];
  /** The single row the card is about, when there is exactly one update. */
  single: RequestStatusItem | null;
  status: Text;
  /** null: the single row's own title (from its metadata). */
  title: Text | null;
  instruction: Text;
  primary: CardPrimary;
  primaryLabel: Text;
}

/** The card for the pending updates, or null when none of them has a row yet. */
export function cardModel(
  pending: readonly RequestEvent[],
  items: readonly RequestStatusItem[],
): CardModel | null {
  const byId = new Map(items.map((i) => [i.request.id, i]));
  const events = pending.filter((e) => byId.has(e.requestId));
  if (events.length === 0) return null;
  const rows = events.map((e) => byId.get(e.requestId) as RequestStatusItem);
  const count = events.length;
  const single = count === 1 ? rows[0] : null;
  const allReady = rows.every((r) => r.stage.kind === "READY");
  const itemId =
    single && isReadyStage(single.stage) ? libraryItemId(single.request) : null;
  const primary: CardPrimary =
    count > 1
      ? { kind: "view_all" }
      : itemId && single
        ? {
            kind: "watch",
            requestId: single.request.id,
            itemId,
            mediaType: single.request.type,
          }
        : { kind: "details", requestId: rows[0].request.id };
  return {
    events,
    rows,
    single,
    status: single
      ? single.stage.label
      : {
          key: allReady
            ? "request_status.status.ready_to_watch"
            : "request_status.card.request_updates",
        },
    title: single
      ? null
      : {
          key: allReady
            ? "request_status.card.n_ready"
            : "request_status.card.n_updates",
          params: { count },
        },
    instruction:
      count > 1
        ? { key: "request_status.card.updates_instruction" }
        : single?.stage.kind === "READY"
          ? { key: "request_status.card.ready_instruction" }
          : single?.stage.kind === "PARTIAL"
            ? { key: "request_status.card.partial_instruction" }
            : { key: "request_status.card.update_instruction" },
    primary,
    primaryLabel: {
      key:
        primary.kind === "view_all"
          ? "request_status.card.view_requests"
          : primary.kind === "watch"
            ? "request_status.row.watch_now"
            : "request_status.card.details",
    },
  };
}

/** When the card may be on screen; an unsafe moment hides it and leaves the update pending. */
export function cardMayShow(input: {
  tabsFocused: boolean;
  appActive: boolean;
  keyboardOpen: boolean;
  sheetOpen: boolean;
  submissionShowing: boolean;
}): boolean {
  return (
    input.tabsFocused &&
    input.appActive &&
    !input.keyboardOpen &&
    !input.sheetOpen &&
    !input.submissionShowing
  );
}
