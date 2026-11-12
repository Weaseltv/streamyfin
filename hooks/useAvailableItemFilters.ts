import { getFilterApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { Freshness } from "@/constants/queryFreshness";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

/** Genre, year and tag chips share one user/parent-scoped response. */
export const useAvailableItemFilters = (parentId: string, enabled = true) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  return useQuery({
    queryKey: ["filters", "available", api?.basePath, user?.Id, parentId],
    queryFn: async ({ signal }) => {
      const response = await getFilterApi(api!).getQueryFiltersLegacy(
        { userId: user?.Id, parentId },
        { signal },
      );
      return { ...response.data, Years: response.data.Years?.map(String) };
    },
    staleTime: Freshness.catalog,
    enabled: enabled && !!api && !!user?.Id && !!parentId,
  });
};
