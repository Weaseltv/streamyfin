import { describe, expect, test } from "bun:test";
import { Jellyfin } from "@jellyfin/sdk";
import axios, { type AxiosRequestConfig } from "axios";
import { loadJustWatchLists, loadRankedItems } from "./justWatchLists";

const id = (n: number) => n.toString(16).padStart(32, "0");

function server(respond: (url: URL) => unknown) {
  const requests: URL[] = [];
  const client = axios.create({
    adapter: async (config) => {
      const url = new URL(axios.getUri(config as AxiosRequestConfig));
      requests.push(url);
      return {
        data: respond(url),
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    },
  });
  const jellyfin = new Jellyfin({
    clientInfo: { name: "WeaselPlex", version: "test" },
    deviceInfo: { name: "test", id: "test" },
  });
  return {
    api: jellyfin.createApi("https://jellyfin.example", "test-token", client),
    requests,
  };
}

describe("the server's JustWatch lists", () => {
  test("reads the member's lists from display preferences, as the TV does", async () => {
    const { api, requests } = server(() => ({
      Id: "justwatch-home",
      CustomPrefs: {
        movie_chart: `${id(1)},${id(2)}`,
        top_10_shows: "",
        updated: "2026-10-16T13:23:14Z",
        tvhome: "",
      },
    }));
    const lists = await loadJustWatchLists(api, "member", "justwatch-home");
    expect(lists.movie_chart).toEqual([id(1), id(2)]);
    expect(lists.top_10_shows).toEqual([]);
    expect(lists.updated).toBeUndefined();
    const url = requests[0];
    expect(url.pathname).toBe("/DisplayPreferences/justwatch-home");
    expect(url.searchParams.get("userId")).toBe("member");
    expect(url.searchParams.get("client")).toBe("WeaselPlex");
  });

  test("fetches the items in chunks, as the member, and keeps the ranked order", async () => {
    const ids = Array.from({ length: 120 }, (_, i) => id(i + 1));
    const { api, requests } = server((url) => ({
      // The server answers in its own order and leaves out what the member can't see
      Items: url.searchParams
        .getAll("ids")
        .flatMap((v) => v.split(","))
        .filter((v) => v !== id(2))
        .reverse()
        .map((v) => ({ Id: v, Name: v })),
    }));
    const items = await loadRankedItems(api, "member", ids, 10);
    expect(items.map((item) => item.Id)).toEqual([id(1), ...ids.slice(2, 11)]);
    expect(requests).toHaveLength(3);
    for (const url of requests) {
      expect(url.searchParams.get("userId")).toBe("member");
    }
    expect(await loadRankedItems(api, "member", [], 10)).toEqual([]);
  });
});
