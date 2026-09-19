import { infiniteQueryOptions } from "@tanstack/react-query";
import type { AxiosInstance } from "axios";
import { uniqBy } from "lodash";
import type { Results } from "@/utils/jellyseerr/server/models/Search";

export interface RequestSearchParams {
  query: string;
  page: number;
}

export interface RequestSearchResults {
  page: number;
  totalPages: number;
  totalResults: number;
  results: Results[];
}

export const REQUEST_SEARCH_TIMEOUT_MS = 15_000;

export async function fetchRequestSearchPage(
  client: AxiosInstance,
  params: RequestSearchParams,
  signal?: AbortSignal,
): Promise<RequestSearchResults> {
  const { data } = await client.get<RequestSearchResults>("/api/v1/search", {
    // Axios encodes params. Treating a title as URLSearchParams changes the
    // actual search text ("dragon" becomes "dragon=", spaces become "+").
    params: { ...params, query: params.query.trim() },
    signal,
    timeout: REQUEST_SEARCH_TIMEOUT_MS,
  });
  return data;
}

export function requestSearchOptions(
  client: AxiosInstance | undefined,
  searchQuery: string,
  userId?: number,
) {
  const query = searchQuery.trim();
  return infiniteQueryOptions({
    queryKey: [
      "search",
      "jellyseerr",
      "pages",
      client?.defaults.baseURL,
      userId,
      query,
    ],
    queryFn: ({ pageParam, signal }) => {
      if (!client) throw new Error("Request server is not connected");
      return fetchRequestSearchPage(client, { query, page: pageParam }, signal);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    enabled: !!client && query.length > 0,
    staleTime: 2 * 60_000,
    gcTime: 5 * 60_000,
    // A stalled search must offer Retry, not silently repeat a long timeout.
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function requestSearchResults(pages: RequestSearchResults[] = []) {
  return uniqBy(
    pages.flatMap((page) => page.results),
    (result) => `${result.mediaType}:${result.id}`,
  );
}
