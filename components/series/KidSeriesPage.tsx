import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAtomValue, useStore } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Chip } from "@/components/common/Chip";
import { HorizontalScroll } from "@/components/common/HorizontalScroll";
import { LoadingLine } from "@/components/common/LoadingLine";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Text } from "@/components/common/Text";
import { TouchableItemRouter } from "@/components/common/TouchableItemRouter";
import { WheelPickerSheet } from "@/components/common/WheelPickerSheet";
import { ItemCard, railCardWidth } from "@/components/home/ItemCard";
import { ItemCardText } from "@/components/ItemCardText";
import {
  KidTitleArtwork,
  KidTitleButtons,
  KidTitleHeading,
  KidTitleOverview,
  useKidTitleQuery,
} from "@/components/item/KidTitleContent";
import { TitleDetailsFailed } from "@/components/item/TitleDetailsPending";
import { ParallaxScrollView } from "@/components/ParallaxPage";
import { SimilarItems } from "@/components/SimilarItems";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import { POSTER_CAROUSEL_HEIGHT } from "@/constants/Values";
import useRouter from "@/hooks/useAppRouter";
import { useShuffleQueue } from "@/hooks/useShuffleQueue";
import { useGlobalModal } from "@/providers/GlobalModalProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSetPageAccent } from "@/utils/atoms/pageAccent";
import { startupSessionKey } from "@/utils/atoms/startupReady";
import {
  isPlayableKidEpisode,
  loadKidEpisodes,
  pickKidNextEpisode,
} from "@/utils/kidTitlePlayback";

type KidSeason = BaseItemDto & { Id: string };

export function KidSeriesPage({
  seriesId,
  seasonId,
  seasonIndex,
}: {
  seriesId: string;
  seasonId?: string;
  seasonIndex?: string;
}) {
  const api = useAtomValue(apiAtom);
  const userId = useAtomValue(userAtom)?.Id;
  const scope = startupSessionKey(api?.basePath, userId);
  const series = useKidTitleQuery(seriesId);
  const router = useRouter();
  useSetPageAccent(NeonBoard.show);
  const seasons = useQuery({
    queryKey: ["seasons", seriesId, "kid", scope],
    enabled: !!series.data && !!scope,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      if (!api || !userId) return [];
      const { data } = await getTvShowsApi(api).getSeasons(
        { seriesId, userId },
        { signal },
      );
      return (data.Items ?? []).filter(
        (item): item is KidSeason => item.Type === "Season" && !!item.Id,
      );
    },
  });

  if (series.isError) {
    return (
      <KidSeriesStatus
        onRetry={() => void series.refetch()}
        retrying={series.isFetching}
      />
    );
  }
  if (!series.data) return <KidSeriesStatus loading />;

  const showSeason = !!seasonId || (seasonIndex != null && seasonIndex !== "");
  const season = seasons.data?.find((item) =>
    seasonId ? item.Id === seasonId : item.IndexNumber === Number(seasonIndex),
  );
  if (showSeason && !season?.Id) {
    return (
      <KidSeriesStatus
        loading={seasons.isPending && !seasons.isError}
        onRetry={seasons.isError ? () => void seasons.refetch() : undefined}
        retrying={seasons.isFetching}
      />
    );
  }

  return (
    <ParallaxScrollView
      headerHeight={230}
      overlap={40}
      headerImage={<KidTitleArtwork item={series.data} />}
    >
      {season?.Id ? (
        <>
          <KidSeasonPicker
            season={season}
            seasons={seasons.data ?? []}
            onSelect={(id) => router.setParams({ seasonId: id })}
          />
          <KidSeasonDetails
            key={season.Id}
            seasonId={season.Id}
            series={series.data}
            seriesId={seriesId}
          />
        </>
      ) : (
        <>
          <KidTitleHeading
            item={series.data}
            seasonCount={seasons.data?.length}
          />
          <KidSeriesButtons item={series.data} seriesId={seriesId} />
          <KidTitleOverview text={series.data.Overview} />
          <KidSeasons items={seasons.data ?? []} loading={seasons.isLoading} />
          <SimilarItems itemId={seriesId} accent={NeonBoard.show} hideIfEmpty />
        </>
      )}
    </ParallaxScrollView>
  );
}

function KidSeriesButtons({
  item,
  seriesId,
}: {
  item: BaseItemDto;
  seriesId: string;
}) {
  const api = useAtomValue(apiAtom);
  const userId = useAtomValue(userAtom)?.Id;
  const store = useStore();
  const { t } = useTranslation();
  const scope = startupSessionKey(api?.basePath, userId);
  const { startShuffle } = useShuffleQueue();

  const nextUp = useQuery({
    queryKey: ["nextUp", seriesId, "kid", scope],
    enabled: !!scope,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      if (!api || !userId) return null;
      const shows = getTvShowsApi(api);
      const { data } = await shows.getNextUp({ seriesId, userId }, { signal });
      const next = data.Items?.find(isPlayableKidEpisode);
      if (next) return next;
      const episodes = await loadKidEpisodes(
        async (startIndex, limit) =>
          (
            await shows.getEpisodes(
              {
                seriesId,
                userId,
                startIndex,
                limit,
                enableImages: false,
                isMissing: false,
              },
              { signal },
            )
          ).data,
      );
      return pickKidNextEpisode(episodes) ?? null;
    },
  });
  const shuffle = useMutation({
    mutationFn: async () => {
      if (!api || !userId) return [];
      const shows = getTvShowsApi(api);
      const { data } = await shows.getEpisodes({
        seriesId,
        userId,
        sortBy: "Random",
        limit: 100,
        isMissing: false,
      });
      const episodes = (data.Items ?? []).filter(isPlayableKidEpisode);
      // A kid may have just one playable episode in a large series.
      return episodes.length ? episodes : nextUp.data ? [nextUp.data] : [];
    },
  });

  const onShuffle = () => {
    shuffle.mutate(undefined, {
      onSuccess: (episodes) => {
        if (store.get(apiAtom) === api && store.get(userAtom)?.Id === userId) {
          startShuffle(seriesId, episodes);
        }
      },
    });
  };

  return (
    <>
      <KidTitleButtons
        item={item}
        playable={nextUp.data ?? undefined}
        onShuffle={onShuffle}
        shuffleDisabled={shuffle.isPending || !nextUp.data}
      />
      <LoadingLine accent={NeonBoard.show} active={nextUp.isFetching} />
      {nextUp.isError && (
        <TitleDetailsFailed
          onRetry={() => void nextUp.refetch()}
          retrying={nextUp.isFetching}
        />
      )}
      {shuffle.isError && (
        <Text variant='meta' muted style={{ paddingHorizontal: Sizes.gutter }}>
          {t("item_card.could_not_load_item")}
        </Text>
      )}
    </>
  );
}

function KidSeasons({
  items,
  loading,
}: {
  items: BaseItemDto[];
  loading: boolean;
}) {
  const { t } = useTranslation();
  if (!loading && !items.length) return null;
  return (
    <>
      <SectionHeader title={t("item_card.seasons")} accent={NeonBoard.show} />
      <HorizontalScroll
        data={items}
        loading={loading}
        height={POSTER_CAROUSEL_HEIGHT}
        keyExtractor={(item) => item.Id!}
        renderItem={(item) => (
          <TouchableItemRouter
            item={item}
            style={{ width: railCardWidth("vertical") }}
          >
            <ItemCard item={item} orientation='vertical' />
            <ItemCardText item={item} />
          </TouchableItemRouter>
        )}
      />
    </>
  );
}

function KidSeasonPicker({
  season,
  seasons,
  onSelect,
}: {
  season: KidSeason;
  seasons: KidSeason[];
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { showModal, hideModal } = useGlobalModal();
  const name = (item: BaseItemDto) => item.Name || t("item_card.season");
  return (
    <View
      style={{
        paddingHorizontal: Sizes.gutter,
        paddingVertical: 12,
        alignItems: "flex-start",
      }}
    >
      <Chip
        label={name(season)}
        caret
        accent={NeonBoard.show}
        onPress={() =>
          showModal(
            <WheelPickerSheet
              title={t("item_card.seasons")}
              accent={NeonBoard.show}
              options={seasons.map((item) => ({
                value: item.Id,
                title: name(item),
              }))}
              selection={season.Id}
              onCommit={onSelect}
              onClose={hideModal}
            />,
            { enablePanDownToClose: true },
          )
        }
      />
    </View>
  );
}

function KidSeasonDetails({
  seasonId,
  series,
  seriesId,
}: {
  seasonId: string;
  series: BaseItemDto;
  seriesId: string;
}) {
  const api = useAtomValue(apiAtom);
  const userId = useAtomValue(userAtom)?.Id;
  const { t } = useTranslation();
  const scope = startupSessionKey(api?.basePath, userId);
  const [selectedId, setSelectedId] = useState<string>();
  const episodes = useQuery({
    queryKey: ["episodes", seriesId, "kid", seasonId, scope],
    enabled: !!scope,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      if (!api || !userId) return [];
      const { data } = await getTvShowsApi(api).getEpisodes(
        {
          seriesId,
          userId,
          seasonId,
          isMissing: false,
        },
        { signal },
      );
      return (data.Items ?? []).filter(isPlayableKidEpisode);
    },
  });
  const selected =
    episodes.data?.find((item) => item.Id === selectedId) ?? episodes.data?.[0];
  const details = useKidTitleQuery(selected?.Id);
  const episode = details.data ?? selected;

  return (
    <>
      <HorizontalScroll
        data={episodes.data}
        loading={episodes.isLoading}
        noItemsText={t(
          episodes.isError
            ? "item_card.could_not_load_item"
            : "item_card.no_episodes_for_this_season",
        )}
        keyExtractor={(item) => item.Id!}
        extraData={selected?.Id}
        renderItem={(item) => (
          <Pressable
            accessibilityRole='button'
            accessibilityState={{ selected: item.Id === selected?.Id }}
            accessibilityLabel={item.Name ?? undefined}
            onPress={() => setSelectedId(item.Id ?? undefined)}
            style={{
              width: railCardWidth("horizontal"),
              opacity: item.Id === selected?.Id ? 1 : 0.6,
            }}
          >
            <ItemCard
              item={item}
              orientation='horizontal'
              useEpisodePoster
              badge={null}
            />
            <ItemCardText item={item} />
          </Pressable>
        )}
      />
      {episode && (
        <>
          <KidTitleHeading
            item={episode}
            fallbackRating={series.OfficialRating}
          />
          <KidTitleButtons item={episode} playable={episode} />
          <KidTitleOverview text={details.data?.Overview} />
        </>
      )}
      {details.isError && (
        <TitleDetailsFailed
          onRetry={() => void details.refetch()}
          retrying={details.isFetching}
        />
      )}
    </>
  );
}

function KidSeriesStatus({
  loading,
  onRetry,
  retrying,
}: {
  loading?: boolean;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        backgroundColor: NeonBoard.stage,
      }}
    >
      {loading ? (
        <LoadingLine accent={NeonBoard.show} active />
      ) : onRetry ? (
        <TitleDetailsFailed onRetry={onRetry} retrying={retrying} />
      ) : (
        <Text variant='body' muted style={{ paddingHorizontal: Sizes.gutter }}>
          {t("item_card.could_not_load_item")}
        </Text>
      )}
    </View>
  );
}
