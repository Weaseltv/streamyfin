import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useAtom } from "jotai";
import type React from "react";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { AddToFavorites } from "@/components/AddToFavorites";
import { HeaderButtonGroup } from "@/components/common/HeaderButton";
import { HeaderIcon } from "@/components/common/HeaderIcon";
import { Image } from "@/components/common/ServerImage";
import { DownloadItems } from "@/components/DownloadItem";
import { ParallaxScrollView } from "@/components/ParallaxPage";
import { NextUp } from "@/components/series/NextUp";
import { SeasonPicker } from "@/components/series/SeasonPicker";
import { SeriesHeader } from "@/components/series/SeriesHeader";
import { TVSeriesPage } from "@/components/series/TVSeriesPage";
import { NeonBoard } from "@/constants/Colors";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { OfflineModeProvider } from "@/providers/OfflineModeProvider";
import { useSetPageAccent } from "@/utils/atoms/pageAccent";
import {
  buildOfflineSeriesFromEpisodes,
  getDownloadedEpisodesForSeries,
} from "@/utils/downloads/offline-series";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { storage } from "@/utils/mmkv";

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

  // Offline data is built from the downloads, so those queries must refetch
  // when a download is added or deleted. Online data never depends on it:
  // keying online queries on the download count minted a new cache entry and
  // a full refetch of every episode each time a download finished.
  const offlineRevision = isOffline ? downloadedItems.length : 0;

  // For offline mode, construct series data from downloaded episodes
  const { data: item } = useQuery({
    queryKey: ["series", seriesId, isOffline, offlineRevision],
    queryFn: async () => {
      if (isOffline) {
        return buildOfflineSeriesFromEpisodes(getDownloadedItems(), seriesId);
      }
      return await getUserItemData({
        api,
        userId: user?.Id,
        itemId: seriesId,
      });
    },
    staleTime: isOffline ? Infinity : 60 * 1000,
    refetchInterval: !isOffline && Platform.isTV ? 60 * 1000 : undefined,
    enabled: isOffline || (!!api && !!user?.Id),
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
    return getBackdropUrl({
      api,
      item,
      quality: 90,
      width: 1000,
    });
  }, [isOffline, base64Image, api, item]);

  useSetPageAccent(NeonBoard.yellow);

  const { data: allEpisodes, isLoading } = useQuery({
    queryKey: ["AllEpisodes", seriesId, isOffline, offlineRevision],
    queryFn: async () => {
      if (isOffline) {
        return getDownloadedEpisodesForSeries(getDownloadedItems(), seriesId);
      }
      if (!api || !user?.Id) return [];

      const res = await getTvShowsApi(api).getEpisodes({
        seriesId: seriesId,
        userId: user.Id,
        enableUserData: true,
        // Lightweight on purpose: this list only feeds counts, the next-up
        // marker and the series download button. MediaSources, MediaStreams,
        // Overview and Trickplay made it 3.6x larger (4.65 MB vs 1.29 MB for
        // a 745-episode show) and nothing here read them. Playback and
        // downloads resolve the full item for the episode they act on.
      });
      return res?.data.Items || [];
    },
    select: (data) =>
      [...(data || [])].sort(
        (a, b) =>
          (a.ParentIndexNumber ?? 0) - (b.ParentIndexNumber ?? 0) ||
          (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0),
      ),
    staleTime: isOffline ? Infinity : 60 * 1000,
    refetchInterval: !isOffline && Platform.isTV ? 60 * 1000 : undefined,
    enabled: isOffline || (!!api && !!user?.Id),
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
          <HeaderButtonGroup>
            <AddToFavorites item={item} />
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

  // For offline mode, we can show the page even without backdropUrl
  if (!item || (!isOffline && !backdropUrl)) return null;

  // TV version
  if (Platform.isTV) {
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
      <ParallaxScrollView
        headerHeight={210}
        overlap={40}
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
      >
        <View className='flex flex-col'>
          <SeriesHeader
            item={item}
            seasons={seasonCount}
            episodes={allEpisodes?.length}
          />
          {!isOffline && <NextUp seriesId={seriesId} />}
          <SeasonPicker
            item={item}
            initialSeasonIndex={Number(seasonIndex)}
            currentEpisodeId={nextUpId}
          />
        </View>
      </ParallaxScrollView>
    </OfflineModeProvider>
  );
};

export default page;
