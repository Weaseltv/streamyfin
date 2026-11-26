/**
 * The website's kid routes (contract sections 3 and 5), the same ones the TV calls: list, create and
 * connect, with the grown-up's own media token as a Bearer. Port of the TV's
 * `kids/KidProfilesHttpApi.kt`. Tokens are never logged. Pure (the fetch is injected), so it runs
 * under `bun test`.
 */

export const WEASELPLEX_WEBSITE_URL = "https://theweasel.tv";
export const KIDS_PATH = "/api/v1/weaselplex/tv/kids";
export const DEFAULT_KID_LIMIT = 5;
const REQUEST_TIMEOUT_MS = 20_000;

/** Kid levels; `wireId` is the website's `level` value, `ceiling` the Jellyfin MaxParentalRating. */
export const KID_LEVELS = [
  { wireId: "kids", ceiling: 10 },
  { wireId: "older_kids", ceiling: 14 },
  { wireId: "teens", ceiling: 17 },
] as const;

export type KidLevel = (typeof KID_LEVELS)[number]["wireId"];

export function kidLevelFromWireId(wireId: string): KidLevel | null {
  return KID_LEVELS.find((l) => l.wireId === wireId)?.wireId ?? null;
}

export interface KidProfile {
  /** The website's id. */
  id: string;
  displayName: string;
  level: KidLevel;
  state: string;
  /** The kid's Jellyfin user id, 32 lowercase hex characters. */
  mediaUserId: string | null;
  mediaUserName: string | null;
}

export interface KidList {
  kids: KidProfile[];
  limit: number;
}

export type KidApiResult<T> =
  | { kind: "ok"; value: T }
  | {
      kind: "problem";
      status: number;
      code: string;
      retryAfterMillis?: number;
    }
  | { kind: "network"; cause: unknown };

/** Problem `title` codes from contract section 3.2 that the phone acts on. */
export const KidProblemCodes = {
  INVALID_REQUEST: "INVALID_REQUEST",
  QUICK_CONNECT_INVALID_CODE: "QUICK_CONNECT_INVALID_CODE",
  AUTHENTICATION_REQUIRED: "AUTHENTICATION_REQUIRED",
  ACCESS_REQUIRED: "WEASELPLEX_ACCESS_REQUIRED",
  KIDS_UNAVAILABLE: "WEASELPLEX_KIDS_UNAVAILABLE",
  KID_NOT_FOUND: "KID_NOT_FOUND",
  KID_LIMIT_REACHED: "KID_LIMIT_REACHED",
  KID_NAME_TAKEN: "KID_NAME_TAKEN",
  KID_NOT_ACTIVE: "KID_NOT_ACTIVE",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  REQUEST_IN_PROGRESS: "REQUEST_IN_PROGRESS",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  headers: { get: (name: string) => string | null };
}>;

export interface KidProfilesClient {
  list(parentAccessToken: string): Promise<KidApiResult<KidList>>;
  create(
    parentAccessToken: string,
    idempotencyKey: string,
    displayName: string,
    level: KidLevel,
  ): Promise<KidApiResult<KidProfile>>;
  connect(
    parentAccessToken: string,
    kidId: string,
    quickConnectCode: string,
  ): Promise<KidApiResult<KidProfile>>;
}

export interface KidProfilesClientOptions {
  fetch: FetchLike;
  /** `X-WeaselPlex-Client` (audit only), eg `ios-phone/1.41`. */
  clientHeader: string;
  newRequestId: () => string;
  baseUrl?: string;
}

interface KidJson {
  id: string;
  displayName: string;
  level: string;
  state: string;
  mediaUserId?: string | null;
  mediaUserName?: string | null;
}

function toKidProfile(json: KidJson): KidProfile {
  if (
    typeof json?.id !== "string" ||
    typeof json.displayName !== "string" ||
    typeof json.level !== "string" ||
    typeof json.state !== "string"
  ) {
    throw new Error("Kid profiles response had no kid");
  }
  return {
    id: json.id,
    displayName: json.displayName,
    // An unknown level only labels the row (the server policy decides what the kid sees), so it
    // reads as the most restrictive one.
    level: kidLevelFromWireId(json.level) ?? "kids",
    state: json.state,
    mediaUserId: json.mediaUserId ?? null,
    mediaUserName: json.mediaUserName ?? null,
  };
}

export function createKidProfilesClient(
  options: KidProfilesClientOptions,
): KidProfilesClient {
  const baseUrl = (options.baseUrl ?? WEASELPLEX_WEBSITE_URL).trim();

  async function call<T>(
    token: string,
    path: string,
    body: string | null,
    parse: (data: any) => T,
    idempotencyKey?: string,
  ): Promise<KidApiResult<T>> {
    // Builds without the website have no kid routes, the same as the website's flag being off.
    if (!baseUrl)
      return {
        kind: "problem",
        status: 404,
        code: KidProblemCodes.KIDS_UNAVAILABLE,
      };
    const url = `${baseUrl.replace(/\/+$/, "")}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "X-Request-Id": options.newRequestId(),
      "X-WeaselPlex-Client": options.clientHeader,
    };
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    if (body !== null) headers["Content-Type"] = "application/json";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await options.fetch(url, {
        method: body === null ? "GET" : "POST",
        headers,
        body: body ?? undefined,
        signal: controller.signal,
      });
      const text = await response.text();
      if (response.ok) {
        const data = JSON.parse(text)?.data;
        if (data == null) throw new Error("Kid profiles response had no data");
        return { kind: "ok", value: parse(data) };
      }
      let problem: { title?: unknown; retryAfterMs?: unknown } | null = null;
      try {
        problem = JSON.parse(text);
      } catch {
        problem = null;
      }
      const header = response.headers.get("Retry-After")?.trim();
      const headerSeconds =
        header && /^\d+$/.test(header) ? Number(header) : null;
      const retryAfterMillis =
        typeof problem?.retryAfterMs === "number"
          ? problem.retryAfterMs
          : headerSeconds !== null
            ? headerSeconds * 1000
            : undefined;
      const title =
        typeof problem?.title === "string" && problem.title.trim()
          ? problem.title
          : null;
      const code =
        title ??
        (response.status === 404
          ? // A missing route (website not deployed yet) reads as the flag being off.
            KidProblemCodes.KIDS_UNAVAILABLE
          : response.status === 429
            ? KidProblemCodes.RATE_LIMITED
            : response.status >= 500
              ? KidProblemCodes.INTERNAL_ERROR
              : `HTTP_${response.status}`);
      return {
        kind: "problem",
        status: response.status,
        code,
        ...(retryAfterMillis !== undefined && { retryAfterMillis }),
      };
    } catch (cause) {
      console.warn(`Kid profiles request ${path} failed`);
      return { kind: "network", cause };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    list: (token) =>
      call(token, KIDS_PATH, null, (data) => ({
        kids: (Array.isArray(data.kids) ? data.kids : []).map(toKidProfile),
        limit: typeof data.limit === "number" ? data.limit : DEFAULT_KID_LIMIT,
      })),
    create: (token, idempotencyKey, displayName, level) =>
      call(
        token,
        KIDS_PATH,
        JSON.stringify({ displayName, level }),
        (data) => toKidProfile(data.kid),
        idempotencyKey,
      ),
    connect: (token, kidId, code) =>
      call(
        token,
        `${KIDS_PATH}/${encodeURIComponent(kidId)}/connect`,
        JSON.stringify({ code }),
        (data) => toKidProfile(data.kid),
      ),
  };
}
