/**
 * Dates and times on queue rows, as the TV formats them (`SeerrRequestsPage.kt` `shortDate` and
 * `airingRow`): "MMM d" this year and "MMM d, yyyy" otherwise; air times "EEE, MMM d · <time>",
 * with the year when it is not this year, and the time in the device's 12/24-hour setting.
 */
import type { RowFormat } from "./activityRow";

export interface RowFormatOptions {
  /** BCP 47 locale; the device's when omitted. */
  locale?: string;
  /** IANA zone; the device's when omitted. Tests pass one. */
  timeZone?: string;
  /** Force 12- or 24-hour time; the locale's default when omitted. */
  hour12?: boolean;
}

export function createRowFormat(options: RowFormatOptions = {}): RowFormat {
  const { locale, timeZone, hour12 } = options;
  const base = timeZone ? { timeZone } : {};
  const yearOf = new Intl.DateTimeFormat("en-US", { ...base, year: "numeric" });
  const shortDay = new Intl.DateTimeFormat(locale, {
    ...base,
    month: "short",
    day: "numeric",
  });
  const shortDayYear = new Intl.DateTimeFormat(locale, {
    ...base,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const weekday = new Intl.DateTimeFormat(locale, {
    ...base,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const weekdayYear = new Intl.DateTimeFormat(locale, {
    ...base,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = new Intl.DateTimeFormat(locale, {
    ...base,
    hour: "numeric",
    minute: "2-digit",
    ...(hour12 === undefined ? {} : { hour12 }),
  });
  const sameYear = (ms: number, nowMs: number) =>
    yearOf.format(ms) === yearOf.format(nowMs);

  // A calendar date is a day, not an instant: format it at noon UTC in UTC so no zone moves it.
  const dayOnly = (zone: string) => ({
    short: new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      month: "short",
      day: "numeric",
    }),
    long: new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  });
  const calendar = dayOnly("UTC");

  return {
    requestedOn: (ms, nowMs) =>
      (sameYear(ms, nowMs) ? shortDay : shortDayYear).format(ms),
    releaseOn: (day, nowMs) => {
      const [y, m, d] = day.split("-").map(Number);
      const at = Date.UTC(y, m - 1, d, 12);
      const thisYear = Number(yearOf.format(nowMs));
      return (y === thisYear ? calendar.short : calendar.long).format(at);
    },
    airingAt: (ms, nowMs) =>
      `${(sameYear(ms, nowMs) ? weekday : weekdayYear).format(ms)} · ${time.format(ms)}`,
  };
}
