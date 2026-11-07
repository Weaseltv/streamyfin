export type HomeRowSnapshot = {
  scope: string;
  revision: number;
  items: readonly string[];
  pages?: number;
};

/** Native position is disposable; query data and pagination stay mounted. */
export class HomeRowPosition {
  private previous?: HomeRowSnapshot;
  private pending = true;

  observe(next: HomeRowSnapshot) {
    const previous = this.previous;
    const sameItems =
      previous?.items.length === next.items.length &&
      previous.items.every((id, index) => id === next.items[index]);
    // Loading the next page must let the viewer keep scrolling. A server refresh
    // that adds/reorders/removes cards still returns the row to its first card.
    const appendedPage =
      previous?.pages != null &&
      next.pages != null &&
      next.pages > previous.pages &&
      previous.items.length <= next.items.length &&
      previous.items.every((id, index) => id === next.items[index]);
    if (
      !previous ||
      previous.scope !== next.scope ||
      previous.revision !== next.revision ||
      (!sameItems && !appendedPage)
    )
      this.pending = true;
    this.previous = { ...next, items: [...next.items] };
  }

  request() {
    this.pending = true;
  }

  flush(visibleAndReady: boolean, scrollToStart: () => void): boolean {
    if (!this.pending || !visibleAndReady) return false;
    // Clear before scrolling: native layout callbacks can run synchronously.
    this.pending = false;
    try {
      scrollToStart();
      return true;
    } catch {
      this.pending = true;
      return false;
    }
  }
}
