/**
 * One request-server sign-in at a time (plan 5.3 rule 1).
 *
 * Every exchange that writes the request server's session cookie (the silent Quick Connect, its
 * reconnect, the Settings password sign-in and the plugin sign-in at media-server login) runs
 * through one queue on phones. A newer exchange aborts the older one and waits for it to finish
 * before it starts, so two exchanges never write the shared cookie at once. Listeners hear about a
 * start before any network call, so request work stops first. A result is only used while its
 * exchange is still the current one.
 */

export interface ExchangeContext {
  signal: AbortSignal;
  /** Still the newest exchange and not aborted. */
  isCurrent(): boolean;
}

export interface ExchangeOutcome<T> {
  result: T;
  current: boolean;
}

export class ExchangeQueue {
  private generation = 0;
  private running: {
    controller: AbortController;
    done: Promise<unknown>;
  } | null = null;
  private listeners = new Set<() => void>();

  /** Called before each exchange starts (request work stops, the transport proof is dropped). */
  onStart(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get currentGeneration(): number {
    return this.generation;
  }

  async run<T>(
    task: (ctx: ExchangeContext) => Promise<T>,
  ): Promise<ExchangeOutcome<T>> {
    const generation = ++this.generation;
    const previous = this.running;
    previous?.controller.abort();
    const controller = new AbortController();
    const isCurrent = () =>
      generation === this.generation && !controller.signal.aborted;
    const done = (async () => {
      if (previous) await previous.done.catch(() => undefined);
      if (!isCurrent()) throw new ExchangeSupersededError();
      for (const listener of this.listeners) listener();
      return task({ signal: controller.signal, isCurrent });
    })();
    this.running = { controller, done };
    try {
      const result = await done;
      return { result, current: isCurrent() };
    } finally {
      if (this.running?.done === done) this.running = null;
    }
  }

  /** Resolves once no exchange is running (a new scope waits for a sign-in to finish). */
  async idle(): Promise<void> {
    while (this.running) {
      await this.running.done.catch(() => undefined);
    }
  }

  /** Abort whatever runs (sign-out, server change); its result will not be used. */
  cancel(): void {
    this.generation++;
    this.running?.controller.abort();
  }
}

export class ExchangeSupersededError extends Error {
  constructor() {
    super("A newer request sign-in replaced this one");
    this.name = "ExchangeSupersededError";
  }
}

/** The phone's one queue. */
export const seerrExchanges = new ExchangeQueue();
