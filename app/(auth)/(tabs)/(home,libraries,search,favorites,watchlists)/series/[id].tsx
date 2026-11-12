import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useAtom } from "jotai";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { HeaderButtonGroup } from "@/components/common/HeaderButton";
import { HeaderIcon } from "@/components/common/HeaderIcon";
import { Image } from "@/components/common/ServerImage";
import { DownloadItems } from "@/components/DownloadItem";
import {
  SeriesButtonsPending,
  TitleDetailsFailed,
} from "@/components/item/TitleDetailsPending";
import { SimilarItems } from "@/components/SimilarItems";
import { NextUp } from "@/components/series/NextUp";
import { SeasonPicker } from "@/components/series/SeasonPicker";
import { SeriesButtons } from "@/components/series/SeriesButtons";
import { SeriesHeader } from "@/components/series/SeriesHeader";
import { TVSeriesPage } from "@/components/series/TVSeriesPage";
import { NeonBoard } from "@/constants/Colors";
import { useSeriesSeasons } from "@/hooks/useSeriesSeasons";
import { useTappedCard } from "@/hooks/useTappedCard";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { OfflineModeProvider } from "@/providers/OfflineModeProvider";
import { useSetPageAccent } from "@/utils/atoms/pageAccent";
import {
  buildOfflineSeriesFromEpisodes,
  getDownloadedEpisodesForSeries,
} from "@/utils/downloads/offline-series";
import { countEpisodes } from "@/utils/episodes";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { storage } from "@/utils/mmkv";
import { useNavTimingStage } from "@/utils/navTiming";
import { phoneSignal } from "@/utils/query/phoneSignal";
import { titleDetailsState } from "@/utils/tappedCard";
import { seriesBackdropUrl } from "@/utils/titlePageArtwork";

const sortEpisodeSummary = (data: BaseItemDto[] | undefined) =>
  [...(data ?? [])].sort(
    (a, b) =>
      (a.ParentIndexNumber ?? 0) - (b.ParentIndexNumber ?? 0) ||
      (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0),
  );

const page: React.FC = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const {
    id: seriesId,
    seasonIndex,
    offline: offlineParam,
  } = params as {
    id: string;
    seasonIndex: string;
    offline?: string;
  };

  const isOffline = offlineParam === "true";

  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { getDownloadedItems, downloadedItems } = useDownload();
  const queryClient = useQueryClient();

  // Offline data is built from the downloads, so those queries must refetch
  // when a download is added or deleted. Online data never depends on it:
  // keying online queries on the download count minted a new cache entry and
  // a full refetch of every episode each time a download finished.
  const offlineRevision = isOffline ? downloadedItems.length : 0;

  // For offline mode, construct series data from downloaded episodes
  const {
    data: item,
    status,
    fetchStatus,
    refetch,
  } = useQuery({
    queryKey: ["series", seriesId, isOffline, offlineRevision],
    queryFn: async (context) => {
      if (isOffline) {
        return buildOfflineSeriesFromEpisodes(getDownloadedItems(), seriesId);
      }
      return await getUserItemData({
        api,
        userId: user?.Id,
        itemId: seriesId,
        // Leaving the page before the show arrives cancels the request
        signal: phoneSignal(context, Platform.isTV),
      });
    },
    staleTime: isOffline ? Infinity : 60 * 1000,
    refetchInterval: !isOffline && Platform.isTV ? 60 * 1000 : undefined,
    enabled: isOffline || (!!api && !!user?.Id),
  });

  // Phones, online: opened by a tap on the show's card, the page draws that
  // card's title, artwork and year until `item` arrives. `item` is only ever
  // what the server sent (or, offline, what the downloads hold). `shown` is
  // for drawing; every action and everything below the title reads `item`.
  const card = useTappedCard("series", seriesId, !Platform.isTV && !isOffline);
  const shown = item ?? card;
  const detailsFailed =
    !item &&
    !!card &&
    titleDetailsState({ details: item, status, fetchStatus }) === "failed";
  // Retry asks again for the show and for whichever of its other requests
  // (seasons, episodes) failed along with it
  const retryDetails = useCallback(() => {
    void refetch();
    void queryClient.refetchQueries({
      predicate: (query) =>
        query.queryKey[0] !== "series" &&
        query.queryKey[1] === seriesId &&
        query.state.status === "error",
    });
  }, [refetch, queryClient, seriesId]);

  // The season list needs only the show's id. Asked for here, it travels
  // with the show instead of starting once the show has arrived; the season
  // picker reads this same request.
  useSeriesSeasons(seriesId, isOffline, {
    enabled: !Platform.isTV,
    silent: true,
  });

  // For offline mode, use stored base64 image
  const base64Image = useMemo(() => {
    if (isOffline) {
      return storage.getString(seriesId);
    }
    return null;
  }, [isOffline, seriesId]);

  const backdropUrl = useMemo(() => {
    if (isOffline && base64Image) {
      return `data:image/jpeg;base64,${base64Image}`;
    }
    // The address a card's tap has already started downloading
    if (item) return seriesBackdropUrl(api, item);
    // From the card only when it names the backdrop; without one the top
    // stays empty until the show says which picture goes there
    return card?.BackdropImageTags?.[0] ? seriesBackdropUrl(api, card) : null;
  }, [isOffline, base64Image, api, item, card]);

  useSetPageAccent(NeonBoard.show);

  // On phones the whole-show list waits for the season on screen. It is the
  // largest request on the page and only feeds the counts, the next-up marker
  // and the series download button, so it should not take a connection, or
  // the time to read it, from the episodes the viewer is waiting to see. The
  // season picker reports when its season is drawn (or cannot be). A list
  // already in the cache is shown at once either way. Offline it is read
  // from the downloads, and the TV page draws its seasons from it.
  const [seasonShownFor, setSeasonShownFor] = useState<string | null>(null);
  const onSeasonShown = useCallback(
    () => setSeasonShownFor(seriesId),
    [seriesId],
  );
  const waitsForSeason = !isOffline && !Platform.isTV;

  const { data: allEpisodes, isLoading } = useQuery({
    queryKey: ["AllEpisodes", seriesId, isOffline, offlineRevision],
    queryFn: async (context) => {
      if (isOffline) {
        return getDownloadedEpisodesForSeries(getDownloadedItems(), seriesId);
      }
      if (!api || !user?.Id) return [];

      const request = {
        seriesId: seriesId,
        userId: user.Id,
        enableUserData: true,
        // Lightweight on purpose: this list only feeds counts, the next-up
        // marker and the series download button. MediaSources, MediaStreams,
        // Overview and Trickplay made it 3.6x larger (4.65 MB vs 1.29 MB for
        // a 745-episode show) and nothing here read them. Playback and
        // downloads resolve the full item for the episode they act on.
        //
        // Phones also leave out the artwork tags and blur hashes, half of
        // what is left (1,555 KB vs 756 KB for an 807-episode show): the
        // phone page draws no picture from this list. The TV page hands the
        // list to its shuffle queue, so it keeps them.
        enableImages: Platform.isTV ? undefined : false,
      };
      const res = await getTvShowsApi(api).getEpisodes(request, {
        signal: phoneSignal(context, Platform.isTV),
      });
      return res?.data.Items || [];
    },
    select: sortEpisodeSummary,
    staleTime: isOffline ? Infinity : 60 * 1000,
    refetchInterval: !isOffline && Platform.isTV ? 60 * 1000 : undefined,
    enabled:
      (isOffline || (!!api && !!user?.Id)) &&
      (!waitsForSeason || seasonShownFor === seriesId),
  });

  const seasonCount = useMemo(
    () => new Set((allEpisodes ?? []).map((e) => e.ParentIndexNumber)).size,
    [allEpisodes],
  );
  // The next unplayed episode carries the tally in the season list.
  const nextUpId = useMemo(
    () =>
      (allEpisodes ?? []).find(
        (e) =>
          !e.UserData?.Played || (e.UserData?.PlaybackPositionTicks ?? 0) > 0,
      )?.Id ?? null,
    [allEpisodes],
  );

  useEffect(() => {
    // Don't show header buttons in offline mode
    if (isOffline) {
      navigation.setOptions({
        headerRight: () => null,
      });
      return;
    }

    navigation.setOptions({
      headerRight: () =>
        !isLoading && item && allEpisodes && allEpisodes.length > 0 ? (
          // ADD TO WATCHLIST is one of the page's buttons now, as on the TV
          <HeaderButtonGroup>
            {!Platform.isTV && (
              <DownloadItems
                size='large'
                title={t("item_card.download.download_series")}
                items={allEpisodes}
                MissingDownloadIconComponent={({ active }) => (
                  <HeaderIcon
                    name='downloads'
                    tintColor={active ? NeonBoard.text : NeonBoard.mid}
                  />
                )}
                DownloadedIconComponent={() => (
                  <HeaderIcon name='downloaded' tintColor={NeonBoard.green} />
                )}
              />
            )}
          </HeaderButtonGroup>
        ) : null,
    });
  }, [allEpisodes, isLoading, item, isOffline]);

  useNavTimingStage(
    "series",
    seriesId,
    "content",
    !!shown && !(item && !isOffline && !backdropUrl),
  );

  // For offline mode, we can show the page even without backdropUrl
  // (and a card may open the page before its backdrop is known)
  if (!shown || (item && !isOffline && !backdropUrl)) return null;

  // TV version
  if (Platform.isTV) {
    if (!item) return null;
    return (
      <OfflineModeProvider isOffline={isOffline}>
        <TVSeriesPage
          item={item}
          allEpisodes={allEpisodes}
          isLoading={isLoading}
        />
      </OfflineModeProvider>
    );
  }

  return (
    <OfflineModeProvider isOffline={isOffline}>
      <SeasonPicker
        item={shown}
        initialSeasonIndex={Number(seasonIndex)}
        currentEpisodeId={nextUpId}
        onSeasonShown={onSeasonShown}
        headerImage={
          backdropUrl ? (
            <Image
              source={{
                uri: backdropUrl,
              }}
              style={{
                width: "100%",
                height: "100%",
              }}
            />
          ) : (
            <View
              style={{
                width: "100%",
                height: "100%",
                backgroundColor: NeonBoard.card,
              }}
            />
          )
        }
        pageHeader={
          <View className='flex flex-col'>
            <SeriesHeader
              item={shown}
              seasons={seasonCount}
              episodes={countEpisodes(allEpisodes)}
            />
            {!item &&
              (detailsFailed ? (
                <TitleDetailsFailed
                  onRetry={retryDetails}
                  retrying={fetchStatus === "fetching"}
                />
              ) : (
                <SeriesButtonsPending />
              ))}
            {!isOffline && item && <SeriesButtons item={item} />}
            {!isOffline && item && <NextUp seriesId={seriesId} />}
          </View>
        }
        pageFooter={
          isOffline || !item ? null : (
            <SimilarItems
              itemId={seriesId}
              accent={NeonBoard.show}
              style={{ marginTop: 16 }}
            />
          )
        }
      />
    </OfflineModeProvider>
  );
};

export default page;
