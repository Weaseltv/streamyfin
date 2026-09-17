import { Feather } from "@expo/vector-icons";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
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
import {
  NeonSheetHead,
  neonSheetModalProps,
} from "@/components/common/NeonSheet";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import useRouter from "@/hooks/useAppRouter";
import { useFavorite } from "@/hooks/useFavorite";
import {
  audioStorageEvents,
  deleteTrack,
  downloadTrack,
  isCached,
  isPermanentDownloading,
  isPermanentlyDownloaded,
} from "@/providers/AudioStorage";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useMusicPlayer } from "@/providers/MusicPlayerProvider";
import { getJellyfinHeadersForUrl } from "@/utils/customHeaders";
import { getAudioStreamUrl } from "@/utils/jellyfin/audio/getAudioStreamUrl";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";

interface Props {
  open: boolean;
  setOpen: (open: boolean) => void;
  track: BaseItemDto | null;
  onAddToPlaylist: () => void;
  playlistId?: string;
  onRemoveFromPlaylist?: () => void;
}

export const TrackOptionsSheet: React.FC<Props> = ({
  open,
  setOpen,
  track,
  onAddToPlaylist,
  playlistId,
  onRemoveFromPlaylist,
}) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const router = useRouter();
  const { playNext, addToQueue } = useMusicPlayer();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [isDownloadingTrack, setIsDownloadingTrack] = useState(false);
  // Counter to trigger re-evaluation of download status when storage changes
  const [storageUpdateCounter, setStorageUpdateCounter] = useState(0);

  // Listen for storage events to update download status
  useEffect(() => {
    const handleComplete = (event: { itemId: string }) => {
      if (event.itemId === track?.Id) {
        setStorageUpdateCounter((c) => c + 1);
      }
    };

    audioStorageEvents.on("complete", handleComplete);
    return () => {
      audioStorageEvents.off("complete", handleComplete);
    };
  }, [track?.Id]);

  // Force re-evaluation of cache status when track changes
  useEffect(() => {
    setStorageUpdateCounter((c) => c + 1);
  }, [track?.Id]);

  // Use a placeholder item for useFavorite when track is null
  const { isFavorite, toggleFavorite } = useFavorite(
    track ?? ({ Id: "", UserData: { IsFavorite: false } } as BaseItemDto),
  );

  // Check download status (storageUpdateCounter triggers re-evaluation when download completes)
  const isAlreadyDownloaded = useMemo(
    () => isPermanentlyDownloaded(track?.Id),
    [track?.Id, storageUpdateCounter],
  );
  const isOnlyCached = useMemo(
    () => isCached(track?.Id),
    [track?.Id, storageUpdateCounter],
  );
  const isCurrentlyDownloading = useMemo(
    () => isPermanentDownloading(track?.Id),
    [track?.Id, storageUpdateCounter],
  );

  const imageUrl = useMemo(() => {
    if (!track) return null;
    const albumId = track.AlbumId || track.ParentId;
    if (albumId) {
      return `${api?.basePath}/Items/${albumId}/Images/Primary?maxHeight=200&maxWidth=200`;
    }
    return getPrimaryImageUrl({ api, item: track });
  }, [api, track]);

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

  const handlePlayNext = useCallback(() => {
    if (track) {
      playNext(track);
      setOpen(false);
    }
  }, [track, playNext, setOpen]);

  const handleAddToQueue = useCallback(() => {
    if (track) {
      addToQueue(track);
      setOpen(false);
    }
  }, [track, addToQueue, setOpen]);

  const handleAddToPlaylist = useCallback(() => {
    setOpen(false);
    setTimeout(() => {
      onAddToPlaylist();
    }, 300);
  }, [onAddToPlaylist, setOpen]);

  const handleRemoveFromPlaylist = useCallback(() => {
    if (onRemoveFromPlaylist) {
      onRemoveFromPlaylist();
      setOpen(false);
    }
  }, [onRemoveFromPlaylist, setOpen]);

  const handleDownload = useCallback(async () => {
    if (!track?.Id || !api || !user?.Id || isAlreadyDownloaded) return;

    setIsDownloadingTrack(true);
    try {
      const result = await getAudioStreamUrl(api, user.Id, track.Id);
      if (result?.url && !result.isTranscoding) {
        await downloadTrack(track.Id, result.url, {
          permanent: true,
          container: result.mediaSource?.Container || undefined,
          headers: getJellyfinHeadersForUrl(result.url, api?.basePath),
        });
      }
    } catch {
      // Silent fail
    }
    setIsDownloadingTrack(false);
    setOpen(false);
  }, [track?.Id, api, user?.Id, isAlreadyDownloaded, setOpen]);

  const handleDelete = useCallback(async () => {
    if (!track?.Id) return;
    await deleteTrack(track.Id);
    setStorageUpdateCounter((c) => c + 1);
    setOpen(false);
  }, [track?.Id, setOpen]);

  const handleGoToArtist = useCallback(() => {
    const artistId = track?.ArtistItems?.[0]?.Id;
    if (artistId) {
      setOpen(false);
      router.push({
        pathname: "/music/artist/[artistId]",
        params: { artistId },
      });
    }
  }, [track?.ArtistItems, router, setOpen]);

  const handleGoToAlbum = useCallback(() => {
    const albumId = track?.AlbumId || track?.ParentId;
    if (albumId) {
      setOpen(false);
      router.push({
        pathname: "/music/album/[albumId]",
        params: { albumId },
      });
    }
  }, [track?.AlbumId, track?.ParentId, router, setOpen]);

  const handleToggleFavorite = useCallback(() => {
    if (track) {
      toggleFavorite();
      setOpen(false);
    }
  }, [track, toggleFavorite, setOpen]);

  // Check if navigation options are available
  const hasArtist = !!track?.ArtistItems?.[0]?.Id;
  const hasAlbum = !!(track?.AlbumId || track?.ParentId);

  if (!track) return null;

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      enableDynamicSizing
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
          eyebrow={track.Artists?.join(", ") || track.AlbumArtist}
          title={track.Name ?? ""}
          onClose={() => setOpen(false)}
        />

        {/* Track art under the head, on the panel. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingLeft: Sizes.rowLead,
            paddingRight: Sizes.gutter,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: NeonBoard.line,
          }}
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
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={{ width: "100%", height: "100%" }}
                contentFit='cover'
                cachePolicy='memory-disk'
              />
            ) : (
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name='music' size={20} color={NeonBoard.mid} />
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text variant='rowTitle' numberOfLines={1}>
              {track.Name}
            </Text>
            <Text
              variant='meta'
              muted
              numberOfLines={1}
              style={{ marginTop: 2 }}
            >
              {track.Artists?.join(", ") || track.AlbumArtist}
            </Text>
          </View>
        </View>

        {/* Playback Options */}
        <View>
          <OptionRow
            icon='skip-forward'
            label={t("music.track_options.play_next")}
            onPress={handlePlayNext}
          />
          <OptionRow
            icon='list'
            label={t("music.track_options.add_to_queue")}
            onPress={handleAddToQueue}
          />
        </View>

        {/* Library Options */}
        <View>
          <OptionRow
            icon='heart'
            iconColor={isFavorite ? NeonBoard.red : undefined}
            label={
              isFavorite
                ? t("music.track_options.remove_from_favorites")
                : t("music.track_options.add_to_favorites")
            }
            onPress={handleToggleFavorite}
          />
          <OptionRow
            icon='folder-plus'
            label={t("music.track_options.add_to_playlist")}
            onPress={handleAddToPlaylist}
          />

          {playlistId && (
            <OptionRow
              icon='trash-2'
              destructive
              label={t("music.track_options.remove_from_playlist")}
              onPress={handleRemoveFromPlaylist}
            />
          )}

          <OptionRow
            icon={isAlreadyDownloaded ? "check-circle" : "download"}
            iconColor={isAlreadyDownloaded ? NeonBoard.green : undefined}
            textColor={isAlreadyDownloaded ? NeonBoard.green : undefined}
            loading={isCurrentlyDownloading || isDownloadingTrack}
            disabled={
              isAlreadyDownloaded ||
              isCurrentlyDownloading ||
              isDownloadingTrack
            }
            label={
              isCurrentlyDownloading || isDownloadingTrack
                ? t("music.track_options.downloading")
                : isAlreadyDownloaded
                  ? t("music.track_options.downloaded")
                  : t("music.track_options.download")
            }
            onPress={handleDownload}
          />

          {isOnlyCached && !isAlreadyDownloaded && (
            <OptionRow
              icon='cloud'
              iconColor={NeonBoard.mid}
              textColor={NeonBoard.mid}
              label={t("music.track_options.cached")}
            />
          )}

          {(isAlreadyDownloaded || isOnlyCached) && (
            <OptionRow
              icon='trash-2'
              destructive
              label={
                isAlreadyDownloaded
                  ? t("music.track_options.delete_download")
                  : t("music.track_options.delete_cache")
              }
              onPress={handleDelete}
            />
          )}
        </View>

        {/* Navigation Options */}
        {(hasArtist || hasAlbum) && (
          <View>
            {hasArtist && (
              <OptionRow
                icon='user'
                label={t("music.track_options.go_to_artist")}
                onPress={handleGoToArtist}
              />
            )}

            {hasAlbum && (
              <OptionRow
                icon='disc'
                label={t("music.track_options.go_to_album")}
                onPress={handleGoToAlbum}
              />
            )}
          </View>
        )}
      </BottomSheetView>
    </BottomSheetModal>
  );
};

/** A 52 hairline option row: Feather glyph in `mid`, label in `text`. */
const OptionRow: React.FC<{
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  iconColor?: string;
  textColor?: string;
  loading?: boolean;
}> = ({
  icon,
  label,
  onPress,
  disabled,
  destructive,
  iconColor,
  textColor,
  loading,
}) => {
  const glyph = destructive ? NeonBoard.red : (iconColor ?? NeonBoard.mid);
  const tone = destructive ? NeonBoard.red : (textColor ?? NeonBoard.text);
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole={onPress ? "button" : undefined}
      activeOpacity={0.7}
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
      {loading ? (
        <ActivityIndicator size={18} color={NeonBoard.volt} />
      ) : (
        <Feather name={icon} size={18} color={glyph} />
      )}
      <Text variant='rowTitle' style={{ marginLeft: 14, color: tone }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};
