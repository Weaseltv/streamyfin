/** Latest scrub window wins; Expo image requests already in flight cannot abort. */
export class TrickplayPrefetchQueue {
  private queued: string[] = [];
  private active = new Set<string>();
  private completed = new Set<string>();
  private disposed = false;

  constructor(private request: (url: string) => Promise<boolean>) {}

  replace(urls: readonly string[]) {
    if (this.disposed) return;
    this.queued = [...new Set(urls)].filter(
      (url) => !this.active.has(url) && !this.completed.has(url),
    );
    this.pump();
  }

  dispose() {
    this.disposed = true;
    this.queued = [];
  }

  private pump() {
    while (!this.disposed && this.active.size < 2 && this.queued.length) {
      const url = this.queued.shift()!;
      this.active.add(url);
      void Promise.resolve()
        .then(() => (this.disposed ? false : this.request(url)))
        .then((cached) => {
          if (cached && !this.disposed) this.completed.add(url);
        })
        .catch(() => {})
        .finally(() => {
          this.active.delete(url);
          this.pump();
        });
    }
  }
}

export function trickplaySheetWindow(index: number, total: number) {
  return [index, index + 1, index - 1].filter(
    (value) => value >= 0 && value < total,
  );
}
