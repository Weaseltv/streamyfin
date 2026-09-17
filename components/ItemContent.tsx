import { Feather } from "@expo/vector-icons";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useNavigation } from "expo-router";
import { useAtom } from "jotai";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Bitrate } from "@/components/BitrateSelector";
import { HeaderButtonGroup } from "@/components/common/HeaderButton";
import { ItemImage } from "@/components/common/ItemImage";
import { DownloadSingleItem } from "@/components/DownloadItem";
import { ActionCell, ActionStrip } from "@/components/item/ActionCell";
import { ItemPeopleSections } from "@/components/item/ItemPeopleSections";
import { OptionRows } from "@/components/item/OptionRows";
import { MediaSourceButton } from "@/components/MediaSourceButton";
import { OverviewText } from "@/components/OverviewText";
import { ParallaxScrollView } from "@/components/ParallaxPage";
import { PlayButton } from "@/components/PlayButton";
import { SimilarItems } from "@/components/SimilarItems";
import { CurrentSeries } from "@/components/series/CurrentSeries";
import { SeasonEpisodesCarousel } from "@/components/series/SeasonEpisodesCarousel";
import { NeonBoard, typeAccent } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import useDefaultPlaySettings from "@/hooks/useDefaultPlaySettings";
import { useFavorite } from "@/hooks/useFavorite";
import { useMarkAsPlayed } from "@/hooks/useMarkAsPlayed";
import { useOrientation } from "@/hooks/useOrientation";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import { useDownload } from "@/providers/DownloadProvider";
import { userAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { useSetPageAccent } from "@/utils/atoms/pageAccent";
import { useSettings } from "@/utils/atoms/settings";
import { AddToWatchlist } from "./AddToWatchlist";
import { ItemHeader } from "./ItemHeader";
import { PlayInRemoteSessionButton } from "./PlayInRemoteSession";

const Chromecast = !Platform.isTV ? require("./Chromecast") : null;
const ItemContentTV = Platform.isTV
  ? require("./ItemContent.tv").ItemContentTV
  : null;

export type SelectedOptions = {
  bitrate: Bitrate;
  mediaSource: MediaSourceInfo | undefined;
  audioIndex: number | undefined;
  subtitleIndex: number;
};

interface ItemContentProps {
  item?: BaseItemDto | null;
  itemWithSources?: BaseItemDto | null;
  isLoading?: boolean;
}

// Mobile-specific implementation
const ItemContentMobile: React.FC<ItemContentProps> = ({
  item,
  itemWithSources,
}) => {
  const isOffline = useOfflineMode();
  const { getDownloadedItemById } = useDownload();
  // A download pins the tracks it was pulled with, and only the record knows
  // them: resolving against the server media source hands back an index for a
  // stream the local file may not contain.
  const downloadedTracks =
    isOffline && item?.Id
      ? getDownloadedItemById(item.Id)?.userData
      : undefined;
  const { settings } = useSettings();
  const { orientation } = useOrientation();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [user] = useAtom(userAtom);
  const { t } = useTranslation();

  const [headerHeight, setHeaderHeight] = useState(230);

  const [selectedOptions, setSelectedOptions] = useState<
    SelectedOptions | undefined
  >(undefined);

  // Use itemWithSources for play settings since it has MediaSources data
  const {
    defaultAudioIndex,
    defaultBitrate,
    defaultMediaSource,
    defaultSubtitleIndex,
  } = useDefaultPlaySettings(itemWithSources ?? item, settings);

  const accent = typeAccent(item);
  useSetPageAccent(item ? accent : undefined);

  // Needs to automatically change the selected to the default values for default indexes.
  useEffect(() => {
    setSelectedOptions(() => ({
      bitrate: defaultBitrate,
      mediaSource: defaultMediaSource ?? undefined,
      subtitleIndex:
        downloadedTracks?.subtitleStreamIndex ?? defaultSubtitleIndex ?? -1,
      audioIndex: downloadedTracks?.audioStreamIndex ?? defaultAudioIndex,
    }));
  }, [
    defaultAudioIndex,
    defaultBitrate,
    defaultSubtitleIndex,
    defaultMediaSource,
    downloadedTracks,
  ]);

  // Glass squares over the backdrop: cast, remote session, watchlists.
  useEffect(() => {
    if (!Platform.isTV && itemWithSources) {
      navigation.setOptions({
        headerRight: () =>
          item && (
            <HeaderButtonGroup>
              <Chromecast.Chromecast variant='glass' />
              {item.Type !== "Program" &&
                user?.Policy?.IsAdministrator &&
                !settings.hideRemoteSessionButton && (
                  <PlayInRemoteSessionButton item={item} size='large' />
                )}
              {item.Type !== "Program" &&
                settings.streamyStatsServerUrl &&
                !settings.hideWatchlistsTab && <AddToWatchlist item={item} />}
            </HeaderButtonGroup>
          ),
      });
    }
  }, [
    item,
    navigation,
    user,
    itemWithSources,
    settings.hideRemoteSessionButton,
    settings.streamyStatsServerUrl,
    settings.hideWatchlistsTab,
  ]);

  useEffect(() => {
    if (item) {
      if (orientation !== ScreenOrientation.OrientationLock.PORTRAIT_UP)
        setHeaderHeight(200);
      else if (item.Type === "Movie") setHeaderHeight(230);
      else setHeaderHeight(230);
    }
  }, [item, orientation]);

  const { isFavorite, toggleFavorite } = useFavorite(item ?? {});
  const allPlayed = !!item?.UserData?.Played;
  const togglePlayed = useMarkAsPlayed(item ? [item] : []);
  const trailerLink = item?.RemoteTrailers?.[0]?.Url;
  const openTrailer = useCallback(async () => {
    if (!trailerLink) return;
    try {
      await Linking.openURL(trailerLink);
    } catch (err) {
      console.error("Failed to open trailer link:", err);
    }
  }, [trailerLink]);

  if (!item || !selectedOptions) return null;

  const showStrip = item.Type !== "Program";

  return (
    <View
      className='flex-1 relative'
      style={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
        backgroundColor: NeonBoard.stage,
      }}
    >
      <ParallaxScrollView
        className='flex-1'
        headerHeight={headerHeight}
        overlap={item.Type === "Movie" ? 64 : 40}
        headerImage={
          <View style={[{ flex: 1 }]}>
            <ItemImage
              variant={item.Type === "Movie" ? "Backdrop" : "Primary"}
              item={item}
              style={{
                width: "100%",
                height: "100%",
              }}
            />
          </View>
        }
      >
        <View className='flex flex-col bg-transparent shrink'>
          <ItemHeader item={item} />

          <View
            className='flex flex-row items-stretch'
            style={{
              paddingHorizontal: Sizes.gutter,
              gap: 10,
              marginTop: 14,
              marginBottom: 12,
            }}
          >
            <PlayButton selectedOptions={selectedOptions} item={item} />
            {!isOffline && (
              <MediaSourceButton
                selectedOptions={selectedOptions}
                setSelectedOptions={setSelectedOptions}
                item={itemWithSources}
                accent={accent}
              />
            )}
          </View>

          {showStrip && (
            <ActionStrip>
              <ActionCell
                icon={
                  <Feather
                    name='heart'
                    size={18}
                    color={isFavorite ? NeonBoard.volt : NeonBoard.text}
                  />
                }
                label={t("item.watchlist")}
                active={!!isFavorite}
                onPress={toggleFavorite}
              />
              <ActionCell
                divider
                icon={
                  <Feather
                    name='check-circle'
                    size={18}
                    color={allPlayed ? NeonBoard.green : NeonBoard.text}
                  />
                }
                label={t("item.played")}
                active={allPlayed}
                accent={NeonBoard.green}
                onPress={() => void togglePlayed(!allPlayed)}
              />
              {!isOffline && itemWithSources ? (
                <DownloadSingleItem
                  item={itemWithSources}
                  label={t("item.download")}
                  divider
                />
              ) : null}
              {trailerLink ? (
                <ActionCell
                  divider
                  icon={
                    <Feather name='film' size={18} color={NeonBoard.text} />
                  }
                  label={t("item.trailer")}
                  onPress={openTrailer}
                />
              ) : null}
            </ActionStrip>
          )}

          {item.Type === "Episode" && <SeasonEpisodesCarousel item={item} />}

          {!isOffline &&
            selectedOptions.mediaSource?.MediaStreams &&
            selectedOptions.mediaSource.MediaStreams.length > 0 && (
              <MediaSourceButton
                selectedOptions={selectedOptions}
                setSelectedOptions={setSelectedOptions}
                item={itemWithSources}
                accent={accent}
                renderTrigger={(open) => (
                  <OptionRows
                    selectedOptions={selectedOptions}
                    onPress={open}
                  />
                )}
              />
            )}

          <OverviewText
            text={item.Overview}
            accent={accent}
            style={{
              paddingHorizontal: Sizes.gutter,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: NeonBoard.line,
            }}
          />

          {item.Type !== "Program" && (
            <>
              {item.Type === "Episode" && !isOffline && (
                <CurrentSeries item={item} className='mb-2' />
              )}

              <ItemPeopleSections item={item} />

              {!isOffline && <SimilarItems itemId={item.Id} accent={accent} />}
            </>
          )}
        </View>
      </ParallaxScrollView>
    </View>
  );
};

// Memoize the mobile component
const MemoizedItemContentMobile = React.memo(ItemContentMobile);

// Exported component that renders TV or mobile version based on platform
export const ItemContent: React.FC<ItemContentProps> = (props) => {
  if (Platform.isTV && ItemContentTV) {
    return <ItemContentTV {...props} />;
  }
  return <MemoizedItemContentMobile {...props} />;
};
