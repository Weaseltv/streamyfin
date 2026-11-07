import { describe, expect, test } from "bun:test";
import { Jellyfin } from "@jellyfin/sdk";
import type { DisplayPreferencesDto } from "@jellyfin/sdk/lib/generated-client/models";
import axios from "axios";
import {
  decodeDismissals,
  dismissalTime,
  encodeDismissals,
  isDismissed,
  loadDismissals,
  seriesKey,
  setDismissed,
} from "./nextUpDismissals";

const series = "281868fd6a4b7a21bb1326166a2a08e7";
const other = "00000000000000000000000000000002";
const removed = "2026-11-06T14:20:30.123456789";
const now = new Date("2026-11-07T10:00:00.123Z");

function server() {
  const documents = new Map<string, DisplayPreferencesDto>();
  const requests: {
    method: string;
    user: string;
    host: string;
    body?: DisplayPreferencesDto;
  }[] = [];
  let failWrite = false;
  let maxActive = 0,
    active = 0;
  const apiFor = (host = "https://media.example") => {
    const client = axios.create({
      adapter: async (config) => {
        const url = new URL(axios.getUri(config));
        expect(url.pathname).toBe("/DisplayPreferences/default");
        expect(url.searchParams.get("client")).toBe("Wholphin");
        const user = url.searchParams.get("userId")!;
        const key = `${url.host}|${user}`;
        active++;
        maxActive = Math.max(maxActive, active);
        try {
          await new Promise((resolve) => setTimeout(resolve, 1));
          const body = config.data
            ? (JSON.parse(config.data) as DisplayPreferencesDto)
            : undefined;
          requests.push({ method: config.method!, host: url.host, user, body });
          if (config.method === "post") {
            if (failWrite) throw new Error("network unavailable");
            documents.set(key, structuredClone(body!));
          }
          return {
            data: structuredClone(
              documents.get(key) ?? { Id: "default", CustomPrefs: {} },
            ),
            status: 200,
            statusText: "OK",
            headers: {},
            config,
          };
        } finally {
          active--;
        }
      },
    });
    return new Jellyfin({
      clientInfo: { name: "test", version: "test" },
      deviceInfo: { name: "test", id: "test" },
    }).createApi(host, "test-token", client);
  };
  return {
    apiFor,
    documents,
    requests,
    fail: (value: boolean) => {
      failWrite = value;
    },
    maxActive: () => maxActive,
  };
}

describe("shared TV / iOS / Android phone Next Up dismissals", () => {
  test("reads the existing TV UUID and nanosecond timestamp wire format", async () => {
    const s = server(),
      api = s.apiFor();
    s.documents.set("media.example|member", {
      CustomPrefs: {
        removeNextUp:
          '{"value":{"281868fd-6a4b-7a21-bb13-26166a2a08e7":"2026-11-06T14:20:30.123456789"}}',
      },
    });
    expect(await loadDismissals(api, "member")).toEqual({ [series]: removed });
    expect(dismissalTime(removed)).toBe(Date.parse("2026-11-06T14:20:30.123Z"));
    expect(s.requests.map((r) => r.method)).toEqual(["get"]);
  });

  test("a phone removal is visible to another client and preserves TV Home preferences", async () => {
    const s = server();
    s.documents.set("media.example|member", {
      Id: "default",
      SortBy: "SortName",
      CustomPrefs: { homeSettings: "keep-layout" },
    });
    await setDismissed(s.apiFor(), "member", series, true, now);
    const fresh = await loadDismissals(s.apiFor(), "member");
    expect(isDismissed({ Type: "Episode", SeriesId: series }, fresh)).toBe(
      true,
    );
    const saved = s.documents.get("media.example|member")!;
    expect(saved.SortBy).toBe("SortName");
    expect(saved.CustomPrefs?.homeSettings).toBe("keep-layout");
    expect(saved.CustomPrefs?.removeNextUp).toBe(
      '{"value":{"281868fd-6a4b-7a21-bb13-26166a2a08e7":"2026-11-07T10:00:00.123"}}',
    );
  });

  test("imports device-only removals without overwriting an existing removal timestamp", async () => {
    const s = server(),
      api = s.apiFor();
    s.documents.set("media.example|member", {
      CustomPrefs: { removeNextUp: encodeDismissals({ [series]: removed }) },
    });
    expect(await loadDismissals(api, "member", [series, other], now)).toEqual({
      [series]: removed,
      [other]: "2026-11-07T10:00:00.123",
    });
    await setDismissed(s.apiFor(), "member", series, false);
    // Subsequent loads use the shared server, not the consumed legacy source.
    expect(await loadDismissals(api, "member")).toEqual({
      [other]: "2026-11-07T10:00:00.123",
    });
  });

  test("serializes concurrent mutations and reads fresh preferences before each write", async () => {
    const s = server(),
      api = s.apiFor();
    await Promise.all([
      setDismissed(api, "member", series, true, now),
      setDismissed(api, "member", other, true, now),
    ]);
    expect(Object.keys(await loadDismissals(api, "member"))).toEqual([
      series,
      other,
    ]);
    expect(s.maxActive()).toBe(1);
    expect(s.requests.map((r) => r.method)).toEqual([
      "get",
      "post",
      "get",
      "post",
      "get",
    ]);
  });

  test("a failed save rejects and can be retried without losing legacy removals", async () => {
    const s = server(),
      api = s.apiFor();
    s.fail(true);
    await expect(loadDismissals(api, "member", [series], now)).rejects.toThrow(
      "network unavailable",
    );
    expect(s.documents.size).toBe(0);
    s.fail(false);
    expect(await loadDismissals(api, "member", [series], now)).toEqual({
      [series]: "2026-11-07T10:00:00.123",
    });
  });

  test("a corrupt server value is not silently replaced by a local list", async () => {
    const s = server(),
      api = s.apiFor();
    s.documents.set("media.example|member", {
      CustomPrefs: { removeNextUp: "broken" },
    });
    await expect(
      loadDismissals(api, "member", [series], now),
    ).rejects.toThrow();
    expect(s.requests.every((r) => r.method === "get")).toBe(true);
  });

  test("keeps accounts and media servers separate", async () => {
    const s = server();
    await setDismissed(s.apiFor(), "member", series, true, now);
    expect(await loadDismissals(s.apiFor(), "another-member")).toEqual({});
    expect(
      await loadDismissals(s.apiFor("https://another.example"), "member"),
    ).toEqual({});
    expect(await loadDismissals(s.apiFor(), "member")).toHaveProperty(series);
  });

  test("restore removes only its series and handles UUID spelling across SDKs", async () => {
    const s = server(),
      api = s.apiFor();
    await loadDismissals(api, "member", [series, other], now);
    await setDismissed(
      api,
      "member",
      "281868FD-6A4B-7A21-BB13-26166A2A08E7",
      false,
    );
    expect(await loadDismissals(api, "member")).toEqual({
      [other]: "2026-11-07T10:00:00.123",
    });
  });

  test("filters resume and next-up episodes while keeping movies and later playback", () => {
    const value = decodeDismissals(encodeDismissals({ [series]: removed }));
    expect(
      isDismissed(
        {
          Type: "Episode",
          SeriesId: series,
          UserData: {
            PlaybackPositionTicks: 1000000,
            LastPlayedDate: "2026-11-05T00:00:00Z",
          },
        },
        value,
      ),
    ).toBe(true);
    expect(
      isDismissed(
        {
          Type: "Episode",
          SeriesId: series,
          UserData: { LastPlayedDate: "2026-11-07T00:00:00Z" },
        },
        value,
      ),
    ).toBe(false);
    expect(isDismissed({ Type: "Movie", Id: series }, value)).toBe(false);
    expect(isDismissed({ Type: "Episode", SeriesId: other }, value)).toBe(
      false,
    );
    expect(seriesKey("281868FD-6A4B-7A21-BB13-26166A2A08E7")).toBe(series);
  });
});
