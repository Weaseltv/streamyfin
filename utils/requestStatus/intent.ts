/**
 * "Open Requests on this row" (plan 5.6). Raised by a submit, a pop-up, a notification tap or the
 * title page; held by the coordinator because the tabs are lazy and the Requests page may not exist
 * yet. Bound to the scope it was raised for. Pure.
 */

export interface OpenRowIntent {
  scopeKey: string;
  /** null: open the queue at the top. */
  requestId: number | null;
  raisedAt: number;
}

export type IntentAction =
  /** Scroll to the row, highlight it once, then consume. */
  | { kind: "scroll"; requestId: number }
  /** Consume without scrolling (no row, or the row never appeared after a settled sync). */
  | { kind: "consume" }
  /** Keep it: the row may still arrive with the next sync. */
  | { kind: "wait" }
  /** Drop it: raised for another scope. */
  | { kind: "drop" };

export function resolveIntent(
  intent: OpenRowIntent,
  input: {
    scopeKey: string | null;
    rowIds: ReadonlySet<number>;
    /** When the last canonical sync settled (success or failure), if any. */
    lastSyncSettledAt: number | null;
  },
): IntentAction {
  if (!input.scopeKey || input.scopeKey !== intent.scopeKey)
    return { kind: "drop" };
  if (intent.requestId === null) return { kind: "consume" };
  if (input.rowIds.has(intent.requestId))
    return { kind: "scroll", requestId: intent.requestId };
  if (
    input.lastSyncSettledAt !== null &&
    input.lastSyncSettledAt > intent.raisedAt
  ) {
    return { kind: "consume" };
  }
  return { kind: "wait" };
}

/** Ready rows render 30 at a time; grow the count so a target at `readyIndex` is rendered. */
export const READY_PAGE = 30;

export function readyRenderCount(
  current: number,
  readyIndex: number | null,
): number {
  if (readyIndex === null || readyIndex < current) return current;
  return Math.ceil((readyIndex + 1) / READY_PAGE) * READY_PAGE;
}
