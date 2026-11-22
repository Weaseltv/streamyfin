import { useQuery } from "@tanstack/react-query";
import { getLocales } from "expo-localization";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import type { JellyseerrApi } from "@/hooks/useJellyseerr";
import {
  type ActivityRowView,
  detailLine,
} from "@/utils/requestStatus/activityRow";
import {
  type RowMetadata,
  type TitleDetailsLike,
  titleMetadata,
} from "@/utils/requestStatus/metadata";
import type { OwnRequest } from "@/utils/requestStatus/types";
import {
  ActivityPalette,
  ActivityProgress,
  sectionColor,
  WatchNowPill,
} from "./ActivityParts";

export const deviceCountry = () => getLocales()[0]?.regionCode ?? null;

/** Per-title metadata, keyed by scope under its own key root (never in the offline cache). */
export function requestTitleQuery(
  client: JellyseerrApi | undefined,
  scopeKey: string | null,
  request: OwnRequest,
) {
  const tmdbId = request.media?.tmdbId ?? null;
  const type = request.type;
  return {
    queryKey: ["requestStatus", "title", scopeKey, type, tmdbId],
    queryFn: async (): Promise<RowMetadata> => {
      const details = (type === "tv"
        ? await client!.tvDetails(tmdbId!)
        : await client!.movieDetails(tmdbId!)) as unknown as TitleDetailsLike;
      return titleMetadata(details, type, deviceCountry());
    },
    enabled: !!client && !!scopeKey && tmdbId != null,
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  };
}

interface Props {
  view: ActivityRowView;
  client: JellyseerrApi | undefined;
  scopeKey: string | null;
  /** Reconnecting: actions are off. */
  disabled: boolean;
  /** Arriving from a submit or a pop-up: highlighted once. */
  highlighted: boolean;
  onOpen: (view: ActivityRowView, metadata: RowMetadata | undefined) => void;
  onLayout?: (requestId: number, event: LayoutChangeEvent) => void;
}

const sameView = (a: ActivityRowView, b: ActivityRowView) =>
  a.item.request === b.item.request &&
  a.section === b.section &&
  a.stale === b.stale &&
  a.watchable === b.watchable &&
  JSON.stringify([a.status, a.detail, a.progress]) ===
    JSON.stringify([b.status, b.detail, b.progress]);

/** Each row re-renders only when what it shows changed, so a percentage moves one row. */
const sameProps = (a: Props, b: Props) =>
  sameView(a.view, b.view) &&
  a.client === b.client &&
  a.scopeKey === b.scopeKey &&
  a.disabled === b.disabled &&
  a.highlighted === b.highlighted &&
  a.onOpen === b.onOpen &&
  a.onLayout === b.onLayout;

/** One queue row: poster, title, "2019 · Movie · 4K", status, detail, progress or Watch now. */
export const ActivityRow = memo(function ActivityRow({
  view,
  client,
  scopeKey,
  disabled,
  highlighted,
  onOpen,
  onLayout,
}: Props) {
  const { t } = useTranslation();
  const request = view.item.request;
  const { data: metadata } = useQuery(
    requestTitleQuery(client, scopeKey, request),
  );
  const isTv = request.type === "tv";
  const typeColor = isTv ? ActivityPalette.series : ActivityPalette.movie;
  const title =
    metadata?.title ??
    t(
      isTv
        ? "request_status.row.requested_show"
        : "request_status.row.requested_movie",
    );
  const typeWord = t(
    isTv ? "request_status.row.series" : "request_status.row.movie",
  );
  const meta = [
    metadata?.year ?? null,
    typeWord,
    request.is4k ? t("request_status.row.four_k") : null,
  ]
    .filter((p) => p !== null)
    .join(" · ");
  const status = t(view.status.key, view.status.params);
  const detail = detailLine(view, (k, p) => t(k, p));
  const statusColor =
    view.section === "ACTIVE" ? NeonBoard.text : sectionColor(view.section);
  const progressNote =
    !view.watchable && view.progress.kind === "note"
      ? t(view.progress.text.key, view.progress.text.params)
      : null;
  const label = [
    title,
    meta,
    status,
    detail,
    progressNote,
    view.watchable ? t("request_status.row.watch_now") : null,
  ]
    .filter(Boolean)
    .join(", ");
  // The request server only resizes to its configured widths (256, 384, ...);
  // any other width is refused with a 400 and the poster stays empty.
  const poster = metadata?.posterPath
    ? client?.imageProxy(metadata.posterPath, "w300_and_h450_face", 256)
    : null;

  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => onOpen(view, metadata)}
      onLayout={onLayout ? (e) => onLayout(request.id, e) : undefined}
      style={({ pressed }) => [
        styles.row,
        highlighted && { borderColor: sectionColor(view.section) },
        (pressed || disabled) && { opacity: disabled ? 0.55 : 0.8 },
      ]}
    >
      <View style={styles.poster}>
        {poster ? (
          <Image
            source={{ uri: poster }}
            style={styles.posterImage}
            contentFit='cover'
          />
        ) : null}
      </View>
      <View style={styles.middle}>
        <Text variant='body' numberOfLines={1} style={{ fontWeight: "700" }}>
          {title}
        </Text>
        <Text
          variant='caption'
          numberOfLines={1}
          style={{ color: typeColor, fontWeight: "700" }}
        >
          {meta}
        </Text>
        <Text
          variant='caption'
          numberOfLines={1}
          style={{ color: statusColor, fontWeight: "700", marginTop: 2 }}
        >
          {status}
        </Text>
        {detail ? (
          <Text variant='caption' muted numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>
        {view.watchable ? (
          <WatchNowPill solid={view.section === "READY"} />
        ) : (
          <ActivityProgress progress={view.progress} color={typeColor} />
        )}
      </View>
    </Pressable>
  );
}, sameProps);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: NeonBoard.line,
    backgroundColor: NeonBoard.card,
  },
  poster: {
    width: 40,
    height: 60,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: NeonBoard.card2,
  },
  posterImage: { width: 40, height: 60 },
  middle: { flex: 1, minWidth: 0 },
  right: { maxWidth: 120, alignItems: "flex-end" },
});
