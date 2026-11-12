import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useStore } from "jotai";
import { type PropsWithChildren, useCallback } from "react";
import {
  Platform,
  TouchableOpacity,
  type TouchableOpacityProps,
} from "react-native";
import useRouter from "@/hooks/useAppRouter";
import { useItemNavigationOrigin } from "@/providers/ItemNavigationProvider";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { markNavTap } from "@/utils/navTiming";
import { holdTappedCard } from "@/utils/tappedCard";
import { titlePageArtworkUris } from "@/utils/titlePageArtwork";
import { useRequestItemActions } from "./ItemActionSheetHost";
import { prefetchServerImage } from "./ServerImage";

interface Props extends TouchableOpacityProps {
  item: BaseItemDto;
}

export const itemRouter = (item: BaseItemDto, from: string) => {
  if ("CollectionType" in item && item.CollectionType === "livetv") {
    return `/(auth)/(tabs)/${from}/livetv`;
  }

  if (item.Type === "Series") {
    return `/(auth)/(tabs)/${from}/series/${item.Id}`;
  }

  // A season opens its series at that season
  if (item.Type === "Season" && item.SeriesId) {
    return `/(auth)/(tabs)/${from}/series/${item.SeriesId}?seasonIndex=${item.IndexNumber ?? ""}`;
  }

  if (item.Type === "Person") {
    return `/(auth)/(tabs)/${from}/persons/${item.Id}`;
  }

  if (item.Type === "BoxSet") {
    return `/(auth)/(tabs)/${from}/collections/${item.Id}`;
  }

  if (item.Type === "UserView") {
    return `/(auth)/(tabs)/${from}/collections/${item.Id}`;
  }

  if (item.Type === "CollectionFolder") {
    return `/(auth)/(tabs)/(libraries)/${item.Id}`;
  }

  if (item.Type === "Playlist") {
    return `/(auth)/(tabs)/(libraries)/${item.Id}`;
  }

  return `/(auth)/(tabs)/${from}/items/page?id=${item.Id}`;
};

export const getItemNavigation = (item: BaseItemDto, _from: string) => {
  if ("CollectionType" in item && item.CollectionType === "livetv") {
    return {
      pathname: "/livetv" as const,
    };
  }

  if (item.Type === "Series") {
    return {
      pathname: "/series/[id]" as const,
      params: { id: item.Id! },
    };
  }

  // A season opens its series at that season
  if (item.Type === "Season" && item.SeriesId) {
    return {
      pathname: "/series/[id]" as const,
      params: {
        id: item.SeriesId,
        seasonIndex: String(item.IndexNumber ?? ""),
      },
    };
  }

  if (item.Type === "Person") {
    return {
      pathname: "/persons/[personId]" as const,
      params: { personId: item.Id! },
    };
  }

  if (item.Type === "BoxSet" || item.Type === "UserView") {
    return {
      pathname: "/collections/[collectionId]" as const,
      params: { collectionId: item.Id! },
    };
  }

  if (item.Type === "CollectionFolder") {
    return {
      pathname: "/[libraryId]" as const,
      params: { libraryId: item.Id! },
    };
  }

  // A playlist opens as a grid of what it holds, like a library
  if (item.Type === "Playlist") {
    return {
      pathname: "/[libraryId]" as const,
      params: { libraryId: item.Id! },
    };
  }

  // Default case - items page
  return {
    pathname: "/items/page" as const,
    params: { id: item.Id! },
  };
};

export const TouchableItemRouter: React.FC<PropsWithChildren<Props>> = ({
  item,
  children,
  ...props
}) => {
  const router = useRouter();
  const isOffline = useOfflineMode();
  const requestActions = useRequestItemActions();
  const from = useItemNavigationOrigin();
  // Read when pressed: a card must not re-render for the session's sake
  const store = useStore();

  const handlePress = useCallback(() => {
    const navigation = getItemNavigation(item, from);
    markNavTap(navigation);
    // Phones, online: the opened page may draw from this card until its own
    // details arrive. The card is kept in memory beside the navigation, which
    // only gains a `card` parameter naming the tapped item.
    const card = isOffline || Platform.isTV ? undefined : holdTappedCard(item);
    router.push(
      (card && "params" in navigation
        ? { ...navigation, params: { ...navigation.params, card } }
        : navigation) as any,
    );

    // Start the opened page's top artwork now instead of when the page has
    // mounted and fetched its details. After the push and never awaited, so
    // the page change does not wait for it.
    if (isOffline || Platform.isTV) return;
    const api = store.get(apiAtom);
    if (!api) return;
    for (const uri of titlePageArtworkUris(api, item)) {
      void prefetchServerImage(uri, api.basePath).catch(() => undefined);
    }
  }, [from, item, router, isOffline, store]);

  const showActionSheet = useCallback(() => {
    if (["Movie", "Episode", "Series", "Season"].includes(item.Type ?? "")) {
      requestActions({ item, isOffline });
    }
  }, [item, isOffline, requestActions]);

  if (
    from === "(home)" ||
    from === "(search)" ||
    from === "(libraries)" ||
    from === "(favorites)" ||
    from === "(watchlists)"
  )
    return (
      <TouchableOpacity
        // A card dims only once a finger has rested on it for 150 ms, the
        // wait iOS itself uses inside scrolling lists. A swipe that starts on
        // a card moves sooner than that, so scrolling no longer flashes the
        // card under the finger. A tap still dims it and opens at once, and
        // the long-press menu still appears after the usual half second.
        delayPressIn={150}
        onLongPress={showActionSheet}
        onPress={handlePress}
        {...props}
      >
        {children}
      </TouchableOpacity>
    );

  return null;
};
