import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getDisplayPreferencesApi } from "@jellyfin/sdk/lib/utils/api";

// Existing customer Android TV storage. Keep the same wire format so customer
// TV, Alpha, iOS and Android phone all read the same per-server/member list.
export const DISMISSAL_PREFS = {
  displayPreferencesId: "default",
  client: "Wholphin",
} as const;
export const DISMISSAL_KEY = "removeNextUp";
export type NextUpDismissals = Record<string, string>;

export const seriesKey = (id: string) => id.replace(/-/g, "").toLowerCase();
const validId = (id: string) => /^[0-9a-f]{32}$/.test(seriesKey(id));
const wireId = (id: string) =>
  seriesKey(id).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");

/** Jellyfin/TV timestamps without an offset represent UTC; accept nanoseconds. */
export function dismissalTime(value: string): number {
  const millis = value.replace(/\.(\d{3})\d+/, ".$1");
  return Date.parse(
    /(?:Z|[+-]\d\d:\d\d)$/i.test(millis) ? millis : `${millis}Z`,
  );
}

export function decodeDismissals(
  raw: string | null | undefined,
): NextUpDismissals {
  if (raw == null) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || !("value" in parsed)) {
    throw new Error("Invalid Next Up dismissal preferences");
  }
  const value = parsed.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Next Up dismissal preferences");
  }
  const result: NextUpDismissals = {};
  for (const [id, time] of Object.entries(value)) {
    if (
      !validId(id) ||
      typeof time !== "string" ||
      !Number.isFinite(dismissalTime(time))
    ) {
      throw new Error("Invalid Next Up dismissal entry");
    }
    result[seriesKey(id)] = time;
  }
  return result;
}

export function encodeDismissals(value: NextUpDismissals): string {
  return JSON.stringify({
    value: Object.fromEntries(
      Object.entries(value).map(([id, time]) => [wireId(id), time]),
    ),
  });
}

// Read/modify/write is serialized within this app, including migration and
// background refresh. Every write starts with fresh server preferences and
// preserves other keys (notably TV Home layout).
const queues = new WeakMap<Api, Map<string, Promise<unknown>>>();
function serial<T>(
  api: Api,
  userId: string,
  task: () => Promise<T>,
): Promise<T> {
  let users = queues.get(api);
  if (!users) {
    users = new Map();
    queues.set(api, users);
  }
  const previous = users.get(userId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  users.set(userId, next);
  void next
    .finally(() => {
      if (users.get(userId) === next) users.delete(userId);
    })
    .catch(() => {});
  return next;
}

async function change(
  api: Api,
  userId: string,
  edit: (value: NextUpDismissals) => void,
): Promise<NextUpDismissals> {
  const endpoint = getDisplayPreferencesApi(api);
  const parameters = { ...DISMISSAL_PREFS, userId };
  const { data: prefs } = await endpoint.getDisplayPreferences(parameters);
  const value = decodeDismissals(prefs.CustomPrefs?.[DISMISSAL_KEY]);
  const before = encodeDismissals(value);
  edit(value);
  const after = encodeDismissals(value);
  if (after !== before) {
    await endpoint.updateDisplayPreferences({
      ...parameters,
      displayPreferencesDto: {
        ...prefs,
        CustomPrefs: { ...prefs.CustomPrefs, [DISMISSAL_KEY]: after },
      },
    });
  }
  return value;
}

/** Import legacy device-only removals once; caller clears them only on success. */
export function loadDismissals(
  api: Api,
  userId: string,
  legacy: readonly string[] = [],
  now = new Date(),
): Promise<NextUpDismissals> {
  return serial(api, userId, () =>
    change(api, userId, (value) => {
      for (const id of legacy) {
        if (validId(id))
          value[seriesKey(id)] ??= now.toISOString().replace(/Z$/, "");
      }
    }),
  );
}

export function setDismissed(
  api: Api,
  userId: string,
  seriesId: string,
  dismissed: boolean,
  now = new Date(),
): Promise<NextUpDismissals> {
  if (!validId(seriesId)) return Promise.reject(new Error("Invalid series id"));
  return serial(api, userId, () =>
    change(api, userId, (value) => {
      if (dismissed)
        value[seriesKey(seriesId)] = now.toISOString().replace(/Z$/, "");
      else delete value[seriesKey(seriesId)];
    }),
  );
}

export function isDismissed(
  item: BaseItemDto,
  value: NextUpDismissals,
): boolean {
  if (item.Type !== "Episode" || !item.SeriesId) return false;
  const time = value[seriesKey(item.SeriesId)];
  if (!time) return false;
  const played = item.UserData?.LastPlayedDate;
  return !played || !(dismissalTime(played) > dismissalTime(time));
}
