interface LogStoreOptions {
  read: () => string | undefined;
  write: (value: string) => void;
  capacity?: number;
  batchMs?: number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancel?: (handle: unknown) => void;
}

/** Capture each entry once; serialize the bounded ring only when saving. */
export function createBatchedLogStore<T>({
  read,
  write,
  capacity = 100,
  batchMs = 1000,
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: LogStoreOptions) {
  let entries: string[] = [];
  try {
    const stored = read();
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    if (Array.isArray(parsed)) {
      entries = parsed.slice(-capacity).map((entry) => JSON.stringify(entry));
    }
  } catch {
    // Corrupt diagnostics must not prevent app startup or error reporting.
  }

  let timer: unknown;
  let dirty = false;
  let cached: T[] | undefined;
  const serialized = () => `[${entries.join(",")}]`;
  const queueSave = () => {
    if (timer !== undefined) return;
    timer = schedule(() => {
      timer = undefined;
      flush();
    }, batchMs);
  };
  const flush = () => {
    if (timer !== undefined) {
      cancel(timer);
      timer = undefined;
    }
    if (!dirty) return;
    try {
      write(serialized());
      dirty = false;
    } catch {
      // Keep the pending ring and retry; leave the prior persisted log valid.
      queueSave();
    }
  };

  return {
    append(entry: T, urgent = false) {
      // Snapshot now so later caller mutations cannot alter an earlier log.
      entries.push(JSON.stringify(entry));
      if (entries.length > capacity)
        entries.splice(0, entries.length - capacity);
      cached = undefined;
      dirty = true;
      if (urgent) flush();
      else queueSave();
    },
    read(): T[] {
      cached ??= JSON.parse(serialized()) as T[];
      return cached;
    },
    flush,
  };
}
