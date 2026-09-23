import { CancelledError } from "@tanstack/react-query";
import axios from "axios";

/**
 * Whether a thrown value represents deliberate cancellation rather than a
 * failure worth showing the user.
 *
 * Search, navigation and playback all supersede their own in-flight requests,
 * so cancellation is routine and must stay silent. Real failures must not be
 * swallowed alongside it — doing that is what made a dropped connection render
 * as "no results" instead of an error with a retry.
 *
 * Covers the three shapes this app can produce: React Query's own
 * `CancelledError`, axios cancellation, and a `DOMException`/`Error` named
 * `AbortError` from a raw `AbortSignal`.
 */
export const isCancellation = (error: unknown): boolean => {
  if (error instanceof CancelledError) return true;
  if (axios.isCancel(error)) return true;
  if (
    axios.isAxiosError(error) &&
    (error.code === "ERR_CANCELED" || error.name === "CanceledError")
  ) {
    return true;
  }
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
};
