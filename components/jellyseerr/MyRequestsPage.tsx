import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, SectionList, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { Button } from "@/components/Button";
import { Chip } from "@/components/common/Chip";
import { PageHead } from "@/components/common/PageHead";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { getItemNavigation } from "@/components/common/TouchableItemRouter";
import { SearchTabButtons } from "@/components/search/SearchTabButtons";
import { NeonBoard, sectionAccent } from "@/constants/Colors";
import useRouter from "@/hooks/useAppRouter";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { useRequestStatus } from "@/providers/RequestStatusProvider";
import type { MovieDetails } from "@/utils/jellyseerr/server/models/Movie";
import type { TvDetails } from "@/utils/jellyseerr/server/models/Tv";
import {
  deriveRequestStage,
  matchingRequestItemId,
  type RequestStage,
  type RequestStatusRow,
  readyStage,
  terminalStage,
} from "@/utils/requestStatus";

function StageLabel({ stage }: { stage: RequestStage }) {
  const { t } = useTranslation();
  const key =
    stage.reason === "declined"
      ? "declined"
      : stage.reason === "unavailable"
        ? "unavailable"
        : stage.kind.toLowerCase();
  return (
    <Text
      style={{
        color: readyStage(stage) ? sectionAccent("requests") : NeonBoard.text,
      }}
    >
      {t(`request_status.${key}`, {
        percent: Math.floor((stage.progress ?? 0) * 100),
      })}
    </Text>
  );
}
function RequestCard({
  row,
  highlighted,
}: {
  row: RequestStatusRow;
  highlighted: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const status = useRequestStatus();
  const { jellyseerrApi, jellyseerrRegion } = useJellyseerr();
  const { request } = row;
  const [cancelling, setCancelling] = useState(false);
  const details = useQuery<MovieDetails | TvDetails>({
    queryKey: [
      "own-request-metadata",
      status.scope,
      request.type,
      request.media?.tmdbId,
    ],
    queryFn: () =>
      request.type === "tv"
        ? jellyseerrApi!.tvDetails(request.media!.tmdbId!)
        : jellyseerrApi!.movieDetails(request.media!.tmdbId!),
    enabled: !!jellyseerrApi && !!request.media?.tmdbId,
    staleTime: 6 * 60 * 60_000,
    retry: false,
  });
  const data = details.data;
  const title =
    (data && ("title" in data ? data.title : data.name)) ||
    t(request.type === "tv" ? "request_status.show" : "request_status.movie");
  const release =
    data && ("releaseDate" in data ? data.releaseDate : data.firstAirDate);
  const regionalDates =
    data && "releases" in data
      ? ((
          data.releases as
            | {
                results?: {
                  iso_3166_1: string;
                  release_dates: { type: number; release_date: string }[];
                }[];
              }
            | undefined
        )?.results?.find((r) => r.iso_3166_1 === jellyseerrRegion)
          ?.release_dates ?? [])
      : [];
  const homeDates = regionalDates
    .filter((r) => [4, 5].includes(r.type))
    .map((r) => r.release_date?.slice(0, 10))
    .filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const availabilityDate = homeDates[0] ?? release;
  const derived = row.fresh
    ? deriveRequestStage(
        request,
        request.type === "movie" ? availabilityDate : undefined,
      )
    : row.stage;
  const libraryId = matchingRequestItemId(request);
  const eta = derived.eta
    ? Math.max(1, Math.ceil((derived.eta - Date.now()) / 60_000))
    : undefined;
  const [confirmCancel, setConfirmCancel] = useState(false);
  useEffect(() => {
    if (!confirmCancel) return;
    Alert.alert(
      t("request_status.cancel"),
      t("request_status.cancel_confirm"),
      [
        {
          text: t("request_status.dismiss"),
          style: "cancel",
          onPress: () => setConfirmCancel(false),
        },
        {
          text: t("request_status.cancel"),
          style: "destructive",
          onPress: () => {
            setConfirmCancel(false);
            setCancelling(true);
            void status
              .cancel(row)
              .catch(() => toast.error(t("request_status.cancel_error")))
              .finally(() => setCancelling(false));
          },
        },
      ],
    );
  }, [confirmCancel]);
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 12,
        padding: 14,
        gap: 10,
        borderWidth: highlighted ? 2 : 1,
        borderColor: highlighted ? sectionAccent("requests") : NeonBoard.line,
        backgroundColor: NeonBoard.card,
      }}
    >
      <View style={{ flexDirection: "row", gap: 12 }}>
        {data?.posterPath ? (
          <Image
            source={{
              uri: jellyseerrApi?.imageProxy(data.posterPath, "w185", 185),
            }}
            style={{ width: 64, height: 96 }}
          />
        ) : null}
        <View style={{ flex: 1, gap: 6 }}>
          <Text numberOfLines={2}>
            {title}
            {release ? ` (${release.slice(0, 4)})` : ""}
            {request.is4k ? " · 4K" : ""}
          </Text>
          <StageLabel stage={derived} />
          {derived.detail ? (
            <StageLabel
              stage={{ ...derived, kind: derived.detail, detail: undefined }}
            />
          ) : null}
          {derived.kind === "UNRELEASED" && availabilityDate ? (
            <Text muted>
              {t("request_status.coming", { date: availabilityDate })}
            </Text>
          ) : null}
          {!row.fresh ? (
            <Text muted>{t("request_status.last_known")}</Text>
          ) : null}
          {request.createdAt ? (
            <Text muted>
              {t("request_status.requested", {
                date: new Date(request.createdAt).toLocaleDateString(),
              })}
            </Text>
          ) : null}
        </View>
      </View>
      {derived.progress !== undefined ? (
        <View
          accessible
          accessibilityRole='progressbar'
          accessibilityLabel={t("request_status.download_progress")}
          accessibilityValue={{
            min: 0,
            max: 100,
            now: Math.floor(derived.progress * 100),
          }}
          style={{ height: 5, backgroundColor: NeonBoard.line }}
        >
          <View
            style={{
              height: 5,
              width: `${derived.progress * 100}%`,
              backgroundColor: sectionAccent("requests"),
            }}
          />
        </View>
      ) : null}
      {eta ? (
        <Text muted>{t("request_status.minutes", { count: eta })}</Text>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {readyStage(derived) && libraryId ? (
          <Button
            onPress={() =>
              router.push(
                getItemNavigation(
                  {
                    Id: libraryId,
                    Type: request.type === "tv" ? "Series" : "Movie",
                  },
                  "(search)",
                ),
              )
            }
          >
            {t("request_status.watch")}
          </Button>
        ) : null}
        {request.media?.tmdbId ? (
          <Button
            variant='border'
            onPress={() =>
              router.push({
                pathname: "/jellyseerr/page",
                params: {
                  id: request.media!.tmdbId!,
                  mediaType: request.type,
                  mediaTitle: title,
                  releaseYear: release?.slice(0, 4),
                  posterSrc: data?.posterPath
                    ? jellyseerrApi?.imageProxy(data.posterPath, "w185", 185)
                    : undefined,
                },
              })
            }
          >
            {t("request_status.details")}
          </Button>
        ) : null}
        {request.status === 1 ? (
          <Button
            variant='border'
            disabled={cancelling}
            onPress={() => setConfirmCancel(true)}
          >
            {t("request_status.cancel")}
          </Button>
        ) : null}
      </View>
    </View>
  );
}
export function MyRequestsPage({
  requestId,
  onDiscover,
  onLibrary,
}: {
  requestId?: number;
  onDiscover(): void;
  onLibrary(): void;
}) {
  const state = useRequestStatus();
  const { setVisible } = state;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const list = useRef<SectionList<RequestStatusRow>>(null);
  const scrolled = useRef<string>("");
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  // Stable visibility callback avoids a poll-state update repeatedly mounting this effect.
  const visibleRef = useRef(setVisible);
  visibleRef.current = setVisible;
  useFocusEffect(
    useCallback(() => {
      visibleRef.current(1);
      return () => visibleRef.current(-1);
    }, []),
  );
  const sections = useMemo(() => {
    const rows = state.rows.filter(
      (r) =>
        !terminalStage(r.stage) ||
        !r.request.updatedAt ||
        Date.parse(r.request.updatedAt) >= Date.now() - 30 * 24 * 60 * 60_000 ||
        r.request.id === requestId,
    );
    return [
      {
        title: t("request_status.ready_section"),
        data: rows.filter((r) => readyStage(r.stage)),
      },
      {
        title: t("request_status.progress_section"),
        data: rows.filter(
          (r) => !readyStage(r.stage) && r.stage.kind !== "FAILED",
        ),
      },
      {
        title: t("request_status.attention_section"),
        data: rows.filter((r) => r.stage.kind === "FAILED"),
      },
    ].filter((s) => s.data.length);
  }, [state.rows, requestId, t]);
  const scroll = useCallback(() => {
    const identity = `${state.scope}|${requestId}`;
    if (!requestId || scrolled.current === identity) return;
    const sectionIndex = sections.findIndex((s) =>
      s.data.some((r) => r.request.id === requestId),
    );
    if (sectionIndex < 0) return;
    const itemIndex = sections[sectionIndex]!.data.findIndex(
      (r) => r.request.id === requestId,
    );
    list.current?.scrollToLocation({
      sectionIndex,
      itemIndex,
      viewPosition: 0.2,
      animated: true,
    });
    scrolled.current = identity;
  }, [sections, requestId, state.scope]);
  useEffect(() => {
    const timer = setTimeout(scroll, 300);
    return () => clearTimeout(timer);
  }, [scroll]);
  return (
    <View
      style={{
        flex: 1,
        paddingTop: insets.top,
        backgroundColor: NeonBoard.stage,
      }}
    >
      <SectionList
        ref={list}
        sections={sections}
        keyExtractor={(row) => String(row.request.id)}
        refreshing={state.refreshing}
        onRefresh={state.refresh}
        stickySectionHeadersEnabled={false}
        onScrollToIndexFailed={(info) => {
          list.current?.getScrollResponder()?.scrollTo({
            y: Math.max(0, info.averageItemLength * info.index),
            animated: true,
          });
          scrolled.current = "";
          setTimeout(scroll, 300);
        }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        ListHeaderComponent={
          <View style={{ gap: 12, paddingBottom: 16 }}>
            <PageHead
              title={t("request_status.my_requests")}
              eyebrow={t("search.discover")}
              accent={sectionAccent("requests")}
            />
            <View style={{ paddingHorizontal: 16, gap: 12 }}>
              <SearchTabButtons
                searchType='Discover'
                setSearchType={(type) =>
                  type === "Library" ? onLibrary() : onDiscover()
                }
                t={t}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Chip
                  style={{ minHeight: 44 }}
                  label={t("request_status.discover")}
                  onPress={onDiscover}
                />
                <Chip
                  style={{ minHeight: 44 }}
                  label={t("request_status.my_requests")}
                  selected
                />
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text>{t("request_status.notifications")}</Text>
                <Switch
                  accessibilityLabel={t("request_status.notifications")}
                  value={state.notifications}
                  onValueChange={state.toggleNotifications}
                />
              </View>
              <Text muted>
                {state.loading
                  ? t("request_status.loading")
                  : state.error
                    ? t("request_status.load_error")
                    : state.updatedAt
                      ? t("request_status.updated", {
                          count: Math.max(
                            0,
                            Math.floor((Date.now() - state.updatedAt) / 60_000),
                          ),
                        })
                      : t("request_status.not_connected")}
              </Text>
              {state.updatedAt && !state.complete ? (
                <Text muted>{t("request_status.incomplete")}</Text>
              ) : null}
              <Button variant='border' onPress={state.refresh}>
                {t("request_status.refresh")}
              </Button>
              {!state.loading &&
              !state.error &&
              state.complete &&
              !state.rows.length ? (
                <Text muted>{t("request_status.empty")}</Text>
              ) : null}
              {!state.loading && state.rows.length > 0 && !sections.length ? (
                <Text muted>{t("request_status.old_requests")}</Text>
              ) : null}
            </View>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={{ padding: 16 }}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <RequestCard row={item} highlighted={item.request.id === requestId} />
        )}
      />
    </View>
  );
}
