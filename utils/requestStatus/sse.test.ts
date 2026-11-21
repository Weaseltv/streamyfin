import { describe, expect, test } from "bun:test";
import envelopes from "../../docs/request-notifications/progress-envelopes.fixture.json";
import { createSseParser, type SseItem, SseOverflowError } from "./sse";

const feed = (chunks: string[], max?: number): SseItem[] => {
  const p = createSseParser(max);
  return chunks.flatMap((c) => p.push(c));
};

describe("SSE parser", () => {
  test("the service's stream: retry, the snapshot event, then the ping comment", () => {
    const items = feed([envelopes.stream]);
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({ kind: "retry", ms: 2000 });
    expect(items[1]).toMatchObject({ kind: "event", event: "snapshot" });
    expect(JSON.parse((items[1] as { data: string }).data)).toEqual(
      envelopes.snapshot,
    );
    expect(items[2]).toEqual({ kind: "comment", text: "ping" });
  });

  test("the same stream split into one-character chunks gives the same items", () => {
    expect(feed(envelopes.stream.split(""))).toEqual(feed([envelopes.stream]));
  });

  test("CRLF and CR line endings, including a CRLF split across chunks", () => {
    const expected = [{ kind: "event", event: "update", data: "{}" }];
    expect(feed(["event: update\r\ndata: {}\r\n\r\n"])).toEqual(expected);
    expect(feed(["event: update\rdata: {}\r\r"])).toEqual(expected);
    expect(feed(["event: update\r", "\ndata: {}\r", "\n\r", "\n"])).toEqual(
      expected,
    );
  });

  test("multi-line data joins with a line feed; no space or one space after the colon", () => {
    expect(feed(["data:a\ndata: b\n\n"])).toEqual([
      { kind: "event", event: "message", data: "a\nb" },
    ]);
  });

  test("an event with no data is not dispatched; unknown fields are ignored", () => {
    expect(feed(["event: status\n\n", "foo: bar\nretry: x\n\n"])).toEqual([]);
  });

  test("a byte-order mark at the start is ignored; id is kept", () => {
    expect(feed(["\uFEFFid: 4\ndata: x\n\n"])).toEqual([
      { kind: "event", event: "message", data: "x", id: "4" },
    ]);
  });

  test("an unfinished event at the end of the stream is dropped", () => {
    const p = createSseParser();
    expect(p.push("event: update\ndata: {}\n")).toEqual([]);
    expect(p.end()).toEqual([]);
  });

  test("an over-long unfinished line or event data is refused", () => {
    expect(() => feed(["data: 0123456789"], 10)).toThrow(SseOverflowError);
    expect(() => feed(["data: 01234\n", "data: 56789\n"], 10)).toThrow(
      SseOverflowError,
    );
    expect(feed(["data: 012\n\n"], 10)).toHaveLength(1);
  });
});
