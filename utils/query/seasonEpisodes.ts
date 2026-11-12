import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";

/**
 * One season's episodes from the server, as the show page lists them and the
 * episode page's strip draws them. Both read this one cache entry, so an
 * episode opened from its show draws the strip without asking again.
 *
 * The shape is the show page's original one and must stay: the refresh after
 * playback finds a show's lists by `["episodes", seriesId, ...]`
 * (`utils/query/playbackRefresh.ts`), and marking played invalidates
 * `["episodes"]`. The trailing `false, 0` are the online values of the
 * show page's offline flag and downloads revision.
 */
export const seasonEpisodesQueryKey = (
  seriesId: string | null | undefined,
  seasonId: string | null | undefined,
) => ["episodes", seriesId, seasonId, false, 0] as const;

/**
 * Lightweight on purpose: rows and cards show title, runtime and progress.
 * The download sheet fetches the full episode when it is opened and playback
 * resolves its own media source, so MediaSources, MediaStreams, Overview and
 * Trickplay (3.6x the payload) stay out.
 */
export async function fetchSeasonEpisodes({
  api,
  userId,
  seriesId,
  seasonId,
}: {
  api: Api;
  userId: string;
  seriesId: string;
  seasonId: string;
}): Promise<BaseItemDto[]> {
  const res = await getTvShowsApi(api).getEpisodes({
    seriesId,
    userId,
    seasonId,
    enableUserData: true,
  });

  if (res.data.TotalRecordCount === 0)
    console.warn("No episodes found for season with ID ~", seasonId);

  return res.data.Items ?? [];
}
