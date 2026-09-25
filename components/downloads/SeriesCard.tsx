import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { SectionHeader } from "@/components/common/SectionHeader";
import { MovieCard } from "@/components/downloads/MovieCard";
import { NeonBoard } from "@/constants/Colors";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { useDownload } from "@/providers/DownloadProvider";
import { TouchableItemRouter } from "../common/TouchableItemRouter";

const _EPISODE_ROW = 44;

/** A downloaded episode: the same row as a downloaded movie. */
export const EpisodeRow: React.FC<{ item: BaseItemDto }> = ({ item }) => (
  <MovieCard item={item} />
);

/** Season, then episode order for a series' downloaded episodes. */
export const sortEpisodes = (items: BaseItemDto[]) =>
  [...items].sort(
    (a, b) =>
      (a.ParentIndexNumber ?? 0) - (b.ParentIndexNumber ?? 0) ||
      (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0),
  );

/**
 * A downloaded series' header: the name on a yellow rule with
 * "SERIES · n EPISODES" right. Tap opens the series, long press asks to
 * delete every episode. The Downloads screen renders it as its own list row,
 * with each EpisodeRow as a separate recyclable row beneath it.
 */
export const SeriesHeader: React.FC<{ items: BaseItemDto[] }> = ({ items }) => {
  const { t } = useTranslation();
  const { deleteItems } = useDownload();
  const confirmDelete = useConfirmDelete();

  const deleteSeries = useCallback(
    () =>
      deleteItems(
        items.map((item) => item.Id).filter((id) => id !== undefined),
      ),
    [items],
  );

  const showActionSheet = useCallback(
    () =>
      confirmDelete({
        title: items[0]?.SeriesName ?? undefined,
        message: t("player.episode_count", { count: items.length }),
        onConfirm: deleteSeries,
      }),
    [confirmDelete, deleteSeries, items, t],
  );

  const seriesItem = useMemo<BaseItemDto>(
    () => ({ Id: items[0]?.SeriesId ?? undefined, Type: "Series" }),
    [items],
  );

  return (
    <TouchableItemRouter
      item={seriesItem}
      onLongPress={showActionSheet}
      activeOpacity={0.7}
    >
      <SectionHeader
        title={items[0]?.SeriesName ?? ""}
        accent={NeonBoard.yellow}
        count={`${t("home.downloads.series")} · ${t("player.episode_count", { count: items.length })}`}
        className='px-4'
        bleedRule
      />
    </TouchableItemRouter>
  );
};

/** Header plus every episode, unvirtualized. Kept for small embedded uses. */
export const SeriesCard: React.FC<{ items: BaseItemDto[] }> = ({ items }) => {
  const episodes = useMemo(() => sortEpisodes(items), [items]);
  return (
    <View>
      <SeriesHeader items={items} />
      {episodes.map((item) => (
        <EpisodeRow key={item.Id} item={item} />
      ))}
    </View>
  );
};
