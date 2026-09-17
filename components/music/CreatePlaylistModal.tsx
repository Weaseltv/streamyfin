import {
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import {
  NeonSheetHead,
  neonSheetModalProps,
} from "@/components/common/NeonSheet";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { FontFace } from "@/constants/neon";
import { useCreatePlaylist } from "@/hooks/usePlaylistMutations";

interface Props {
  open: boolean;
  setOpen: (open: boolean) => void;
  onPlaylistCreated?: (playlistId: string) => void;
  initialTrackId?: string;
}

export const CreatePlaylistModal: React.FC<Props> = ({
  open,
  setOpen,
  onPlaylistCreated,
  initialTrackId,
}) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const createPlaylist = useCreatePlaylist();

  const [name, setName] = useState("");
  const [focused, setFocused] = useState(false);
  const snapPoints = useMemo(() => ["40%"], []);

  useEffect(() => {
    if (open) {
      setName("");
      bottomSheetModalRef.current?.present();
    } else {
      bottomSheetModalRef.current?.dismiss();
    }
  }, [open]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        setOpen(false);
        Keyboard.dismiss();
      }
    },
    [setOpen],
  );

  const handleCreate = useCallback(async () => {
    if (!name.trim()) return;

    const result = await createPlaylist.mutateAsync({
      name: name.trim(),
      trackIds: initialTrackId ? [initialTrackId] : undefined,
    });

    if (result) {
      onPlaylistCreated?.(result);
    }
    setOpen(false);
  }, [name, createPlaylist, initialTrackId, onPlaylistCreated, setOpen]);

  const isValid = name.trim().length > 0;

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      index={0}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      {...neonSheetModalProps}
      keyboardBehavior='interactive'
      keyboardBlurBehavior='restore'
    >
      <BottomSheetView
        style={{
          flex: 1,
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingBottom: insets.bottom + 16,
        }}
      >
        <NeonSheetHead
          eyebrow={t("music.tabs.playlists")}
          title={t("music.playlists.create_playlist")}
          onClose={() => setOpen(false)}
        />

        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <Text variant='caption' muted style={{ marginBottom: 6 }}>
            {t("music.playlists.playlist_name")}
          </Text>
          <BottomSheetTextInput
            placeholder={t("music.playlists.enter_name")}
            placeholderTextColor={NeonBoard.low}
            value={name}
            onChangeText={setName}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoFocus
            returnKeyType='done'
            onSubmitEditing={handleCreate}
            style={{
              backgroundColor: NeonBoard.card2,
              borderWidth: 1,
              borderColor: focused ? NeonBoard.volt : NeonBoard.line2,
              borderRadius: 0,
              color: NeonBoard.text,
              paddingHorizontal: 14,
              minHeight: 48,
              ...FontFace.bodySemi,
              fontSize: 18,
              marginBottom: 20,
            }}
          />

          <Button
            onPress={handleCreate}
            disabled={!isValid || createPlaylist.isPending}
            loading={createPlaylist.isPending}
          >
            {t("music.playlists.create")}
          </Button>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
};
