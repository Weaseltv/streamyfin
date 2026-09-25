import { Feather } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { FlashList } from "@shopify/flash-list";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { Button } from "@/components/Button";
import { ConfirmDeleteHost } from "@/components/common/ConfirmDeleteHost";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHead } from "@/components/common/PageHead";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Text } from "@/components/common/Text";
import ActiveDownloads from "@/components/downloads/ActiveDownloads";
import { DownloadSize } from "@/components/downloads/DownloadSize";
import { MovieCard } from "@/components/downloads/MovieCard";
import {
  EpisodeRow,
  SeriesHeader,
  sortEpisodes,
} from "@/components/downloads/SeriesCard";
import { NeonBoard } from "@/constants/Colors";
import { glowRule, Scrims, Sizes } from "@/constants/neon";
import useRouter from "@/hooks/useAppRouter";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { useDownload } from "@/providers/DownloadProvider";
import { type DownloadedItem } from "@/providers/Downloads/types";
import { OfflineModeProvider } from "@/providers/OfflineModeProvider";
import { useSetPageAccent } from "@/utils/atoms/pageAccent";
import { queueAtom } from "@/utils/atoms/queue";
import { writeToLog } from "@/utils/log";

export default function DownloadsPage() {
  useSetPageAccent(NeonBoard.volt);
  const { t } = useTranslation();
  const [_queue, _setQueue] = useAtom(queueAtom);
  const { downloadedItems, deleteFileByType, deleteAllFiles, processes } =
    useDownload();
  const confirmDelete = useConfirmDelete();
  const router = useRouter();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);

  const [showMigration, setShowMigration] = useState(false);

  const insets = useSafeAreaInsets();

  const migration_20241124 = () => {
    Alert.alert(
      t("home.downloads.new_app_version_requires_re_download"),
      t("home.downloads.new_app_version_requires_re_download_description"),
      [
        {
          text: t("home.downloads.back"),
          style: "cancel",
          onPress: () => {
            setShowMigration(false);
            router.back();
          },
        },
        {
          text: t("home.downloads.delete"),
          style: "destructive",
          onPress: async () => {
            await deleteAllFiles();
            setShowMigration(false);
          },
        },
      ],
    );
  };

  const downloadedFiles = useMemo(() => downloadedItems, [downloadedItems]);

  const movies = useMemo(() => {
    try {
      return downloadedFiles?.filter((f) => f.item.Type === "Movie") || [];
    } catch {
      setShowMigration(true);
      return [];
    }
  }, [downloadedFiles]);

  const groupedBySeries = useMemo(() => {
    try {
      const episodes = downloadedFiles?.filter(
        (f) => f.item.Type === "Episode",
      );
      const series: { [key: string]: DownloadedItem[] } = {};
      episodes?.forEach((e) => {
        if (!series[e.item.SeriesName!]) series[e.item.SeriesName!] = [];
        series[e.item.SeriesName!].push(e);
      });
      return Object.values(series);
    } catch {
      setShowMigration(true);
      return [];
    }
  }, [downloadedFiles]);

  const otherMedia = useMemo(() => {
    try {
      return (
        downloadedFiles?.filter(
          (f) => f.item.Type !== "Movie" && f.item.Type !== "Episode",
        ) || []
      );
    } catch {
      setShowMigration(true);
      return [];
    }
  }, [downloadedFiles]);

  const allItems = useMemo(
    () => downloadedFiles?.map((f) => f.item) || [],
    [downloadedFiles],
  );

  useEffect(() => {
    if (showMigration) {
      migration_20241124();
    }
  }, [showMigration]);

  const deleteMovies = () =>
    deleteFileByType("Movie")
      .then(() =>
        toast.success(
          t("home.downloads.toasts.deleted_all_movies_successfully"),
        ),
      )
      .catch((reason) => {
        writeToLog("ERROR", reason);
        toast.error(t("home.downloads.toasts.failed_to_delete_all_movies"));
      });
  const deleteShows = () =>
    deleteFileByType("Episode")
      .then(() =>
        toast.success(
          t("home.downloads.toasts.deleted_all_series_successfully"),
        ),
      )
      .catch((reason) => {
        writeToLog("ERROR", reason);
        toast.error(t("home.downloads.toasts.failed_to_delete_all_series"));
      });
  const deleteOtherMedia = () =>
    Promise.all(
      otherMedia
        .filter((item) => item.item.Type)
        .map((item) =>
          deleteFileByType(item.item.Type!)
            .then(() =>
              toast.success(
                t("home.downloads.toasts.deleted_media_successfully", {
                  type: item.item.Type,
                }),
              ),
            )
            .catch((reason) => {
              writeToLog("ERROR", reason);
              toast.error(
                t("home.downloads.toasts.failed_to_delete_media", {
                  type: item.item.Type,
                }),
              );
            }),
        ),
    );

  const deleteAllMedia = async () =>
    await Promise.all([deleteMovies(), deleteShows(), deleteOtherMedia()]);

  // Bulk deletes wipe every matching download, so always ask first. The
  // sheet closes so the confirm dialog is the only thing on screen.
  const confirmBulkDelete = (title: string, onConfirm: () => void) => () => {
    bottomSheetModalRef.current?.dismiss();
    confirmDelete({ title, onConfirm });
  };

  const hasDownloads = (downloadedFiles?.length ?? 0) > 0;
  const hasProcesses = (processes?.length ?? 0) > 0;

  // One flat list of typed rows instead of a ScrollView that mapped every
  // movie and every episode of every series: 500 downloaded episodes meant
  // 500 mounted rows, each with its own size lookup and press handlers.
  const rows = useMemo<DownloadRow[]>(() => {
    const out: DownloadRow[] = [];
    if (movies.length > 0) {
      out.push({
        kind: "heading",
        key: "h-movies",
        section: "movies",
        count: movies.length,
      });
      for (const m of movies)
        out.push({ kind: "item", key: `m-${m.item.Id}`, item: m.item });
    }
    for (const group of groupedBySeries) {
      const items = group.map((g) => g.item);
      const seriesKey = items[0].SeriesId ?? items[0].SeriesName ?? "";
      out.push({ kind: "series", key: `s-${seriesKey}`, items });
      for (const ep of sortEpisodes(items))
        out.push({ kind: "episode", key: `e-${ep.Id}`, item: ep });
    }
    if (otherMedia.length > 0) {
      out.push({
        kind: "heading",
        key: "h-other",
        section: "other",
        count: otherMedia.length,
      });
      for (const o of otherMedia)
        out.push({ kind: "item", key: `o-${o.item.Id}`, item: o.item });
    }
    return out;
  }, [movies, groupedBySeries, otherMedia]);

  const renderRow = useCallback(
    ({ item: row }: { item: DownloadRow }) => {
      switch (row.kind) {
        case "heading":
          return (
            <SectionHeader
              title={t(
                row.section === "movies"
                  ? "home.downloads.movies"
                  : "home.downloads.other_media",
              )}
              accent={
                row.section === "movies" ? NeonBoard.orange : NeonBoard.volt
              }
              count={row.count}
              className='px-4'
              bleedRule
            />
          );
        case "item":
          return <MovieCard item={row.item} />;
        case "series":
          return <SeriesHeader items={row.items} />;
        case "episode":
          return <EpisodeRow item={row.item} />;
      }
    },
    [t],
  );

  return (
    <OfflineModeProvider isOffline={true}>
      <View style={{ flex: 1, backgroundColor: NeonBoard.stage }}>
        <FlashList
          data={rows}
          keyExtractor={rowKey}
          getItemType={rowType}
          renderItem={renderRow}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior='automatic'
          contentContainerStyle={{
            paddingBottom: 32,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          }}
          ListHeaderComponent={
            <>
              <PageHead
                eyebrow={`${t("tabs.home")} · ${t("home.downloads.offline_library")}`}
                title={t("home.downloads.downloads_title")}
                right={
                  hasDownloads ? (
                    <TouchableOpacity
                      onPress={() => bottomSheetModalRef.current?.present()}
                      accessibilityRole='button'
                      accessibilityLabel={t("home.downloads.manage_title")}
                      hitSlop={8}
                      style={{ paddingLeft: 12 }}
                    >
                      <DownloadSize
                        items={allItems}
                        variant='tally'
                        accent={NeonBoard.volt}
                      />
                    </TouchableOpacity>
                  ) : null
                }
                style={{ marginBottom: 4 }}
                bleedRule
              />

              <ActiveDownloads />
            </>
          }
          ListEmptyComponent={
            !hasDownloads && !hasProcesses ? (
              <EmptyState
                icon='download'
                title={t("home.downloads.no_downloaded_items")}
                detail={t("home.downloads.no_downloaded_items_detail")}
              />
            ) : null
          }
        />
        <ConfirmDeleteHost />
      </View>
      <BottomSheetModal
        ref={bottomSheetModalRef}
        enableDynamicSizing
        handleIndicatorStyle={{ backgroundColor: "transparent" }}
        backgroundStyle={{
          backgroundColor: NeonBoard.card,
          borderRadius: 0,
          borderTopWidth: 1,
          borderTopColor: NeonBoard.line2,
        }}
        backdropComponent={(props: BottomSheetBackdropProps) => (
          <BottomSheetBackdrop
            {...props}
            disappearsOnIndex={-1}
            appearsOnIndex={0}
            opacity={1}
            style={[props.style, { backgroundColor: Scrims.modal }]}
          />
        )}
      >
        <BottomSheetView style={{ paddingBottom: insets.bottom + 16 }}>
          {/* Head: red tally, eyebrow + title, close, 2pt rule */}
          <View
            style={{
              paddingLeft: Sizes.rowLead,
              paddingRight: Sizes.gutter,
              paddingTop: 14,
              paddingBottom: 10,
            }}
          >
            <View
              style={[
                {
                  position: "absolute",
                  left: 0,
                  top: 14,
                  bottom: 10,
                  width: Sizes.tally,
                  backgroundColor: NeonBoard.red,
                },
                glowRule(NeonBoard.red),
              ]}
            />
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-end",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flexShrink: 1 }}>
                <Text
                  variant='eyebrow'
                  accent={NeonBoard.red}
                  numberOfLines={1}
                >
                  {t("home.downloads.downloads_title")}
                </Text>
                <Text
                  variant='pageTitle'
                  numberOfLines={1}
                  style={{ marginTop: 2 }}
                >
                  {t("home.downloads.manage_title")}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => bottomSheetModalRef.current?.dismiss()}
                accessibilityRole='button'
                accessibilityLabel={t("common.close")}
                hitSlop={8}
                style={{ paddingLeft: 12 }}
              >
                <Feather name='x' size={22} color={NeonBoard.mid} />
              </TouchableOpacity>
            </View>
          </View>
          <View
            style={[
              { height: 2, backgroundColor: NeonBoard.red },
              glowRule(NeonBoard.red),
            ]}
          />
          <View
            style={{
              paddingHorizontal: Sizes.gutter,
              paddingTop: 16,
              gap: 10,
            }}
          >
            <Button
              variant='border'
              color='white'
              onPress={confirmBulkDelete(
                t("home.downloads.delete_all_movies_button"),
                deleteMovies,
              )}
            >
              {t("home.downloads.delete_all_movies_button")}
            </Button>
            <Button
              variant='border'
              color='white'
              onPress={confirmBulkDelete(
                t("home.downloads.delete_all_series_button"),
                deleteShows,
              )}
            >
              {t("home.downloads.delete_all_series_button")}
            </Button>
            {otherMedia.length > 0 && (
              <Button
                variant='border'
                color='white'
                onPress={confirmBulkDelete(
                  t("home.downloads.delete_all_other_media_button"),
                  deleteOtherMedia,
                )}
              >
                {t("home.downloads.delete_all_other_media_button")}
              </Button>
            )}
            <Button
              color='red'
              onPress={confirmBulkDelete(
                t("home.downloads.delete_all_button"),
                deleteAllMedia,
              )}
            >
              {t("home.downloads.delete_all_button")}
            </Button>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    </OfflineModeProvider>
  );
}

type DownloadRow =
  | { kind: "heading"; key: string; section: "movies" | "other"; count: number }
  | { kind: "item"; key: string; item: BaseItemDto }
  | { kind: "series"; key: string; items: BaseItemDto[] }
  | { kind: "episode"; key: string; item: BaseItemDto };

const rowKey = (row: DownloadRow) => row.key;
const rowType = (row: DownloadRow) => row.kind;
