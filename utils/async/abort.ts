/** React Native's phone AbortSignal has no throwIfAborted() or reason property. */
export function assertNotAborted(signal: AbortSignal, reason?: unknown) {
  if (!signal.aborted) return;
  if (reason !== undefined) throw reason;
  if (signal.reason !== undefined) throw signal.reason;
  const error = new Error("Request cancelled");
  error.name = "AbortError";
  throw error;
}
