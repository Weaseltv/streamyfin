import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { SectionHeader } from "@/components/common/SectionHeader";
import { DownloadSize } from "@/components/downloads/DownloadSize";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { useDownload } from "@/providers/DownloadProvider";
import { Text } from "../common/Text";
import { TouchableItemRouter } from "../common/TouchableItemRouter";

const EPISODE_ROW = 44;

/** "S1:E1 · Body Shop" */
const episodeTitle = (item: BaseItemDto) =>
  `S${item.ParentIndexNumber ?? 0}:E${item.IndexNumber ?? 0} · ${item.Name ?? ""}`;

const EpisodeRow: React.FC<{ item: BaseItemDto }> = ({ item }) => {
  const { deleteFile } = useDownload();
  const confirmDelete = useConfirmDelete();

  const onLongPress = useCallback(
    () =>
      confirmDelete({
        title: episodeTitle(item),
        onConfirm: () => {
          if (item.Id) deleteFile(item.Id);
        },
      }),
    [confirmDelete, deleteFile, item],
  );

  return (
    <TouchableItemRouter
      item={item}
      onLongPress={onLongPress}
      style={{
        minHeight: EPISODE_ROW,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: Sizes.rowLead,
        paddingRight: Sizes.gutter,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: NeonBoard.line,
      }}
    >
      <Text
        variant='rowTitle'
        numberOfLines={1}
        style={{ flexShrink: 1, paddingRight: 12, fontSize: 16 }}
      >
        {episodeTitle(item)}
      </Text>
      <DownloadSize items={[item]} variant='tally' accent={NeonBoard.mid} />
    </TouchableItemRouter>
  );
};

/**
 * A downloaded series as its own section: the name on a yellow rule with
 * "SERIES · n EPISODES" right (tap opens the series, long press asks to
 * delete every episode), then 44 episode rows with sizes on the right.
 */
export const SeriesCard: React.FC<{ items: BaseItemDto[] }> = ({ items }) => {
  const { t } = useTranslation();
  const { deleteItems } = useDownload();
  const confirmDelete = useConfirmDelete();

  const episodes = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          (a.ParentIndexNumber ?? 0) - (b.ParentIndexNumber ?? 0) ||
          (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0),
      ),
    [items],
  );

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
    <View>
      <TouchableItemRouter
        item={seriesItem}
        onLongPress={showActionSheet}
        activeOpacity={0.7}
      >
        <SectionHeader
          title={items[0]?.SeriesName ?? ""}
          accent={NeonBoard.yellow}
          count={`${t("home.downloads.series")} · ${t("player.episode_count", { count: items.length })}`}
          className='px-3'
        />
      </TouchableItemRouter>
      {episodes.map((item) => (
        <EpisodeRow key={item.Id} item={item} />
      ))}
    </View>
  );
};
