/**
 * The member's own request for a title, for the title page's stage button (plan 5.8, the TV's
 * `ExpandableDiscoverButtons.kt` :50-63). Pure.
 */
import { isReadyStage, isTerminalStage, libraryItemId } from "./stage";
import type { RequestStatusItem } from "./types";

/** Unfinished HD first, then any unfinished, then the first matching request. */
export function ownRequestForTitle(
  items: readonly RequestStatusItem[],
  mediaType: string | null | undefined,
  tmdbId: number | null | undefined,
): RequestStatusItem | null {
  if (!mediaType || tmdbId == null) return null;
  const matching = items.filter(
    (i) => i.request.type === mediaType && i.request.media?.tmdbId === tmdbId,
  );
  return (
    matching.find(
      (i) => !isTerminalStage(i.stage) && i.request.is4k !== true,
    ) ??
    matching.find((i) => !isTerminalStage(i.stage)) ??
    matching[0] ??
    null
  );
}

export type TitleStageAction =
  /** Ready or partly ready with a quality-exact library id: open the library title. */
  | { kind: "library"; itemId: string }
  /** Otherwise: the Requests queue on that row. */
  | { kind: "queue"; requestId: number };

export function titleStageAction(item: RequestStatusItem): TitleStageAction {
  const itemId = isReadyStage(item.stage) ? libraryItemId(item.request) : null;
  return itemId
    ? { kind: "library", itemId }
    : { kind: "queue", requestId: item.request.id };
}
