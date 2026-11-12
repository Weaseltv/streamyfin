/** Page types whose opening time is logged. */
export type NavTimingKind = "series" | "item" | "collection" | "library";

/**
 * `content`: the page first shows something of its own (a title, a head).
 * `full`: what the page exists for has arrived (real details, first titles).
 */
export type NavTimingStage = "content" | "full";

interface NavTimingOptions {
  now: () => number;
  emit: (line: string) => void;
  /** A stage arriving later than this after the tap is not that tap's page. */
  staleAfterMs?: number;
}

interface Pending {
  kind: NavTimingKind;
  id: string;
  at: number;
  content?: number;
  full?: number;
}

/**
 * Times one page opening at a time, from the tap on a card to the page's
 * stages, and reports it as a single line. Only the most recent tap is
 * tracked: a page that opens any other way (a link, Back, a tab) is ignored.
 */
export function createNavTiming({
  now,
  emit,
  staleAfterMs = 30_000,
}: NavTimingOptions) {
  let pending: Pending | null = null;

  const report = (entry: Pending) => {
    if (entry.content === undefined && entry.full === undefined) return;
    const parts = [`nav-timing ${entry.kind}`];
    if (entry.content !== undefined) parts.push(`content=${entry.content}ms`);
    if (entry.full !== undefined) parts.push(`full=${entry.full}ms`);
    emit(parts.join(" "));
  };

  return {
    tap(kind: NavTimingKind, id: string) {
      // A page left before it finished still reports what it reached
      if (pending) report(pending);
      pending = { kind, id, at: now() };
    },
    stage(kind: NavTimingKind, id: string, stage: NavTimingStage) {
      const entry = pending;
      if (!entry || entry.kind !== kind || entry.id !== id) return;
      if (entry[stage] !== undefined) return;
      const elapsed = Math.round(now() - entry.at);
      if (elapsed > staleAfterMs) {
        report(entry);
        pending = null;
        return;
      }
      entry[stage] = elapsed;
      if (stage === "full") {
        // A page whose content and details arrive together reports both
        entry.content ??= elapsed;
        report(entry);
        pending = null;
      }
    },
  };
}
