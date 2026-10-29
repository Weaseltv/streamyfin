import {
  deriveRequestRowStage,
  type OwnRequest,
  type RequestStatusRow,
} from "./requestStatus";
export interface OwnRequestsSource {
  list(
    skip: number,
    signal: AbortSignal,
  ): Promise<{
    results: OwnRequest[];
    pageInfo?: { pages?: number; page?: number; results?: number };
  }>;
  detail(id: number, signal: AbortSignal): Promise<OwnRequest>;
}
export interface OwnRequestsSnapshot {
  rows: RequestStatusRow[];
  complete: boolean;
  updatedAt: number;
}
/** No persistence here: callers commit only while their captured account remains current. */
export async function syncOwnRequests(
  source: OwnRequestsSource,
  userId: number,
  previous: RequestStatusRow[],
  knownIds: number[],
  missing: Map<number, number>,
  signal: AbortSignal,
): Promise<OwnRequestsSnapshot> {
  const owned = new Map<number, OwnRequest>();
  let complete = false;
  let skip = 0,
    pageNumber = 0;
  while (skip < 1000 && pageNumber < 1000) {
    signal.throwIfAborted();
    const page = await source.list(skip, signal);
    if (!Array.isArray(page.results)) throw new Error("Invalid request list");
    for (const r of page.results)
      if (
        r.requestedBy?.id === userId &&
        Number.isSafeInteger(r.id) &&
        r.id > 0
      )
        owned.set(r.id, r);
    skip += page.results.length;
    pageNumber++;
    const info = page.pageInfo;
    if (
      !page.results.length ||
      (info?.results !== undefined && skip >= info.results) ||
      (info?.pages !== undefined && (info.page ?? pageNumber) >= info.pages) ||
      (!info && page.results.length < 50)
    ) {
      complete = true;
      break;
    }
  }
  const previousById = new Map(previous.map((row) => [row.request.id, row]));
  const missingIds = complete
    ? [...new Set([...knownIds, ...previousById.keys()])].filter(
        (id) => !owned.has(id),
      )
    : [];
  const output = new Map<number, RequestStatusRow>();
  if (!complete)
    for (const old of previous)
      if (!owned.has(old.request.id))
        output.set(old.request.id, { ...old, fresh: false });
  const tasks: (() => Promise<void>)[] = missingIds.map((id) => async () => {
    try {
      const r = await source.detail(id, signal);
      if (r.id === id && r.requestedBy?.id === userId) {
        owned.set(id, r);
        missing.delete(id);
      } else {
        const old = previousById.get(id);
        if (old) output.set(id, { ...old, fresh: false });
      }
    } catch (e) {
      signal.throwIfAborted();
      const status = (e as { response?: { status?: number } }).response?.status;
      if (status === 404) missing.set(id, (missing.get(id) ?? 0) + 1);
      const old = previousById.get(id);
      if (old && (missing.get(id) ?? 0) < 2)
        output.set(id, { ...old, fresh: false });
    }
  });
  async function bounded(work: (() => Promise<void>)[]) {
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, work.length) }, async () => {
        while (next < work.length) {
          signal.throwIfAborted();
          await work[next++]!();
        }
      }),
    );
  }
  await bounded(tasks);
  const mediaReads = new Map<string, Promise<OwnRequest["media"]>>();
  await bounded(
    [...owned.values()].map((request) => async () => {
      missing.delete(request.id);
      let fresh = true;
      const old = previousById.get(request.id);
      const unchangedTerminal =
        old?.fresh &&
        (old.stage.kind === "READY" || [3, 4].includes(old.request.status)) &&
        request.updatedAt === old.request.updatedAt &&
        request.media?.updatedAt === old.request.media?.updatedAt &&
        request.media?.status === old.request.media?.status &&
        request.media?.status4k === old.request.media?.status4k &&
        request.status === old.request.status;
      if (unchangedTerminal)
        request = {
          ...request,
          media: { ...request.media, seasons: old.request.media?.seasons },
        };
      if (
        request.type === "tv" &&
        !request.media?.seasons &&
        ![3, 4].includes(request.status)
      ) {
        const key = String(
          request.media?.id ?? request.media?.tmdbId ?? request.id,
        );
        let read = mediaReads.get(key);
        if (!read) {
          read = source.detail(request.id, signal).then((detail) => {
            if (
              detail.id !== request.id ||
              detail.requestedBy?.id !== userId ||
              !Array.isArray(detail.media?.seasons)
            )
              throw new Error("Unknown season availability");
            return detail.media;
          });
          mediaReads.set(key, read);
        }
        try {
          const hydrated = await read;
          request = {
            ...request,
            media: { ...request.media, seasons: hydrated?.seasons },
          };
        } catch {
          signal.throwIfAborted();
          fresh = false;
          if (old)
            request = {
              ...request,
              media: { ...request.media, seasons: old.request.media?.seasons },
            };
        }
      }
      output.set(request.id, {
        request,
        fresh,
        stage: deriveRequestRowStage(request, fresh, old?.stage),
      });
    }),
  );
  signal.throwIfAborted();
  return {
    rows: [...output.values()].sort(
      (a, b) =>
        Date.parse(b.request.updatedAt ?? "") -
          Date.parse(a.request.updatedAt ?? "") || b.request.id - a.request.id,
    ),
    complete,
    updatedAt: Date.now(),
  };
}
