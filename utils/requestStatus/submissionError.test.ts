import { describe, expect, test } from "bun:test";
import {
  SUBMISSION_RECONNECTING,
  submissionErrorText,
} from "./submissionError";

const answered = (status: number, data?: unknown) => ({
  response: { status, data },
});

describe("submission errors (port of RequestSubmissionError.kt)", () => {
  test("each status has the TV's line, with the code where the TV shows it", () => {
    expect(submissionErrorText(answered(401))).toEqual({
      key: "request_status.submission.not_authorized",
      params: { status: 401 },
    });
    expect(submissionErrorText(answered(403)).params).toEqual({ status: 403 });
    expect(submissionErrorText(answered(404)).key).toBe(
      "request_status.submission.not_found",
    );
    expect(submissionErrorText(answered(409)).key).toBe(
      "request_status.submission.conflict",
    );
    expect(submissionErrorText(answered(429)).key).toBe(
      "request_status.submission.rate_limited",
    );
    expect(submissionErrorText(answered(422))).toEqual({
      key: "request_status.submission.not_accepted",
      params: { status: 422 },
    });
    expect(submissionErrorText(answered(502))).toEqual({
      key: "request_status.submission.not_finished",
      params: { status: 502 },
    });
  });

  test("an unmatched listing is explained, from a parsed or a text body", () => {
    expect(
      submissionErrorText(answered(500, { message: "Media data not found" }))
        .key,
    ).toBe("request_status.submission.listing_not_matched");
    expect(
      submissionErrorText(answered(404, '{"error":" media data not found "}'))
        .key,
    ).toBe("request_status.submission.listing_not_matched");
    expect(
      submissionErrorText(answered(500, `{"message":"${"x".repeat(9000)}"}`))
        .key,
    ).toBe("request_status.submission.not_finished");
  });

  test("no answer at all: unsure whether it was sent", () => {
    expect(submissionErrorText({ request: {}, code: "ERR_NETWORK" }).key).toBe(
      "request_status.submission.unconfirmed_network",
    );
    expect(submissionErrorText({ code: "ECONNABORTED" }).key).toBe(
      "request_status.submission.unconfirmed_network",
    );
    expect(submissionErrorText(new Error("boom")).key).toBe(
      "request_status.submission.unconfirmed",
    );
    expect(submissionErrorText(answered(302)).key).toBe(
      "request_status.submission.unconfirmed",
    );
  });

  test("no session: reconnecting", () => {
    expect(SUBMISSION_RECONNECTING.key).toBe(
      "request_status.submission.reconnecting",
    );
  });
});
