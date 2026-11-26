import type {
  BaseItemDto,
  BaseItemDtoQueryResult,
} from "@jellyfin/sdk/lib/generated-client/models";

export function kidResumeTicks(item: BaseItemDto): number {
  const position = item.UserData?.PlaybackPositionTicks ?? 0;
  const runtime = item.RunTimeTicks ?? 0;
  return position > 0 && (runtime <= 0 || position < runtime) ? position : 0;
}

export const isPlayableKidEpisode = (item: BaseItemDto) =>
  item.Type === "Episode" && !!item.Id && item.LocationType !== "Virtual";

export function pickKidNextEpisode(episodes: BaseItemDto[]) {
  const playable = episodes.filter(isPlayableKidEpisode);
  const regular = playable.filter((item) => (item.ParentIndexNumber ?? 1) > 0);
  const pool = regular.length ? regular : playable;
  const toWatch = (item: BaseItemDto) =>
    item.UserData?.Played !== true || kidResumeTicks(item) > 0;
  const lastWatched = pool.findLastIndex(
    (item) => item.UserData?.Played === true,
  );
  return (
    pool.slice(lastWatched + 1).find(toWatch) ?? pool.find(toWatch) ?? pool[0]
  );
}

export async function loadKidEpisodes(
  loadPage: (
    startIndex: number,
    limit: number,
  ) => Promise<BaseItemDtoQueryResult>,
) {
  const episodes: BaseItemDto[] = [];
  const limit = 100;
  // A short or empty page can still have more episodes after the kid filter.
  for (let startIndex = 0; startIndex < 20_000; startIndex += limit) {
    const { Items, TotalRecordCount } = await loadPage(startIndex, limit);
    const page = Items ?? [];
    episodes.push(...page);
    if (
      TotalRecordCount == null
        ? !page.length
        : TotalRecordCount <= startIndex + page.length
    )
      break;
  }
  return episodes;
}
