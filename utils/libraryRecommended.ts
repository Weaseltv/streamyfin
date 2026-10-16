import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { shuffle } from "./shuffle";

/**
 * The Movies and TV Shows libraries' Recommended rows, as on WeaselPlex TV
 * (`RecommendedMovie.kt`, `RecommendedTvShow.kt`, `SuggestionsWorker.kt`).
 * TV Shows list episodes in Just Released and Just Added, as the TV does.
 */
const ROW_SIZE = 25;
const FIELDS = ["PrimaryImageAspectRatio"] as const;

type Library = { id: string; movies: boolean };

/** Newest releases up to today. */
export async function loadJustReleased(
  api: Api,
  userId: string,
  library: Library,
  signal?: AbortSignal,
): Promise<BaseItemDto[]> {
  const response = await getItemsApi(api).getItems(
    {
      userId,
      parentId: library.id,
      recursive: true,
      includeItemTypes: [library.movies ? "Movie" : "Episode"],
      sortBy: library.movies
        ? ["PremiereDate", "SortName"]
        : ["PremiereDate", "SeriesSortName", "AiredEpisodeOrder"],
      sortOrder: library.movies
        ? ["Descending", "Ascending"]
        : ["Descending", "Ascending", "Descending"],
      maxPremiereDate: new Date().toISOString(),
      ...(library.movies ? {} : { isUnaired: false }),
      fields: [...FIELDS],
      limit: ROW_SIZE,
      enableTotalRecordCount: false,
    },
    { signal },
  );
  return response.data.Items ?? [];
}

/** Newest additions to the library. */
export async function loadJustAdded(
  api: Api,
  userId: string,
  library: Library,
  signal?: AbortSignal,
): Promise<BaseItemDto[]> {
  const response = await getItemsApi(api).getItems(
    {
      userId,
      parentId: library.id,
      recursive: true,
      includeItemTypes: [library.movies ? "Movie" : "Episode"],
      sortBy: ["DateCreated"],
      sortOrder: ["Descending"],
      fields: [...FIELDS],
      limit: ROW_SIZE,
      enableTotalRecordCount: false,
    },
    { signal },
  );
  return response.data.Items ?? [];
}

/**
 * Your Suggestions, as the TV works it out: seeded by the last 3 titles you
 * watched, 40 % random unwatched titles in their genres, 30 % the newest
 * unwatched and 30 % random unwatched; without the seeds, shuffled, 25.
 */
export async function loadSuggestions(
  api: Api,
  userId: string,
  library: Library,
  signal?: AbortSignal,
): Promise<BaseItemDto[]> {
  const items = getItemsApi(api);
  const type = library.movies ? "Movie" : "Series";
  const watched = await items.getItems(
    {
      userId,
      parentId: library.id,
      recursive: true,
      includeItemTypes: [library.movies ? "Movie" : "Episode"],
      filters: ["IsPlayed"],
      sortBy: ["DatePlayed"],
      sortOrder: ["Descending"],
      fields: ["Genres"],
      limit: 30,
      enableTotalRecordCount: false,
    },
    { signal },
  );
  const seedIds: string[] = [];
  for (const item of watched.data.Items ?? []) {
    const id = library.movies ? item.Id : item.SeriesId;
    if (id && !seedIds.includes(id)) seedIds.push(id);
    if (seedIds.length === 3) break;
  }
  let genres: string[] = [];
  if (seedIds.length > 0) {
    const seeds = library.movies
      ? (watched.data.Items ?? []).filter((item) =>
          seedIds.includes(item.Id ?? ""),
        )
      : ((
          await items.getItems(
            { userId, ids: seedIds, fields: ["Genres"] },
            { signal },
          )
        ).data.Items ?? []);
    genres = [...new Set(seeds.flatMap((seed) => seed.Genres ?? []))];
  }
  const unwatched = (extra: object, limit: number) =>
    items
      .getItems(
        {
          userId,
          parentId: library.id,
          recursive: true,
          includeItemTypes: [type],
          isPlayed: false,
          fields: [...FIELDS],
          limit,
          enableTotalRecordCount: false,
          ...extra,
        },
        { signal },
      )
      .then((response) => response.data.Items ?? []);
  const [inGenres, newest, random] = await Promise.all([
    genres.length > 0
      ? unwatched({ genres, sortBy: ["Random"] }, 10)
      : Promise.resolve([] as BaseItemDto[]),
    unwatched({ sortBy: ["DateCreated"], sortOrder: ["Descending"] }, 8),
    unwatched({ sortBy: ["Random"] }, 7),
  ]);
  const seen = new Set<string>(seedIds);
  const picked: BaseItemDto[] = [];
  for (const item of [...inGenres, ...newest, ...random]) {
    if (!item.Id || seen.has(item.Id)) continue;
    seen.add(item.Id);
    picked.push(item);
  }
  return shuffle(picked).slice(0, ROW_SIZE);
}
