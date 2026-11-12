import { Feather } from "@expo/vector-icons";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useNavigation } from "expo-router";
import { useAtom } from "jotai";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import {
  ItemControlsPending,
  TitleDetailsFailed,
} from "@/components/item/TitleDetailsPending";
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
import { useDownloadActions } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { useSetPageAccent } from "@/utils/atoms/pageAccent";
import { useSettings } from "@/utils/atoms/settings";
import { getItemImage } from "@/utils/getItemImage";
import { reconcileItemPlayOptions } from "@/utils/itemPlayOptions";
import { titleHeaderArt } from "@/utils/titlePageArtwork";
import { AddToWatchlist } from "./AddToWatchlist";
import { ItemHeader } from "./ItemHeader";
import { PlayInRemoteSessionButton } from "./PlayInRemoteSession";

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
  /**
   * Phones: the card whose tap opened the page, drawn until `item` arrives.
   * For display only. `item` and `itemWithSources` are always what the
   * server sent for this title, never a card.
   */
  preview?: BaseItemDto;
  /** Phones: the details did not load while the preview is showing. */
  detailsFailed?: boolean;
  onRetryDetails?: () => void;
  retryingDetails?: boolean;
}

// Mobile-specific implementation
const ItemContentMobile: React.FC<ItemContentProps> = ({
  item: details,
  itemWithSources,
  preview,
  detailsFailed,
  onRetryDetails,
  retryingDetails,
}) => {
  // What is drawn: the title's details, or until they arrive the tapped
  // card's title, artwork and year. Everything that acts on the title (Play,
  // sources and tracks, download, Played, Watchlist, the header buttons)
  // reads `details` and so waits for them.
  const item = details ?? preview;
  const [api] = useAtom(apiAtom);
  const isOffline = useOfflineMode();
  const { getDownloadedItemById } = useDownloadActions();
  // A download pins the tracks it was pulled with, and only the record knows
  // them: resolving against the server media source hands back an index for a
  // stream the local file may not contain.
  const downloadedTracks =
    isOffline && details?.Id
      ? getDownloadedItemById(details.Id)?.userData
      : undefined;
  const { settings } = useSettings();
  const { orientation } = useOrientation();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [_user] = useAtom(userAtom);
  const { t } = useTranslation();

  const headerHeight =
    orientation === ScreenOrientation.OrientationLock.PORTRAIT_UP ? 230 : 200;

  // Use itemWithSources for play settings since it has MediaSources data
  const {
    defaultAudioIndex,
    defaultBitrate,
    defaultMediaSource,
    defaultSubtitleIndex,
  } = useDefaultPlaySettings(itemWithSources ?? details, settings);

  const accent = typeAccent(item);
  useSetPageAccent(item ? accent : undefined);

  const defaults = useMemo<SelectedOptions>(
    () => ({
      bitrate: defaultBitrate,
      mediaSource: defaultMediaSource ?? undefined,
      subtitleIndex:
        downloadedTracks?.subtitleStreamIndex ?? defaultSubtitleIndex ?? -1,
      audioIndex: downloadedTracks?.audioStreamIndex ?? defaultAudioIndex,
    }),
    [
      defaultBitrate,
      defaultMediaSource,
      defaultSubtitleIndex,
      defaultAudioIndex,
      downloadedTracks?.subtitleStreamIndex,
      downloadedTracks?.audioStreamIndex,
    ],
  );
  const [selectedOptions, setOptions] = useState<SelectedOptions | undefined>(
    defaults,
  );
  // A card has no sources or tracks to choose from. When the details arrive
  // on a page that opened on a card, the choices start from the details'
  // defaults within that same render, so Play is never drawn holding choices
  // made before there was anything to choose.
  const [optionsFromDetails, setOptionsFromDetails] = useState(!!details);
  if (details && !optionsFromDetails) {
    setOptionsFromDetails(true);
    setOptions(defaults);
  }
  const selectionEdited = useRef(false);
  const setSelectedOptions = useCallback<
    React.Dispatch<React.SetStateAction<SelectedOptions | undefined>>
  >((next) => {
    selectionEdited.current = true;
    setOptions(next);
  }, []);
  const mediaSources = (itemWithSources ?? details)?.MediaSources;
  useEffect(() => {
    setOptions((current) =>
      reconcileItemPlayOptions(
        current,
        defaults,
        mediaSources,
        selectionEdited.current,
      ),
    );
  }, [defaults, mediaSources]);

  // Header actions need identity and title, not playback-source DTO changes.
  const headerItem = useMemo<BaseItemDto | undefined>(
    () =>
      details?.Id
        ? { Id: details.Id, Type: details.Type, Name: details.Name }
        : undefined,
    [details?.Id, details?.Type, details?.Name],
  );
  const headerReady = !!itemWithSources;
  const headerActions = useMemo(
    () =>
      headerItem && (
        <HeaderButtonGroup>
          {headerItem.Type !== "Program" &&
            !settings.hideRemoteSessionButton && (
              <PlayInRemoteSessionButton
                item={headerItem}
                selectedOptions={selectedOptions}
                size='large'
              />
            )}
          {headerItem.Type !== "Program" &&
            settings.streamyStatsServerUrl &&
            !settings.hideWatchlistsTab && <AddToWatchlist item={headerItem} />}
        </HeaderButtonGroup>
      ),
    [
      headerItem,
      selectedOptions,
      settings.hideRemoteSessionButton,
      settings.streamyStatsServerUrl,
      settings.hideWatchlistsTab,
    ],
  );
  // Bare glyphs over the backdrop — iOS 26 wraps the group in its glass pill.
  useEffect(() => {
    if (!Platform.isTV && headerReady) {
      navigation.setOptions({ headerRight: () => headerActions });
    }
  }, [navigation, headerReady, headerActions]);

  const { isFavorite, toggleFavorite } = useFavorite(details ?? {});
  const allPlayed = !!details?.UserData?.Played;
  const togglePlayed = useMarkAsPlayed(details ? [details] : []);
  const trailerLink = details?.RemoteTrailers?.[0]?.Url;
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
  // Whether the card can name the picture behind the title
  const headerArtOnCard =
    !details && !!api && !!getItemImage({ item, api, ...titleHeaderArt(item) });

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
            {details || headerArtOnCard ? (
              <ItemImage
                // The address a card's tap has already started downloading;
                // drawn as it arrives, without the 0.3 s fade
                {...titleHeaderArt(item)}
                transition={0}
                item={item}
                style={{
                  width: "100%",
                  height: "100%",
                }}
              />
            ) : (
              // The card names no picture for here: left empty until the
              // details say which one, rather than marked as missing
              <View style={{ flex: 1, backgroundColor: NeonBoard.card }} />
            )}
          </View>
        }
      >
        <View className='flex flex-col bg-transparent shrink'>
          <ItemHeader item={item} />

          {!details &&
            (detailsFailed && onRetryDetails ? (
              <TitleDetailsFailed
                onRetry={onRetryDetails}
                retrying={retryingDetails}
              />
            ) : (
              <ItemControlsPending strip={showStrip} />
            ))}

          {details && (
            <View
              className='flex flex-row items-stretch'
              style={{
                paddingHorizontal: Sizes.gutter,
                gap: 10,
                marginTop: 14,
                marginBottom: 12,
              }}
            >
              <PlayButton selectedOptions={selectedOptions} item={details} />
              {!isOffline && (
                <MediaSourceButton
                  selectedOptions={selectedOptions}
                  setSelectedOptions={setSelectedOptions}
                  item={itemWithSources}
                  accent={accent}
                />
              )}
            </View>
          )}

          {details && showStrip && (
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

          {details && item.Type === "Episode" && (
            <SeasonEpisodesCarousel item={item} />
          )}

          {details &&
            !isOffline &&
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

          {/* These wait for the details, as they always have; with the
              details here, `item` is the details */}
          {details && item.Type !== "Program" && (
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
    // The TV page takes what it always took; the rest is for phones
    const { item, itemWithSources, isLoading } = props;
    return (
      <ItemContentTV
        item={item}
        itemWithSources={itemWithSources}
        isLoading={isLoading}
      />
    );
  }
  // The card and the details it stands in for share an id, so the page is
  // one and the same when the details arrive
  const shown = props.item ?? props.preview;
  if (!shown) return null;
  return <MemoizedItemContentMobile key={shown.Id} {...props} />;
};
