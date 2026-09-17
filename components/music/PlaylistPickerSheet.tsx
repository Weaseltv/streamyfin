import { Feather } from "@expo/vector-icons";
import { BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Input } from "@/components/common/Input";
import {
  NeonSheetHead,
  neonSheetModalProps,
} from "@/components/common/NeonSheet";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import { useAddToPlaylist } from "@/hooks/usePlaylistMutations";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

interface Props {
  open: boolean;
  setOpen: (open: boolean) => void;
  trackToAdd: BaseItemDto | null;
  onCreateNew: () => void;
}

export const PlaylistPickerSheet: React.FC<Props> = ({
  open,
  setOpen,
  trackToAdd,
  onCreateNew,
}) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const addToPlaylist = useAddToPlaylist();

  const [search, setSearch] = useState("");
  const snapPoints = useMemo(() => ["75%"], []);

  // Fetch all playlists
  const { data: playlists, isLoading } = useQuery({
    queryKey: ["music-playlists-picker", user?.Id],
    queryFn: async () => {
      if (!api || !user?.Id) return [];

      const response = await getItemsApi(api).getItems({
        userId: user.Id,
        includeItemTypes: ["Playlist"],
        sortBy: ["SortName"],
        sortOrder: ["Ascending"],
        recursive: true,
        mediaTypes: ["Audio"],
      });

      return response.data.Items || [];
    },
    enabled: Boolean(api && user?.Id && open),
  });

  const filteredPlaylists = useMemo(() => {
    if (!playlists) return [];
    if (!search) return playlists;
    return playlists.filter((playlist) =>
      playlist.Name?.toLowerCase().includes(search.toLowerCase()),
    );
  }, [playlists, search]);

  const showSearch = (playlists?.length || 0) > 10;

  useEffect(() => {
    if (open) {
      setSearch("");
      bottomSheetModalRef.current?.present();
    } else {
      bottomSheetModalRef.current?.dismiss();
    }
  }, [open]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        setOpen(false);
      }
    },
    [setOpen],
  );

  const handleSelectPlaylist = useCallback(
    async (playlist: BaseItemDto) => {
      if (!trackToAdd?.Id || !playlist.Id) return;

      await addToPlaylist.mutateAsync({
        playlistId: playlist.Id,
        trackIds: [trackToAdd.Id],
        playlistName: playlist.Name || undefined,
      });

      setOpen(false);
    },
    [trackToAdd, addToPlaylist, setOpen],
  );

  const handleCreateNew = useCallback(() => {
    setOpen(false);
    setTimeout(() => {
      onCreateNew();
    }, 300);
  }, [onCreateNew, setOpen]);

  const getPlaylistImageUrl = useCallback(
    (playlist: BaseItemDto) => {
      if (!api) return null;
      return `${api.basePath}/Items/${playlist.Id}/Images/Primary?maxHeight=100&maxWidth=100`;
    },
    [api],
  );

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      index={0}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      {...neonSheetModalProps}
    >
      <BottomSheetScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingBottom: insets.bottom + 16,
        }}
      >
        <NeonSheetHead
          eyebrow={trackToAdd?.Name}
          title={t("music.track_options.add_to_playlist")}
          onClose={() => setOpen(false)}
        />

        {showSearch && (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <Input
              placeholder={t("music.playlists.search_playlists")}
              value={search}
              onChangeText={setSearch}
              returnKeyType='done'
            />
          </View>
        )}

        {/* Create New Playlist Button */}
        <TouchableOpacity
          onPress={handleCreateNew}
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
          <Feather name='plus' size={18} color={NeonBoard.volt} />
          <Text
            variant='rowTitle'
            style={{ color: NeonBoard.volt, marginLeft: 14 }}
          >
            {t("music.playlists.create_new")}
          </Text>
        </TouchableOpacity>

        {isLoading ? (
          <View style={{ paddingVertical: 32, alignItems: "center" }}>
            <ActivityIndicator color={NeonBoard.volt} />
          </View>
        ) : filteredPlaylists.length === 0 ? (
          <View style={{ paddingVertical: 32, alignItems: "center" }}>
            <Text variant='body' muted>
              {search ? t("search.no_results") : t("music.no_playlists")}
            </Text>
          </View>
        ) : (
          <View>
            {filteredPlaylists.map((playlist) => (
              <View key={playlist.Id}>
                <TouchableOpacity
                  onPress={() => handleSelectPlaylist(playlist)}
                  accessibilityRole='button'
                  style={{
                    minHeight: 60,
                    paddingVertical: 6,
                    paddingLeft: Sizes.rowLead,
                    paddingRight: Sizes.gutter,
                    flexDirection: "row",
                    alignItems: "center",
                    borderBottomWidth: 1,
                    borderBottomColor: NeonBoard.line,
                  }}
                  disabled={addToPlaylist.isPending}
                >
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 0,
                      overflow: "hidden",
                      backgroundColor: NeonBoard.card2,
                      marginRight: 12,
                    }}
                  >
                    <Image
                      source={{
                        uri: getPlaylistImageUrl(playlist) || undefined,
                      }}
                      style={{ width: "100%", height: "100%" }}
                      contentFit='cover'
                      cachePolicy='memory-disk'
                    />
                  </View>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text variant='rowTitle' numberOfLines={1}>
                      {playlist.Name}
                    </Text>
                    <Text variant='meta' muted style={{ marginTop: 2 }}>
                      {playlist.ChildCount} {t("music.tabs.tracks")}
                    </Text>
                  </View>
                  {addToPlaylist.isPending && (
                    <ActivityIndicator size='small' color={NeonBoard.volt} />
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
};
