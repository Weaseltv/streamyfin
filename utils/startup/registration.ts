type RegistrationOptions = {
  register: () => Promise<void>;
  isCurrent: () => boolean;
  onError: (error: unknown) => void;
  onComplete: () => void;
  schedule?: (callback: () => void, delay: number) => () => void;
};

const RETRY_DELAYS = [60_000, 180_000];

/** Retry transient startup failures without reviving a logged-out session. */
export function startSessionRegistration({
  register,
  isCurrent,
  onError,
  onComplete,
  schedule = (callback, delay) => {
    const timer = setTimeout(callback, delay);
    return () => clearTimeout(timer);
  },
}: RegistrationOptions): () => void {
  let stopped = false;
  let attempts = 0;
  let cancelTimer: (() => void) | undefined;
  const active = () => !stopped && isCurrent();

  const attempt = async () => {
    if (!active()) return;
    attempts += 1;
    try {
      await register();
      if (active()) onComplete();
    } catch (error) {
      if (!active()) return;
      onError(error);
      const delay = RETRY_DELAYS[attempts - 1];
      if (delay !== undefined && active()) {
        cancelTimer = schedule(() => void attempt(), delay);
      }
    }
  };

  void attempt();
  return () => {
    stopped = true;
    cancelTimer?.();
  };
}
