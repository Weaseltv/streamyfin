import { afterEach, describe, expect, test } from "bun:test";
import { hashKey, onlineManager, QueryClient } from "@tanstack/query-core";
import { PlaybackRefreshQueue } from "./playbackRefresh";
import { seasonEpisodesQueryKey } from "./seasonEpisodes";

const queues: PlaybackRefreshQueue[] = [];
afterEach(() => {
  for (const queue of queues) queue.open();
  queues.length = 0;
  onlineManager.setOnline(true);
});

describe("season episodes query key", () => {
  test("is the show page's original online key", () => {
    // ["episodes", seriesId, seasonId, isOffline, offlineRevision]
    expect(hashKey(seasonEpisodesQueryKey("show", "season-1"))).toBe(
      hashKey(["episodes", "show", "season-1", false, 0]),
    );
  });

  test("the show page and the episode strip name the same entry", () => {
    // The show page builds it from the show and the season it lists, the
    // strip from the episode's SeriesId and SeasonId
    const show = { Id: "show" };
    const season = { Id: "season-1" };
    const episode = { SeriesId: "show", SeasonId: "season-1" };
    expect(hashKey(seasonEpisodesQueryKey(show.Id, season.Id))).toBe(
      hashKey(seasonEpisodesQueryKey(episode.SeriesId, episode.SeasonId)),
    );
  });

  test("is refreshed after playback of an episode of that show only", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const queue = new PlaybackRefreshQueue(client);
    queues.push(queue);
    const watched = seasonEpisodesQueryKey("show", "season-1");
    const sibling = seasonEpisodesQueryKey("show", "season-2");
    const other = seasonEpisodesQueryKey("other-show", "season-1");
    for (const key of [watched, sibling, other]) client.setQueryData(key, []);

    queue.stopped(
      { Id: "episode", SeriesId: "show", SeasonId: "season-1" },
      700,
      Promise.resolve(),
    );
    await queue.flush();

    expect(client.getQueryState(watched)?.isInvalidated).toBe(true);
    expect(client.getQueryState(sibling)?.isInvalidated).toBe(true);
    expect(client.getQueryState(other)?.isInvalidated).toBe(false);
  });

  test("is matched by the played-status invalidation of every episode list", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const key = seasonEpisodesQueryKey("show", "season-1");
    client.setQueryData(key, []);
    await client.invalidateQueries({ queryKey: ["episodes"] });
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });
});
