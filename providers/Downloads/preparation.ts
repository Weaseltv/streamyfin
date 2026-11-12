import { assertNotAborted } from "@/utils/async/abort";

let nextGeneration = 0;

/** Reservations exist before any metadata, stream or asset await. */
export class DownloadPreparations {
  private operations = new Map<string, DownloadPreparation>();
  reserve(itemId: string, owner: string) {
    if (this.operations.has(itemId)) return undefined;
    const operation: DownloadPreparation = new DownloadPreparation(
      itemId,
      owner,
      () => this.operations.get(itemId) === operation,
    );
    this.operations.set(itemId, operation);
    return operation;
  }
  cancel(itemId: string) {
    this.operations.get(itemId)?.cancel();
  }
  cancelOwner(owner: string) {
    for (const op of this.operations.values())
      if (op.owner === owner) op.cancel();
  }
  release(operation: DownloadPreparation) {
    if (this.operations.get(operation.itemId) === operation)
      this.operations.delete(operation.itemId);
  }
}

export class DownloadPreparation {
  readonly generation = `${Date.now()}-${++nextGeneration}`;
  private controller = new AbortController();
  private cancelledReason: Error | undefined;
  constructor(
    readonly itemId: string,
    readonly owner: string,
    private current: () => boolean,
  ) {}
  get signal() {
    return this.controller.signal;
  }
  get reason() {
    return this.cancelledReason;
  }
  cancel(reason = "download_preparation_cancelled") {
    if (this.signal.aborted) return;
    this.cancelledReason = new Error(reason);
    this.controller.abort(this.cancelledReason);
  }
  assertActive() {
    assertNotAborted(this.signal, this.reason);
    if (!this.current()) throw new Error("download_preparation_obsolete");
  }
}

export type PreparationStage = {
  signal: AbortSignal;
  progress: (bytes: number) => void;
  assertActive: () => void;
};

/** Idle budget resets only when bytes advance; hard budget bounds even progressing work. */
export async function preparationStage<T>(
  operation: DownloadPreparation,
  work: (stage: PreparationStage) => Promise<T>,
  idleMs: number,
  hardMs = idleMs,
): Promise<T> {
  operation.assertActive();
  const controller = new AbortController();
  let idle: ReturnType<typeof setTimeout> | undefined;
  let hard: ReturnType<typeof setTimeout> | undefined;
  let bytes = 0;
  let rejectWait!: (reason: unknown) => void;
  const cancelled = new Promise<never>((_, reject) => {
    rejectWait = reject;
  });
  let stoppedReason: unknown;
  const stop = (reason: unknown) => {
    stoppedReason = reason ?? new Error("download_preparation_cancelled");
    controller.abort(stoppedReason);
    rejectWait(stoppedReason);
  };
  const abort = () => stop(operation.reason);
  const touch = () => {
    clearTimeout(idle);
    idle = setTimeout(
      () => stop(new Error("download_preparation_timeout")),
      idleMs,
    );
  };
  const stage: PreparationStage = {
    signal: controller.signal,
    progress: (next) => {
      if (!controller.signal.aborted && next > bytes) {
        bytes = next;
        touch();
      }
    },
    assertActive: () => {
      operation.assertActive();
      assertNotAborted(controller.signal, stoppedReason);
    },
  };
  operation.signal.addEventListener("abort", abort, { once: true });
  touch();
  hard = setTimeout(
    () => stop(new Error("download_preparation_timeout")),
    hardMs,
  );
  try {
    const result = await Promise.race([work(stage), cancelled]);
    stage.assertActive();
    return result;
  } finally {
    clearTimeout(idle);
    clearTimeout(hard);
    operation.signal.removeEventListener("abort", abort);
  }
}

export const downloadPreparations = new DownloadPreparations();

/** Reserve UI rows immediately, but prepare and enqueue in admission order. */
export class PreparationQueue {
  private tail: Promise<void> = Promise.resolve();
  async acquire(signal: AbortSignal): Promise<() => void> {
    assertNotAborted(signal);
    const previous = this.tail;
    let release!: () => void;
    const slot = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tail = previous.then(() => slot);
    let abort!: () => void;
    const cancelled = new Promise<never>((_, reject) => {
      abort = () =>
        reject(signal.reason ?? new Error("download_preparation_cancelled"));
      signal.addEventListener("abort", abort, { once: true });
    });
    try {
      await Promise.race([previous, cancelled]);
      assertNotAborted(signal);
      return release;
    } catch (error) {
      release();
      throw error;
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }
}
export const downloadPreparationQueue = new PreparationQueue();

/** Clone before replacing DeliveryUrls; server query metadata is never mutated. */
export function cloneDownloadMedia<
  T extends { MediaStreams?: object[] | null },
>(media: T): T {
  return {
    ...media,
    MediaStreams: media.MediaStreams?.map((stream) => ({ ...stream })),
  };
}
