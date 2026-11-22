/**
 * Why a request could not be sent, in the TV's words. Port of
 * `ui/detail/discover/RequestSubmissionError.kt`. Never shows a server body, credential or
 * exception text: only the status code.
 */
import type { Text } from "./types";

/** No matching request session (the TV's `DiscoverSeriesViewModel.kt:344-363`). */
export const SUBMISSION_RECONNECTING: Text = {
  key: "request_status.submission.reconnecting",
};

const MAX_BODY_CHARS = 8192;

function mentionsMissingListing(body: unknown): boolean {
  let fields: unknown = body;
  if (typeof body === "string") {
    if (body.length > MAX_BODY_CHARS) return false;
    try {
      fields = JSON.parse(body);
    } catch {
      return false;
    }
  }
  if (!fields || typeof fields !== "object" || Array.isArray(fields))
    return false;
  const f = fields as Record<string, unknown>;
  return ["message", "error"].some(
    (k) =>
      typeof f[k] === "string" &&
      (f[k] as string).trim().toLowerCase() === "media data not found",
  );
}

/** A failure with no answer from the server (connection lost, timed out). */
function isNetworkFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { response?: unknown; request?: unknown; code?: unknown };
  if (e.response) return false;
  return (
    e.request !== undefined ||
    e.code === "ERR_NETWORK" ||
    e.code === "ECONNABORTED" ||
    e.code === "ETIMEDOUT" ||
    error instanceof TypeError
  );
}

/** The TV's `requestSubmissionError` for an axios-style error. */
export function submissionErrorText(error: unknown): Text {
  const response =
    error && typeof error === "object"
      ? (error as { response?: { status?: unknown; data?: unknown } }).response
      : undefined;
  if (response && mentionsMissingListing(response.data)) {
    return { key: "request_status.submission.listing_not_matched" };
  }
  const status =
    typeof response?.status === "number" ? response.status : undefined;
  if (status === 401 || status === 403)
    return {
      key: "request_status.submission.not_authorized",
      params: { status },
    };
  if (status === 404) return { key: "request_status.submission.not_found" };
  if (status === 409) return { key: "request_status.submission.conflict" };
  if (status === 429) return { key: "request_status.submission.rate_limited" };
  if (status !== undefined && status >= 400 && status <= 499)
    return {
      key: "request_status.submission.not_accepted",
      params: { status },
    };
  if (status !== undefined && status >= 500 && status <= 599)
    return {
      key: "request_status.submission.not_finished",
      params: { status },
    };
  return isNetworkFailure(error)
    ? { key: "request_status.submission.unconfirmed_network" }
    : { key: "request_status.submission.unconfirmed" };
}
