export const AUTOMATIC_UPDATE_INTERVAL_MS = 60 * 60 * 1000;
export const FAILED_UPDATE_RETRY_MS = 60 * 1000;
export const UPDATE_CHECK_COMPLETED_KEY = "appUpdate.checkCompleted";

export type UpdateCheckCompletion = { at: number; failed: boolean };

export const parseUpdateCheckCompletion = (
  raw: string | undefined,
): UpdateCheckCompletion | null => {
  try {
    const value = raw ? JSON.parse(raw) : null;
    return value &&
      Number.isFinite(value.at) &&
      value.at > 0 &&
      typeof value.failed === "boolean"
      ? value
      : null;
  } catch {
    return null;
  }
};

/** One in-flight request; automatic checks retain a short, persisted cooldown. */
export const createUpdateCheckPacer = <T>({
  read,
  write,
  now = Date.now,
}: {
  read: () => UpdateCheckCompletion | null;
  write: (completion: UpdateCheckCompletion) => void;
  now?: () => number;
}) => {
  let pending: Promise<T | null> | null = null;
  return {
    run(check: () => Promise<T | null>, force = false): Promise<T | null> {
      if (pending) return pending;
      const last = read();
      const time = now();
      if (
        !force &&
        last &&
        time >= last.at &&
        time - last.at <
          (last.failed ? FAILED_UPDATE_RETRY_MS : AUTOMATIC_UPDATE_INTERVAL_MS)
      ) {
        return Promise.resolve(null);
      }
      // Schedule the callback after ownership is set, including synchronous re-entry.
      pending = Promise.resolve()
        .then(check)
        .then(
          (result) => {
            write({ at: now(), failed: result === null });
            return result;
          },
          (error) => {
            write({ at: now(), failed: true });
            throw error;
          },
        )
        .finally(() => {
          pending = null;
        });
      return pending;
    },
  };
};
