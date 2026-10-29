/** Shared contract with Wholphin docs/request-stages.md (Phase 0 corrections included). */
export interface RequestQueueRow {
  status?: string | null;
  size?: number | null;
  sizeLeft?: number | null;
  estimatedCompletionTime?: string | null;
  episode?: { seasonNumber?: number | null } | null;
}
export interface RequestMedia {
  id?: number;
  tmdbId?: number;
  mediaType?: string;
  updatedAt?: string;
  status?: number | null;
  status4k?: number | null;
  jellyfinMediaId?: string | null;
  jellyfinMediaId4k?: string | null;
  seasons?: {
    seasonNumber: number;
    status?: number | null;
    status4k?: number | null;
  }[];
  downloadStatus?: RequestQueueRow[];
  downloadStatus4k?: RequestQueueRow[];
}
export interface OwnRequest {
  id: number;
  status: number;
  type: string;
  is4k?: boolean;
  createdAt?: string;
  updatedAt?: string;
  requestedBy?: { id: number };
  seasons?: { seasonNumber: number }[];
  media?: RequestMedia;
}
export type RequestStageKind =
  | "WAITING_APPROVAL"
  | "WAITING_LIBRARY"
  | "DOWNLOADING"
  | "ADDING"
  | "READY"
  | "PARTIAL"
  | "FAILED"
  | "CHECKING"
  | "UNRELEASED";
export interface RequestStage {
  kind: RequestStageKind;
  progress?: number;
  eta?: number;
  signature: string;
  detail?: RequestStageKind;
  reason?: "declined" | "unavailable";
  notify: boolean;
}
export const terminalStage = (s: RequestStage) =>
  s.kind === "READY" || s.kind === "FAILED";
export const readyStage = (s: RequestStage) =>
  s.kind === "READY" || s.kind === "PARTIAL";
const stage = (
  kind: RequestStageKind,
  extra: Partial<RequestStage> = {},
): RequestStage => ({ kind, signature: "-", notify: true, ...extra });
export function deriveRequestStage(
  request: OwnRequest,
  futureRelease?: string,
  now = Date.now(),
): RequestStage {
  const media = request.media;
  const status = request.is4k ? media?.status4k : media?.status;
  if ([3, 4].includes(request.status) || status === 6 || status === 7) {
    return stage("FAILED", {
      reason:
        request.status === 3
          ? "declined"
          : status === 6 || status === 7
            ? "unavailable"
            : undefined,
      notify:
        [3, 4].includes(request.status) ||
        (request.status !== 5 && status === 6),
    });
  }
  const seasons = [
    ...new Set((request.seasons ?? []).map((s) => s.seasonNumber)),
  ];
  const availability = new Map(
    (media?.seasons ?? []).map((s) => [
      s.seasonNumber,
      request.is4k ? s.status4k : s.status,
    ]),
  );
  if (
    (request.type === "movie" && status === 5) ||
    (request.type === "tv" &&
      seasons.length > 0 &&
      seasons.every((n) => availability.get(n) === 5))
  )
    return stage("READY");
  const partial =
    request.type === "tv" &&
    seasons.some((n) => [4, 5].includes(availability.get(n) ?? 0));
  if (request.status === 1 && !partial) return stage("WAITING_APPROVAL");
  if (request.type === "tv" && !seasons.length) return stage("CHECKING");
  const remaining = partial
    ? seasons.filter((n) => availability.get(n) !== 5)
    : seasons;
  const queue =
    (request.is4k ? media?.downloadStatus4k : media?.downloadStatus) ?? [];
  const rows = queue.filter(
    (r) =>
      request.type !== "tv" ||
      r.episode?.seasonNumber == null ||
      remaining.includes(r.episode.seasonNumber),
  );
  const active = rows.filter(
    (r) =>
      ["queued", "downloading"].includes(r.status?.toLowerCase() ?? "") &&
      typeof r.size === "number" &&
      Number.isFinite(r.size) &&
      r.size > 0 &&
      typeof r.sizeLeft === "number" &&
      Number.isFinite(r.sizeLeft) &&
      r.sizeLeft >= 0 &&
      r.sizeLeft <= r.size,
  );
  const size = active.reduce((n, r) => n + r.size!, 0);
  const left = active.reduce((n, r) => n + r.sizeLeft!, 0);
  let rest: RequestStage;
  if (request.status === 1) rest = stage("WAITING_APPROVAL");
  else if (
    rows.length &&
    rows.every((r) => r.status?.toLowerCase() === "completed")
  )
    rest = stage("ADDING");
  else if (
    active.length &&
    size > 0 &&
    Number.isFinite(size) &&
    Number.isFinite(left)
  ) {
    const etas = active
      .map((r) => Date.parse(r.estimatedCompletionTime ?? ""))
      .filter((n) => Number.isFinite(n) && n > now);
    rest = stage("DOWNLOADING", {
      progress: Math.max(0, Math.min(1, 1 - left / size)),
      eta: etas.length ? Math.max(...etas) : undefined,
    });
  } else if (rows.length) rest = stage("CHECKING");
  else if (
    request.type === "movie" &&
    futureRelease &&
    /^\d{4}-\d{2}-\d{2}$/.test(futureRelease) &&
    Number.isFinite(Date.parse(futureRelease)) &&
    futureRelease >
      `${new Date(now).getFullYear()}-${String(new Date(now).getMonth() + 1).padStart(2, "0")}-${String(new Date(now).getDate()).padStart(2, "0")}`
  )
    rest = stage("UNRELEASED");
  else if ([2, 5].includes(request.status)) rest = stage("WAITING_LIBRARY");
  else rest = stage("CHECKING");
  return partial
    ? stage("PARTIAL", {
        detail: rest.kind,
        progress: rest.progress,
        eta: rest.eta,
        signature: seasons
          .sort((a, b) => a - b)
          .flatMap((n) =>
            availability.get(n) === 5
              ? [`${n}:A`]
              : availability.get(n) === 4
                ? [`${n}:P`]
                : [],
          )
          .join(","),
      })
    : rest;
}
export function requestEventKey(
  request: OwnRequest,
  s: RequestStage,
): string | undefined {
  if (!s.notify) return undefined;
  const kind =
    s.kind === "READY"
      ? "ready"
      : s.kind === "PARTIAL"
        ? "partial"
        : s.kind === "FAILED"
          ? "failed"
          : undefined;
  return kind
    ? `v1|${request.id}|${request.is4k ? "4k" : "hd"}|${kind}|${s.signature}`
    : undefined;
}
export function matchingRequestItemId(request: OwnRequest): string | undefined {
  const id = request.is4k
    ? request.media?.jellyfinMediaId4k
    : request.media?.jellyfinMediaId;
  return typeof id === "string" &&
    /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(id)
    ? id
    : undefined;
}
export function requestAccountMatches(
  requestUserId: string | null | undefined,
  mediaUserId: string | null | undefined,
): boolean {
  const normalize = (id: string | null | undefined) =>
    typeof id === "string" &&
    /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(id)
      ? id.replaceAll("-", "").toLowerCase()
      : undefined;
  const requestId = normalize(requestUserId);
  return !!requestId && requestId === normalize(mediaUserId);
}
export function deriveRequestRowStage(
  request: OwnRequest,
  fresh: boolean,
  previous?: RequestStage,
): RequestStage {
  return fresh ? deriveRequestStage(request) : (previous ?? stage("CHECKING"));
}
export function requestScope(server: string, userId: number): string {
  const url = server.replace(/\/+$/, "").toLowerCase();
  const key = /^https?:\/\/requests\.theweasel\.tv$/.test(url)
    ? "weaselplex"
    : url;
  return `${key}|${userId}`;
}
export interface RequestJournal {
  initialized: boolean;
  known: number[];
  awaitingBaseline: number[];
  seeded: number[];
  presented: string[];
  pending: string[];
}
export const emptyRequestJournal = (): RequestJournal => ({
  initialized: false,
  known: [],
  awaitingBaseline: [],
  seeded: [],
  presented: [],
  pending: [],
});
export function decodeRequestJournal(value: unknown): RequestJournal {
  if (!value || typeof value !== "object") return emptyRequestJournal();
  const v = value as Record<string, unknown>;
  const numbers = (k: string) =>
    Array.isArray(v[k])
      ? v[k].filter(
          (n): n is number => Number.isSafeInteger(n) && Number(n) > 0,
        )
      : [];
  const keys = (k: string) =>
    Array.isArray(v[k])
      ? v[k].filter(
          (s): s is string =>
            typeof s === "string" &&
            /^v1\|\d+\|(hd|4k)\|(ready|partial|failed)\|[^|]+$/.test(s),
        )
      : [];
  return {
    initialized: v.initialized === true,
    known: numbers("known"),
    awaitingBaseline: numbers("awaitingBaseline"),
    seeded: numbers("seeded"),
    presented: keys("presented"),
    pending: keys("pending"),
  };
}
export interface RequestStatusRow {
  request: OwnRequest;
  stage: RequestStage;
  fresh: boolean;
}
/** Called against the latest journal, never a snapshot taken before network I/O. */
export function reconcileRequestJournal(
  j: RequestJournal,
  rows: RequestStatusRow[],
  enabled = true,
): RequestJournal {
  const known = new Set(j.known),
    awaiting = new Set(j.awaitingBaseline),
    seeded = new Set(j.seeded),
    pending = new Set(j.pending),
    presented = new Set(j.presented);
  for (const row of rows) {
    const id = row.request.id;
    const baseline = (!j.initialized && !seeded.has(id)) || awaiting.has(id);
    known.add(id);
    if (!row.fresh) {
      if (baseline) awaiting.add(id);
      continue;
    }
    const key = requestEventKey(row.request, row.stage);
    for (const old of pending)
      if (Number(old.split("|")[1]) === id && old !== key) pending.delete(old);
    if (key) {
      if (baseline || !enabled) {
        presented.add(key);
        pending.delete(key);
      } else if (!presented.has(key)) pending.add(key);
    }
    awaiting.delete(id);
    seeded.delete(id);
  }
  const boundedKnown = [...known].slice(-5000),
    valid = new Set(boundedKnown);
  const retained = (key: string) => valid.has(Number(key.split("|")[1]));
  return {
    initialized: true,
    known: boundedKnown,
    seeded: [...seeded].filter((id) => valid.has(id)),
    awaitingBaseline: [...awaiting].filter((id) => valid.has(id)),
    pending: [...pending].filter((k) => retained(k) && !presented.has(k)),
    presented: [...presented].filter(retained).slice(-10000),
  };
}
/** Polling and future push both synchronously claim the same key before presenting. */
export function claimPresentation(
  j: RequestJournal,
  key: string,
): { journal: RequestJournal; claimed: boolean } {
  if (j.presented.includes(key)) return { journal: j, claimed: false };
  return {
    journal: {
      ...j,
      pending: j.pending.filter((k) => k !== key),
      presented: [...j.presented, key],
    },
    claimed: true,
  };
}
