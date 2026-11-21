/**
 * The per-account readiness journal: which updates were already shown, which wait for a safe
 * moment, the unread badge. Port of `RequestNotificationStore`, `trackEvents` (:644-730), `seed`,
 * `markOpened`, `setNotificationsEnabled`, `delivered` and `forgetLocked` in the TV's
 * `services/RequestStatusRepository.kt`. Pure: storage is injected (`readJournal`/`writeJournal`).
 *
 * Rules, as on the TV: the first sync baselines finished rows (nothing old is announced); a request
 * the member just submitted on this device is exempt from that baseline; one pop-up per request and
 * quality for all partial steps, then one for fully ready; unread is not added while the queue is
 * on screen; switching updates off turns pending ones into acknowledged ones.
 */
import {
  isReadyStage,
  isTerminalStage,
  itemEventKey,
  presentationKey,
} from "./stage";
import type { RequestStatusItem } from "./types";

export interface RequestEvent {
  key: string;
  requestId: number;
  scopeKey?: string | null;
}

export interface RequestJournal {
  enabled: boolean;
  initialized: boolean;
  awaitingBaseline: number[];
  baselined: number[];
  seeded: number[];
  delivered: string[];
  pending: RequestEvent[];
  unread: number[];
  downloadObserved: number[];
}

export const emptyJournal = (): RequestJournal => ({
  enabled: true,
  initialized: false,
  awaitingBaseline: [],
  baselined: [],
  seeded: [],
  delivered: [],
  pending: [],
  unread: [],
  downloadObserved: [],
});

const eventPresentation = (e: RequestEvent) => presentationKey(e.key);

const EVENT_KEY = /^v1\|\d+\|(?:hd|4k)\|(?:ready|partial|failed)\|[^|]+$/;

/** Read a stored journal defensively: anything malformed becomes the empty journal's value. */
export function decodeJournal(value: unknown): RequestJournal {
  const empty = emptyJournal();
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
  const v = value as Record<string, unknown>;
  const ids = (k: string): number[] =>
    Array.isArray(v[k])
      ? [
          ...new Set(
            (v[k] as unknown[]).filter(
              (n): n is number => Number.isSafeInteger(n) && (n as number) > 0,
            ),
          ),
        ]
      : [];
  const keys = (k: string): string[] =>
    Array.isArray(v[k])
      ? [
          ...new Set(
            (v[k] as unknown[]).filter(
              (s): s is string => typeof s === "string" && EVENT_KEY.test(s),
            ),
          ),
        ]
      : [];
  const pending = Array.isArray(v.pending)
    ? (v.pending as unknown[]).flatMap((e): RequestEvent[] => {
        if (!e || typeof e !== "object") return [];
        const r = e as Record<string, unknown>;
        if (typeof r.key !== "string" || !EVENT_KEY.test(r.key)) return [];
        if (!Number.isSafeInteger(r.requestId) || (r.requestId as number) <= 0)
          return [];
        return [
          {
            key: r.key,
            requestId: r.requestId as number,
            scopeKey: typeof r.scopeKey === "string" ? r.scopeKey : null,
          },
        ];
      })
    : [];
  return {
    enabled: v.enabled !== false,
    initialized: v.initialized === true,
    awaitingBaseline: ids("awaitingBaseline"),
    baselined: ids("baselined"),
    seeded: ids("seeded"),
    delivered: keys("delivered"),
    pending,
    unread: ids("unread"),
    downloadObserved: ids("downloadObserved"),
  };
}

export interface JournalStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
}

export function readJournal(
  storage: JournalStorage,
  key: string,
): RequestJournal {
  try {
    const raw = storage.getString(key);
    return raw ? decodeJournal(JSON.parse(raw)) : emptyJournal();
  } catch {
    return emptyJournal();
  }
}

export function writeJournal(
  storage: JournalStorage,
  key: string,
  journal: RequestJournal,
): void {
  storage.set(key, JSON.stringify(journal));
}

export function journalsEqual(a: RequestJournal, b: RequestJournal): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The TV's `trackEvents`: fold a sync's rows into the journal.
 * @param queueVisible the queue is on screen (no unread is added then).
 */
export function trackEvents(
  store: RequestJournal,
  items: readonly RequestStatusItem[],
  scopeKey: string,
  confirmedGone: ReadonlySet<number>,
  queueVisible: boolean,
): RequestJournal {
  const baselined = new Set(store.baselined);
  const delivered = new Set(store.delivered);
  // Includes earlier acknowledgements: a dismissed partial signature suppresses later partial
  // signatures for this request and quality.
  const deliveredPresentations = new Set([...delivered].map(presentationKey));
  let pending = [...store.pending];
  const unread = new Set(store.unread);
  const seeded = new Set(store.seeded);
  const downloads = new Set(store.downloadObserved);
  const awaiting = new Set(store.awaitingBaseline);

  for (const item of items) {
    if (!item.fresh) continue;
    const id = item.request.id;
    if (isTerminalStage(item.stage)) downloads.delete(id);
    else if (item.stage.downloadObserved) downloads.add(id);
    const event = itemEventKey(item);
    const presentation = event ? presentationKey(event) : null;
    if ((!store.initialized || awaiting.has(id)) && !seeded.has(id)) {
      if (event) {
        delivered.add(event);
        deliveredPresentations.add(presentationKey(event));
      }
    } else if (event && presentation) {
      if (deliveredPresentations.has(presentation)) {
        pending = pending.filter((e) => eventPresentation(e) !== presentation);
      } else {
        const existing = pending.findIndex(
          (e) => eventPresentation(e) === presentation,
        );
        if (existing >= 0) {
          // Keep one pending milestone current without restarting an on-screen card.
          pending[existing] = { key: event, requestId: id, scopeKey };
        } else {
          pending = pending.filter((e) => e.requestId !== id);
          if (store.enabled) {
            pending.push({ key: event, requestId: id, scopeKey });
          } else {
            delivered.add(event);
            deliveredPresentations.add(presentation);
          }
          if (isReadyStage(item.stage) && !queueVisible) unread.add(id);
        }
      }
    }
    baselined.add(id);
    seeded.delete(id);
  }

  const byId = new Map(items.map((i) => [i.request.id, i]));
  pending = pending.filter((e) => {
    if (confirmedGone.has(e.requestId)) return false;
    const item = byId.get(e.requestId);
    if (!item?.fresh) return true;
    const key = itemEventKey(item);
    return (key ? presentationKey(key) : null) === eventPresentation(e);
  });

  const freshIds = new Set(
    items.filter((i) => i.fresh).map((i) => i.request.id),
  );
  const nextAwaiting = new Set(store.awaitingBaseline);
  if (!store.initialized) for (const i of items) nextAwaiting.add(i.request.id);
  const without = (s: Iterable<number>) =>
    [...s].filter((id) => !confirmedGone.has(id));

  return {
    ...store,
    initialized: true,
    awaitingBaseline: without(nextAwaiting).filter((id) => !freshIds.has(id)),
    baselined: without(baselined),
    seeded: without(seeded),
    delivered: [...delivered],
    pending,
    unread: [...unread].filter((id) => {
      if (confirmedGone.has(id)) return false;
      const item = byId.get(id);
      return item ? !item.fresh || isReadyStage(item.stage) : true;
    }),
    downloadObserved: without(downloads),
  };
}

/** A request the member just submitted here: exempt from the baseline, so its first ready shows. */
export function seedRequest(
  store: RequestJournal,
  requestId: number,
  downloadObserved: boolean,
): RequestJournal {
  return {
    ...store,
    seeded: [...new Set([...store.seeded, requestId])],
    baselined: store.baselined.filter((id) => id !== requestId),
    downloadObserved: downloadObserved
      ? [...new Set([...store.downloadObserved, requestId])]
      : store.downloadObserved,
  };
}

/** The queue was seen (all unread cleared) or one request was opened from a card. */
export function markOpened(
  store: RequestJournal,
  requestId?: number,
): RequestJournal {
  return {
    ...store,
    unread:
      requestId === undefined
        ? []
        : store.unread.filter((id) => id !== requestId),
  };
}

/** The Settings switch. Off turns pending updates into acknowledged ones; the badge still counts. */
export function setEnabled(
  store: RequestJournal,
  enabled: boolean,
): RequestJournal {
  return {
    ...store,
    enabled,
    delivered: enabled
      ? store.delivered
      : [...new Set([...store.delivered, ...store.pending.map((e) => e.key)])],
    pending: enabled ? store.pending : [],
  };
}

/** Updates the member saw (card dismissed, timed out or acted on): acknowledge their presentation. */
export function markDelivered(
  store: RequestJournal,
  events: readonly RequestEvent[],
): RequestJournal {
  const presentations = new Set(events.map(eventPresentation));
  const acknowledged = [
    ...events.map((e) => e.key),
    ...store.pending
      .filter((e) => presentations.has(eventPresentation(e)))
      .map((e) => e.key),
  ];
  return {
    ...store,
    delivered: [...new Set([...store.delivered, ...acknowledged])],
    pending: store.pending.filter(
      (e) => !presentations.has(eventPresentation(e)),
    ),
  };
}

/** A cancelled or removed request: drop every trace except delivered keys. */
export function forgetRequest(
  store: RequestJournal,
  requestId: number,
): RequestJournal {
  const drop = (ids: number[]) => ids.filter((id) => id !== requestId);
  return {
    ...store,
    baselined: drop(store.baselined),
    seeded: drop(store.seeded),
    downloadObserved: drop(store.downloadObserved),
    awaitingBaseline: drop(store.awaitingBaseline),
    unread: drop(store.unread),
    pending: store.pending.filter((e) => e.requestId !== requestId),
  };
}

/** Unread ready or partly ready requests (shown as "9+" above nine). */
export function badgeCount(
  items: readonly RequestStatusItem[],
  store: RequestJournal,
): number {
  const unread = new Set(store.unread);
  return items.filter((i) => isReadyStage(i.stage) && unread.has(i.request.id))
    .length;
}

export const badgeLabel = (count: number): string | null =>
  count <= 0 ? null : count > 9 ? "9+" : String(count);
