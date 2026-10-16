import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  BaseItemKind,
  ItemFilter,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";

/**
 * One random title for a page's RANDOM button, as on WeaselPlex TV: the server
 * picks it (`sortBy=Random`, `limit=1`) with the page's own filters, so it can
 * be any title on the page, loaded or not. The page then opens it; RANDOM never
 * starts playback.
 */
export async function loadRandomItem(
  api: Api,
  query: {
    userId: string;
    parentId?: string;
    recursive?: boolean;
    includeItemTypes?: BaseItemKind[];
    genres?: string[];
    tags?: string[];
    years?: number[];
    filters?: ItemFilter[];
    isFavorite?: boolean;
    searchTerm?: string;
  },
): Promise<BaseItemDto | undefined> {
  const response = await getItemsApi(api).getItems({
    ...query,
    sortBy: ["Random"],
    limit: 1,
    enableTotalRecordCount: false,
  });
  return response.data.Items?.[0];
}
