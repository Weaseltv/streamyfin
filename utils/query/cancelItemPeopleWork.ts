import type { QueryClient } from "@tanstack/react-query";

/** Cancellation runs in the navigation callback, independently of React freezing. */
export function cancelItemPeopleWork(
  queryClient: QueryClient,
  itemId: string | null | undefined,
) {
  if (!itemId) return Promise.resolve();
  return Promise.all([
    queryClient.cancelQueries({
      queryKey: ["item", itemId, "people"],
      exact: true,
    }),
    queryClient.cancelQueries({
      queryKey: ["actor", "movies"],
      predicate: (query) => query.queryKey[3] === itemId,
    }),
  ]);
}
