import type { Api } from "@jellyfin/sdk";
import { getUserViewsApi } from "@jellyfin/sdk/lib/utils/api";
import { queryOptions } from "@tanstack/react-query";

/**
 * The member's libraries. Home asks for them at every launch and they are
 * always in the saved cache, so every other screen that needs the list reads
 * this one query rather than asking again under a name of its own.
 */
export function userViewsQuery(api: Api | null, userId: string | undefined) {
  return queryOptions({
    queryKey: ["home", "userViews", userId],
    queryFn: async () => {
      if (!api || !userId) return null;
      const response = await getUserViewsApi(api).getUserViews({ userId });
      return response.data.Items || null;
    },
    enabled: !!api && !!userId,
  });
}
