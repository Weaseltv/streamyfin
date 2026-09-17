import { Feather } from "@expo/vector-icons";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  NeonSheetHead,
  neonSheetModalProps,
} from "@/components/common/NeonSheet";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import useRouter from "@/hooks/useAppRouter";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { useDeletePlaylist } from "@/hooks/usePlaylistMutations";

interface Props {
  open: boolean;
  setOpen: (open: boolean) => void;
  playlist: BaseItemDto | null;
}

export const PlaylistOptionsSheet: React.FC<Props> = ({
  open,
  setOpen,
  playlist,
}) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const deletePlaylist = useDeletePlaylist();
  const confirmDelete = useConfirmDelete();

  const snapPoints = useMemo(() => ["25%"], []);

  useEffect(() => {
    if (open) bottomSheetModalRef.current?.present();
    else bottomSheetModalRef.current?.dismiss();
  }, [open]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        setOpen(false);
      }
    },
    [setOpen],
  );

  const handleDeletePlaylist = useCallback(() => {
    if (!playlist?.Id) return;

    confirmDelete({
      title: t("music.playlists.delete_playlist"),
      message: t("music.playlists.delete_confirm", { name: playlist.Name }),
      onConfirm: () => {
        deletePlaylist.mutate(
          { playlistId: playlist.Id! },
          {
            onSuccess: () => {
              setOpen(false);
              router.back();
            },
          },
        );
      },
    });
  }, [playlist, deletePlaylist, setOpen, router, t, confirmDelete]);

  if (!playlist) return null;

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      index={0}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      {...neonSheetModalProps}
    >
      <BottomSheetView
        style={{
          flex: 1,
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingBottom: insets.bottom,
        }}
      >
        <NeonSheetHead
          eyebrow={t("music.tabs.playlists")}
          title={playlist.Name ?? t("music.tabs.playlists")}
          onClose={() => setOpen(false)}
        />
        <View>
          <TouchableOpacity
            onPress={handleDeletePlaylist}
            accessibilityRole='button'
            style={{
              minHeight: 52,
              paddingLeft: Sizes.rowLead,
              paddingRight: Sizes.gutter,
              flexDirection: "row",
              alignItems: "center",
              borderBottomWidth: 1,
              borderBottomColor: NeonBoard.line,
            }}
          >
            <Feather name='trash-2' size={18} color={NeonBoard.red} />
            <Text
              variant='rowTitle'
              style={{ color: NeonBoard.red, marginLeft: 14 }}
            >
              {t("music.playlists.delete_playlist")}
            </Text>
          </TouchableOpacity>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
};
