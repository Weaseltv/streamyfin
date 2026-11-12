/** UI ownership only: a late query may update its cache, never the next spinner. */
export class BoundedRefresh {
  private generation = 0;
  private busy = false;
  private alive = true;
  activate() {
    this.alive = true;
  }
  dispose() {
    this.alive = false;
    this.busy = false;
    this.generation++;
  }

  async run(
    work: () => Promise<unknown>,
    change: (busy: boolean) => void,
    failure: () => void,
    budget = 30_000,
  ) {
    if (!this.alive || this.busy) return;
    this.busy = true;
    const generation = ++this.generation;
    change(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        work(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Refresh timed out")),
            budget,
          );
        }),
      ]);
    } catch {
      if (this.alive && generation === this.generation) failure();
    } finally {
      clearTimeout(timer);
      if (this.alive && generation === this.generation) {
        this.busy = false;
        change(false);
      }
    }
  }
}
