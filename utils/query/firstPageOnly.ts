import type { QueryClient, QueryKey } from "@tanstack/react-query";

type Paged = { pages?: unknown[]; pageParams?: unknown[] } | undefined;

/**
 * True while a paged list holds at most one page, so refreshing it is a single
 * request. A refresh of a paged list replays every page it has loaded, one
 * after another, and nothing more can be loaded until that finishes.
 */
export function holdsSinglePage(data: unknown) {
  const pages = (data as Paged)?.pages;
  return !Array.isArray(pages) || pages.length <= 1;
}

/**
 * Keep only the first page of every paged list under `queryKey`. The list's
 * age and its marked-for-refresh state are left as they were, so trimming
 * never makes old titles look fresh.
 */
export function trimToFirstPage(queryClient: QueryClient, queryKey: QueryKey) {
  for (const query of queryClient.getQueryCache().findAll({ queryKey })) {
    const data = query.state.data as Paged;
    if (
      !Array.isArray(data?.pages) ||
      !Array.isArray(data.pageParams) ||
      data.pages.length <= 1
    )
      continue;
    const { dataUpdatedAt, isInvalidated } = query.state;
    queryClient.setQueryData(
      query.queryKey,
      {
        ...data,
        pages: data.pages.slice(0, 1),
        pageParams: data.pageParams.slice(0, 1),
      },
      { updatedAt: dataUpdatedAt },
    );
    if (isInvalidated) query.invalidate();
  }
}
