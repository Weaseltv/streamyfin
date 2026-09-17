import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { atom, useAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { Chip } from "@/components/common/Chip";
import { HeaderIcon } from "@/components/common/HeaderIcon";
import { LoadingLine } from "@/components/common/LoadingLine";
import { SectionHeader } from "@/components/common/SectionHeader";
import { EpisodeRow } from "@/components/series/EpisodeRow";
import type { SeasonIndexState } from "@/components/series/SeasonDropdown";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import {
  buildOfflineSeasons,
  getDownloadedEpisodesForSeason,
} from "@/utils/downloads/offline-series";
import { Text } from "../common/Text";
import { DownloadItems, DownloadSingleItem } from "../DownloadItem";
import { PlayedStatus } from "../PlayedStatus";

type Props = {
  item: BaseItemDto;
  initialSeasonIndex?: number;
  /** The episode that carries the tally (next up). */
  currentEpisodeId?: string | null;
};

export const seasonIndexAtom = atom<SeasonIndexState>({});

export const SeasonPicker: React.FC<Props> = ({
  item,
  initialSeasonIndex,
  currentEpisodeId,
}) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const [seasonIndexState, setSeasonIndexState] = useAtom(seasonIndexAtom);
  const { t } = useTranslation();
  const isOffline = useOfflineMode();
  const { getDownloadedItems, downloadedItems } = useDownload();

  const seasonIndex = useMemo(
    () => seasonIndexState[item.Id ?? ""],
    [item, seasonIndexState],
  );

  const { data: seasons } = useQuery({
    queryKey: ["seasons", item.Id, isOffline, downloadedItems.length],
    queryFn: async () => {
      if (isOffline) {
        return buildOfflineSeasons(getDownloadedItems(), item.Id!);
      }

      if (!api || !user?.Id || !item.Id) return [];
      const response = await api.axiosInstance.get(
        `${api.basePath}/Shows/${item.Id}/Seasons`,
        {
          params: {
            userId: user?.Id,
            itemId: item.Id,
            Fields:
              "ItemCounts,PrimaryImageAspectRatio,CanDelete,MediaSourceCount",
          },
          headers: {
            Authorization: `MediaBrowser DeviceId="${api.deviceInfo.id}", Token="${api.accessToken}"`,
          },
        },
      );

      return response.data.Items;
    },
    staleTime: isOffline ? Infinity : 60,
    enabled: isOffline || (!!api && !!user?.Id && !!item.Id),
  });

  const selectedSeasonId: string | null = useMemo(() => {
    const season: BaseItemDto = seasons?.find(
      (s: BaseItemDto) =>
        s.IndexNumber === seasonIndex || s.Name === seasonIndex,
    );

    if (!season?.Id) return null;

    return season.Id!;
  }, [seasons, seasonIndex]);

  // For offline mode, we use season index number instead of ID
  const selectedSeasonNumber = useMemo(() => {
    if (!isOffline) return null;
    const season = seasons?.find(
      (s: BaseItemDto) =>
        s.IndexNumber === seasonIndex || s.Name === seasonIndex,
    );
    return season?.IndexNumber ?? null;
  }, [isOffline, seasons, seasonIndex]);

  const { data: episodes, isPending } = useQuery({
    queryKey: [
      "episodes",
      item.Id,
      isOffline ? selectedSeasonNumber : selectedSeasonId,
      isOffline,
      downloadedItems.length,
    ],
    queryFn: async () => {
      if (isOffline) {
        return getDownloadedEpisodesForSeason(
          getDownloadedItems(),
          item.Id!,
          selectedSeasonNumber!,
        );
      }

      if (!api || !user?.Id || !item.Id || !selectedSeasonId) {
        return [];
      }

      const res = await getTvShowsApi(api).getEpisodes({
        seriesId: item.Id,
        userId: user.Id,
        seasonId: selectedSeasonId,
        enableUserData: true,
        fields: ["MediaSources", "MediaStreams", "Overview", "Trickplay"],
      });

      if (res.data.TotalRecordCount === 0)
        console.warn(
          "No episodes found for season with ID ~",
          selectedSeasonId,
        );

      return res.data.Items;
    },
    staleTime: isOffline ? Infinity : 0,
    enabled: isOffline
      ? !!item.Id && selectedSeasonNumber !== null
      : !!api && !!user?.Id && !!item.Id && !!selectedSeasonId,
  });

  // Used for height calculation
  const [nrOfEpisodes, setNrOfEpisodes] = useState(0);
  useEffect(() => {
    if (episodes && episodes.length > 0) {
      setNrOfEpisodes(episodes.length);
    }
  }, [episodes]);

  const sortedSeasons: BaseItemDto[] = useMemo(
    () =>
      [...(seasons ?? [])].sort(
        (a: BaseItemDto, b: BaseItemDto) =>
          Number(a.IndexNumber) - Number(b.IndexNumber),
      ),
    [seasons],
  );

  const selectSeason = (season: BaseItemDto) => {
    if (!item.Id) return;
    setSeasonIndexState((prev) => ({
      ...prev,
      [item.Id!]: season.IndexNumber ?? season.Name,
    }));
  };

  // Pick the initial season once: the requested index, else season 1 / 0 / first.
  useEffect(() => {
    if (!sortedSeasons.length || seasonIndex !== undefined) return;
    const byIndex =
      initialSeasonIndex !== undefined && !Number.isNaN(initialSeasonIndex)
        ? sortedSeasons.find((s) => s.IndexNumber === initialSeasonIndex)
        : undefined;
    const fallback =
      sortedSeasons.find((s) => s.IndexNumber === 1) ??
      sortedSeasons.find((s) => s.IndexNumber === 0) ??
      sortedSeasons[0];
    selectSeason(byIndex ?? fallback);
  }, [sortedSeasons, seasonIndex, initialSeasonIndex]);

  return (
    <View
      style={{
        minHeight: 64 * nrOfEpisodes,
      }}
    >
      <SectionHeader title={t("item_card.seasons")} accent={NeonBoard.yellow} />
      <View
        className='flex flex-row items-center'
        style={{ paddingLeft: Sizes.gutter, paddingRight: 4, gap: 8 }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 8, paddingRight: 8 }}
        >
          {sortedSeasons.map((season: BaseItemDto) => (
            <Chip
              key={season.Id ?? String(season.IndexNumber)}
              label={
                season.Name || `${t("item_card.season")} ${season.IndexNumber}`
              }
              accent={NeonBoard.yellow}
              selected={
                Number(season.IndexNumber) === Number(seasonIndex) ||
                season.Name === seasonIndex
              }
              onPress={() => selectSeason(season)}
            />
          ))}
        </ScrollView>
        {episodes?.length && !isOffline ? (
          <View className='flex flex-row items-center' style={{ gap: 4 }}>
            <DownloadItems
              title={t("item_card.download.download_season")}
              items={episodes || []}
              MissingDownloadIconComponent={() => (
                <HeaderIcon
                  name='downloads'
                  size={20}
                  tintColor={NeonBoard.mid}
                />
              )}
              DownloadedIconComponent={() => (
                <HeaderIcon
                  name='downloaded'
                  tintColor={NeonBoard.green}
                  size={20}
                />
              )}
            />
            <PlayedStatus items={episodes || []} />
          </View>
        ) : null}
      </View>
      <View className='flex flex-col' style={{ marginTop: 10 }}>
        <LoadingLine accent={NeonBoard.yellow} active={isPending} />
        {!isPending &&
          episodes?.map((e: BaseItemDto) => (
            <EpisodeRow
              key={e.Id}
              episode={e}
              current={!!currentEpisodeId && e.Id === currentEpisodeId}
              trailing={
                !isOffline ? <DownloadSingleItem item={e} /> : undefined
              }
            />
          ))}
        {!isPending && (episodes?.length || 0) === 0 ? (
          <View
            style={{ paddingHorizontal: Sizes.gutter, paddingVertical: 16 }}
          >
            <Text variant='meta' muted>
              {t("item_card.no_episodes_for_this_season")}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
};
