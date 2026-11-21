/**
 * Incremental Server-Sent Events parser for the progress service's stream
 * (`GET /progress/v1/stream`), following the WHATWG event-stream rules: lines end in CRLF, LF or
 * CR (also split across chunks); `:` starts a comment (the service's `: ping` heartbeat);
 * `event`, `data` (multi-line, joined with LF), `id` and `retry` fields; an empty line dispatches.
 *
 * Bounded: an unfinished line or an event's data longer than `maxChars` (2,000,000 by default)
 * throws `SseOverflowError`, which the runner treats as an unsupported stream. Nothing queues
 * without limit.
 */

export type SseItem =
  | { kind: "event"; event: string; data: string; id?: string }
  | { kind: "retry"; ms: number }
  | { kind: "comment"; text: string };

export class SseOverflowError extends Error {
  constructor() {
    super("SSE frame exceeds the size limit");
    this.name = "SseOverflowError";
  }
}

export const SSE_MAX_CHARS = 2_000_000;

export interface SseParser {
  /** Feed decoded text; returns everything completed by it, in order. */
  push(chunk: string): SseItem[];
  /** The stream ended: an unfinished event is dropped, as the standard says. */
  end(): SseItem[];
}

export function createSseParser(maxChars: number = SSE_MAX_CHARS): SseParser {
  let buffer = "";
  let started = false;
  let skipLf = false;
  let event = "";
  let data: string[] = [];
  let dataChars = 0;
  let hasData = false;
  let id: string | undefined;

  const reset = () => {
    event = "";
    data = [];
    dataChars = 0;
    hasData = false;
  };

  const line = (text: string, out: SseItem[]) => {
    if (text === "") {
      if (hasData) {
        out.push({
          kind: "event",
          event: event || "message",
          data: data.join("\n"),
          ...(id !== undefined ? { id } : {}),
        });
      }
      reset();
      return;
    }
    if (text.startsWith(":")) {
      out.push({ kind: "comment", text: text.slice(1).replace(/^ /, "") });
      return;
    }
    const colon = text.indexOf(":");
    const field = colon < 0 ? text : text.slice(0, colon);
    let value = colon < 0 ? "" : text.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    switch (field) {
      case "event":
        event = value;
        break;
      case "data":
        dataChars += value.length + (hasData ? 1 : 0);
        if (dataChars > maxChars) throw new SseOverflowError();
        data.push(value);
        hasData = true;
        break;
      case "id":
        if (!value.includes("\u0000")) id = value;
        break;
      case "retry":
        if (/^\d+$/.test(value)) out.push({ kind: "retry", ms: Number(value) });
        break;
      default:
        break;
    }
  };

  return {
    push(chunk: string): SseItem[] {
      const out: SseItem[] = [];
      let text = chunk;
      if (!started && text.length > 0) {
        started = true;
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      }
      if (skipLf && text.startsWith("\n")) text = text.slice(1);
      skipLf = false;
      let from = 0;
      for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (c !== 10 && c !== 13) continue;
        line(buffer + text.slice(from, i), out);
        buffer = "";
        if (c === 13) {
          if (i + 1 < text.length) {
            if (text.charCodeAt(i + 1) === 10) i++;
          } else {
            skipLf = true;
          }
        }
        from = i + 1;
      }
      buffer += text.slice(from);
      if (buffer.length > maxChars) throw new SseOverflowError();
      return out;
    },
    end(): SseItem[] {
      buffer = "";
      reset();
      return [];
    },
  };
}
