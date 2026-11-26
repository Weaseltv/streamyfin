import { describe, expect, test } from "bun:test";
import { createKidProfilesClient } from "./kidProfilesApi";

// Port of the TV's KidProfilesHttpApiTest (contract sections 3 and 5), with a fake fetch.

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

function setup(
  reply: () => {
    status: number;
    body: string;
    headers?: Record<string, string>;
  },
  baseUrl = "http://127.0.0.1:1/",
) {
  const requests: Recorded[] = [];
  const client = createKidProfilesClient({
    baseUrl,
    clientHeader: "ios-phone/9.9.9",
    newRequestId: () => "req-1",
    fetch: async (url, init) => {
      requests.push({ url, ...init });
      const r = reply();
      return {
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        text: async () => r.body,
        headers: { get: (name: string) => r.headers?.[name] ?? null },
      };
    },
  });
  return { client, requests };
}

const problem = (status: number, title: string, extra = "") =>
  `{"type":"https://theweasel.tv/problems/${title.toLowerCase()}","title":"${title}","status":${status},"detail":"x"${extra}}`;

const kidJson = `{"id":"6f1c7a8e-2b5d-4c1e-9a0b-3d2e1f4a5b6c","displayName":"Emma","level":"older_kids","state":"active",
  "mediaUserId":"0123456789abcdef0123456789abcdef","mediaUserName":"Emma 2","createdAt":"2026-10-21T19:00:00.000Z","futureField":1}`;

describe("kid profiles website client", () => {
  test("list sends the parent token and parses kids", async () => {
    const { client, requests } = setup(() => ({
      status: 200,
      body: `{"data":{"kids":[${kidJson}],"limit":5}}`,
    }));
    const result = await client.list("parent-token");
    if (result.kind !== "ok") throw new Error(result.kind);
    expect(result.value.limit).toBe(5);
    const kid = result.value.kids[0];
    expect(result.value.kids).toHaveLength(1);
    expect(kid.displayName).toBe("Emma");
    expect(kid.level).toBe("older_kids");
    expect(kid.mediaUserName).toBe("Emma 2");
    expect(kid.mediaUserId).toBe("0123456789abcdef0123456789abcdef");
    const req = requests[0];
    expect(req.method).toBe("GET");
    expect(req.url).toBe("http://127.0.0.1:1/api/v1/weaselplex/tv/kids");
    expect(req.headers.Authorization).toBe("Bearer parent-token");
    expect(req.headers["X-Request-Id"]).toBe("req-1");
    expect(req.headers["X-WeaselPlex-Client"]).toBe("ios-phone/9.9.9");
    expect(req.headers["Idempotency-Key"]).toBeUndefined();
  });

  test("create sends idempotency key and strict body", async () => {
    const { client, requests } = setup(() => ({
      status: 201,
      body: `{"data":{"kid":${kidJson}}}`,
    }));
    const result = await client.create(
      "parent-token",
      "key-0123456789abcdef",
      "Emma",
      "kids",
    );
    if (result.kind !== "ok") throw new Error(result.kind);
    expect(result.value.displayName).toBe("Emma");
    const req = requests[0];
    expect(req.method).toBe("POST");
    expect(req.url.endsWith("/api/v1/weaselplex/tv/kids")).toBe(true);
    expect(req.headers["Idempotency-Key"]).toBe("key-0123456789abcdef");
    expect(req.headers["Content-Type"].startsWith("application/json")).toBe(
      true,
    );
    expect(req.body).toBe(`{"displayName":"Emma","level":"kids"}`);
  });

  test("connect posts the code for the kid", async () => {
    const { client, requests } = setup(() => ({
      status: 200,
      body: `{"data":{"authorized":true,"kid":${kidJson}}}`,
    }));
    const result = await client.connect("parent-token", "kid-1", "123456");
    expect(result.kind).toBe("ok");
    const req = requests[0];
    expect(req.url.endsWith("/api/v1/weaselplex/tv/kids/kid-1/connect")).toBe(
      true,
    );
    expect(req.body).toBe(`{"code":"123456"}`);
    expect(req.headers["Idempotency-Key"]).toBeUndefined();
  });

  test("every contract error code surfaces its title and status", async () => {
    const codes: [number, string][] = [
      [400, "INVALID_REQUEST"],
      [400, "INVALID_JSON"],
      [400, "INVALID_IDEMPOTENCY_KEY"],
      [400, "QUICK_CONNECT_INVALID_CODE"],
      [401, "AUTHENTICATION_REQUIRED"],
      [403, "WEASELPLEX_ACCESS_REQUIRED"],
      [403, "KID_CALLER_FORBIDDEN"],
      [404, "WEASELPLEX_KIDS_UNAVAILABLE"],
      [404, "KID_NOT_FOUND"],
      [409, "KID_LIMIT_REACHED"],
      [409, "KID_NAME_TAKEN"],
      [409, "KID_NOT_ACTIVE"],
      [409, "IDEMPOTENCY_CONFLICT"],
      [409, "REQUEST_IN_PROGRESS"],
      [503, "KID_PROVISIONING_FAILED"],
      [503, "MEDIA_ACCESS_PROVIDER_UNAVAILABLE"],
      [503, "WEASELPLEX_UNAVAILABLE"],
      [500, "INTERNAL_ERROR"],
    ];
    for (const [status, title] of codes) {
      const { client } = setup(() => ({
        status,
        body: problem(status, title),
      }));
      expect(
        await client.create("t", "key-0123456789abcdef", "Emma", "teens"),
      ).toEqual({ kind: "problem", status, code: title });
    }
  });

  test("rate limit prefers retryAfterMs from the body", async () => {
    const { client } = setup(() => ({
      status: 429,
      body: problem(429, "RATE_LIMITED", `,"retryAfterMs":90000`),
      headers: { "Retry-After": "120" },
    }));
    expect(await client.list("t")).toEqual({
      kind: "problem",
      status: 429,
      code: "RATE_LIMITED",
      retryAfterMillis: 90_000,
    });
  });

  test("rate limit falls back to the Retry-After header", async () => {
    const { client } = setup(() => ({
      status: 429,
      body: problem(429, "RATE_LIMITED"),
      headers: { "Retry-After": "120" },
    }));
    expect(await client.list("t")).toEqual({
      kind: "problem",
      status: 429,
      code: "RATE_LIMITED",
      retryAfterMillis: 120_000,
    });
  });

  test("a 404 without a problem body means kid profiles are unavailable", async () => {
    const { client } = setup(() => ({
      status: 404,
      body: "<html>not found</html>",
    }));
    expect(await client.list("t")).toEqual({
      kind: "problem",
      status: 404,
      code: "WEASELPLEX_KIDS_UNAVAILABLE",
    });
  });

  test("a 502 without a problem body is a generic server error", async () => {
    const { client } = setup(() => ({ status: 502, body: "bad gateway" }));
    expect(await client.list("t")).toEqual({
      kind: "problem",
      status: 502,
      code: "INTERNAL_ERROR",
    });
  });

  test("network failure is a network error", async () => {
    const client = createKidProfilesClient({
      clientHeader: "x",
      newRequestId: () => "r",
      fetch: async () => {
        throw new Error("offline");
      },
    });
    expect((await client.list("t")).kind).toBe("network");
  });

  test("malformed success body is a network error", async () => {
    const { client } = setup(() => ({ status: 200, body: "not json" }));
    expect((await client.list("t")).kind).toBe("network");
  });

  test("no website url means unavailable without a request", async () => {
    const { client, requests } = setup(() => ({ status: 200, body: "{}" }), "");
    expect(await client.list("t")).toEqual({
      kind: "problem",
      status: 404,
      code: "WEASELPLEX_KIDS_UNAVAILABLE",
    });
    expect(requests).toHaveLength(0);
  });
});
