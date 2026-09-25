import { Feather } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import type React from "react";
import { useCallback, useMemo } from "react";
import { View } from "react-native";
import { DownloadSize } from "@/components/downloads/DownloadSize";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { useDownload } from "@/providers/DownloadProvider";
import { storage } from "@/utils/mmkv";
import { runtimeTicksToMinutes } from "@/utils/time";
import { Text } from "../common/Text";
import { TouchableItemRouter } from "../common/TouchableItemRouter";

const POSTER = { w: 40, h: 58 };
/** Episode stills are 16:9; same height as the poster, wider box. */
const STILL = { w: 103, h: 58 };
const ROW = 60;

interface MovieCardProps {
  item: BaseItemDto;
}

/**
 * A downloaded movie, episode or other single item as a 60 hairline row:
 * artwork (40×58 poster, or a 103×58 still for episodes), title,
 * "2026 · 2h 0m · 1.4 GB" meta ("S1:E2 · 42m · 150 MB" for episodes), the
 * green `download` glyph and a chevron. Long press asks to delete it.
 */
export const MovieCard: React.FC<MovieCardProps> = ({ item }) => {
  const { deleteFile } = useDownload();
  const confirmDelete = useConfirmDelete();

  const isEpisode = item.Type === "Episode";
  const art = isEpisode ? STILL : POSTER;
  const base64Image = useMemo(() => {
    return item?.Id ? storage.getString(item.Id) : undefined;
  }, [item?.Id]);

  const handleDeleteFile = useCallback(() => {
    if (item.Id) {
      deleteFile(item.Id);
    }
  }, [deleteFile, item.Id]);

  const showActionSheet = useCallback(
    () =>
      confirmDelete({
        title: item.Name ?? undefined,
        onConfirm: handleDeleteFile,
      }),
    [confirmDelete, handleDeleteFile, item.Name],
  );

  return (
    <TouchableItemRouter
      onLongPress={showActionSheet}
      item={item}
      style={{
        minHeight: ROW,
        flexDirection: "row",
        alignItems: "center",
        paddingLeft: Sizes.rowLead,
        paddingRight: Sizes.gutter,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: NeonBoard.line,
      }}
    >
      <View
        style={{
          width: art.w,
          height: art.h,
          backgroundColor: NeonBoard.card2,
          borderWidth: 1,
          borderColor: NeonBoard.line,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {base64Image ? (
          <Image
            source={{ uri: `data:image/jpeg;base64,${base64Image}` }}
            style={{ width: "100%", height: "100%" }}
            contentFit='cover'
          />
        ) : (
          <Feather
            name={isEpisode ? "tv" : "film"}
            size={16}
            color={NeonBoard.low}
          />
        )}
      </View>
      <View style={{ flex: 1, marginLeft: 12, marginRight: 8 }}>
        <Text variant='rowTitle' numberOfLines={1} style={{ fontSize: 16 }}>
          {item.Name}
        </Text>
        <View
          style={{ flexDirection: "row", alignItems: "center", marginTop: 3 }}
        >
          <Text variant='meta' muted numberOfLines={1}>
            {[
              isEpisode
                ? `S${item.ParentIndexNumber ?? 0}:E${item.IndexNumber ?? 0}`
                : item.ProductionYear,
              item.RunTimeTicks
                ? runtimeTicksToMinutes(item.RunTimeTicks)
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            {" · "}
          </Text>
          <DownloadSize items={[item]} />
        </View>
      </View>
      <Feather name='download' size={18} color={NeonBoard.green} />
      <Feather
        name='chevron-right'
        size={18}
        color={NeonBoard.low}
        style={{ marginLeft: 12 }}
      />
    </TouchableItemRouter>
  );
};
