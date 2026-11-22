/**
 * The progress service's transport on `expo/fetch` (plan 5.4): the pinned request server's origin,
 * the native cookie store's request-server session (`credentials: "include"`), redirects refused,
 * and only `Accept` and `Cache-Control: no-cache` on reads. No Cookie header, no proxy headers, no
 * API key. Expo SDK 57's source shows `expo/fetch` shares the app's native cookie store and refuses
 * redirects when asked; this is proven on a device in pull request 3's check.
 */
import { fetch } from "expo/fetch";
import type { HttpFailure, ProgressTransport } from "../progressRunner";

/** Streaming is used on this platform. Switched off by this constant if the device check fails. */
export const LIVE_STREAM_ENABLED = true;
/** The live layer as a whole (off if the device check shows the cookie is not shared). */
export const LIVE_LAYER_ENABLED = true;

type FetchResponse = Awaited<ReturnType<typeof fetch>>;

async function failureOf(
  res: FetchResponse,
  status = res.status,
): Promise<HttpFailure> {
  let error: string | null = null;
  try {
    if ((res.headers.get("content-type") ?? "").includes("application/json")) {
      const body = (await res.json()) as { error?: unknown };
      error = typeof body?.error === "string" ? body.error : null;
    }
  } catch {
    error = null;
  }
  return {
    kind: "http",
    status,
    retryAfter: res.headers.get("retry-after"),
    error,
  };
}

export interface ProofAnswer {
  status: number;
  seerrUserId?: number;
  retryAfter?: string | null;
}

export interface NativeProgressTransport extends ProgressTransport {
  /** The transport proof (5.3 rule 5): who the progress transport's session belongs to. */
  authMe(signal: AbortSignal): Promise<ProofAnswer>;
}

export function createProgressTransport(
  origin: string,
): NativeProgressTransport {
  const base = origin.replace(/\/+$/, "");
  const init = (signal: AbortSignal, accept: string) => ({
    signal,
    credentials: "include" as const,
    redirect: "error" as const,
    headers: { Accept: accept, "Cache-Control": "no-cache" },
  });
  return {
    async openStream(signal) {
      const res = await fetch(
        `${base}/progress/v1/stream`,
        init(signal, "text/event-stream"),
      );
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.includes("text/event-stream") || !res.body) {
        // A 200 that is not an event stream means the route is not supported here.
        return failureOf(res, res.ok ? 200 : res.status);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let ended = false;
      return {
        kind: "stream",
        handle: {
          async read() {
            if (ended) return null;
            const { value, done } = await reader.read();
            if (done) {
              ended = true;
              const tail = decoder.decode();
              return tail.length > 0 ? tail : null;
            }
            return decoder.decode(value, { stream: true });
          },
        },
      };
    },
    async getSnapshot(signal) {
      const res = await fetch(
        `${base}/progress/v1/snapshot`,
        init(signal, "application/json"),
      );
      if (!res.ok) return failureOf(res);
      return { kind: "ok", body: await res.text() };
    },
    async authMe(signal) {
      const res = await fetch(
        `${base}/api/v1/auth/me`,
        init(signal, "application/json"),
      );
      if (!res.ok)
        return {
          status: res.status,
          retryAfter: res.headers.get("retry-after"),
        };
      const body = (await res.json()) as { id?: unknown };
      return {
        status: res.status,
        seerrUserId: Number.isSafeInteger(body?.id)
          ? (body.id as number)
          : undefined,
      };
    },
  };
}

/** The real clock for the runner. */
export const systemClock = {
  now: () => Date.now(),
  sleep: (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      if (signal.aborted) return reject(new Error("aborted"));
      const timer = setTimeout(resolve, ms);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      });
    }),
};
