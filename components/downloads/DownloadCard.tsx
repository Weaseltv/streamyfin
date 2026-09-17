import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  TouchableOpacity,
  type TouchableOpacityProps,
  View,
} from "react-native";
import { toast } from "sonner-native";
import { Badge } from "@/components/Badge";
import { NeonProgress } from "@/components/common/NeonProgress";
import { Text } from "@/components/common/Text";
import { NeonBoard, typeAccent, typeLabel } from "@/constants/Colors";
import { glowRule, Sizes } from "@/constants/neon";
import useRouter from "@/hooks/useAppRouter";
import { useNetworkAwareQueryClient } from "@/hooks/useNetworkAwareQueryClient";
import { useDownload } from "@/providers/DownloadProvider";
import { calculateSmoothedETA } from "@/providers/Downloads/hooks/useDownloadSpeedCalculator";
import { JobStatus } from "@/providers/Downloads/types";
import { estimateDownloadSize } from "@/utils/download";
import { storage } from "@/utils/mmkv";

const POSTER = { w: 40, h: 58 };
const ACTIVE_ROW = 76;
const QUEUE_ROW = 60;
const PROGRESS_WIDTH = 200;

const bytesToMB = (bytes: number) => {
  return bytes / 1024 / 1024;
};

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
};

/** "4 min left" / "12 sec left" style remaining time. */
const formatRemaining = (seconds: number): string => {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return `${h} h ${m} min`;
  }
  if (seconds >= 60) return `${Math.round(seconds / 60)} min`;
  return `${Math.max(1, Math.round(seconds))} sec`;
};

const rowTitle = (process: JobStatus) =>
  process.item.Type === "Episode" && process.item.SeriesName
    ? `${process.item.SeriesName} · S${process.item.ParentIndexNumber ?? 0}:E${process.item.IndexNumber ?? 0}`
    : (process.item.Name ?? "");

interface DownloadCardProps extends TouchableOpacityProps {
  process: JobStatus;
}

/**
 * One in-flight download. Downloading = the 76 "active" row: 3pt type tally,
 * 40×58 poster, title + type badge, "412 MB of 1.2 GB · 3.1 MB/s · 4 min
 * left", a 200-wide 3pt progress in the type colour and a red `x` to cancel.
 * Queued = the 60 row with a `Queued` outline badge in `mid`.
 */
export const DownloadCard = ({ process, ...props }: DownloadCardProps) => {
  const { t } = useTranslation();
  const { cancelDownload } = useDownload();
  const router = useRouter();
  const queryClient = useNetworkAwareQueryClient();

  const handleDelete = async (id: string) => {
    try {
      await cancelDownload(id);
      // cancelDownload already shows a toast, so don't show another one
      queryClient.invalidateQueries({ queryKey: ["downloads"] });
    } catch (error) {
      console.error("Error deleting download:", error);
      toast.error(t("home.downloads.toasts.could_not_delete_download"));
    }
  };

  const eta = useMemo(() => {
    if (!process?.estimatedTotalSizeBytes || !process?.bytesDownloaded) {
      return null;
    }

    const secondsRemaining = calculateSmoothedETA(
      process.id,
      process.bytesDownloaded,
      process.estimatedTotalSizeBytes,
    );

    if (!secondsRemaining || secondsRemaining <= 0) {
      return null;
    }

    return formatRemaining(secondsRemaining);
  }, [process?.id, process?.bytesDownloaded, process?.estimatedTotalSizeBytes]);

  const estimatedSize = useMemo(() => {
    if (process?.estimatedTotalSizeBytes)
      return process.estimatedTotalSizeBytes;

    // Calculate from bitrate + duration (only if bitrate value is defined)
    if (process?.maxBitrate?.value && process?.item?.RunTimeTicks) {
      return estimateDownloadSize(
        process.maxBitrate.value,
        process.item.RunTimeTicks,
      );
    }

    return undefined;
  }, [
    process?.maxBitrate?.value,
    process?.item?.RunTimeTicks,
    process?.estimatedTotalSizeBytes,
  ]);

  const isTranscoding = process?.isTranscoding || false;

  const base64Image = useMemo(() => {
    try {
      const itemId = process?.item?.Id;
      if (!itemId) return undefined;
      return storage.getString(itemId);
    } catch {
      return undefined;
    }
  }, [process?.item?.Id]);

  // Sanitize progress to ensure it's within valid bounds
  const sanitizedProgress = useMemo(() => {
    if (
      typeof process?.progress !== "number" ||
      Number.isNaN(process.progress)
    ) {
      return 0;
    }
    return Math.max(0, Math.min(100, process.progress));
  }, [process?.progress]);

  // Return null after all hooks have been called
  if (!process?.item?.Id) {
    return null;
  }

  const accent = typeAccent(process.item);
  const badge = typeLabel(process.item);
  const active = process.status === "downloading";
  const totalText = estimatedSize
    ? `${isTranscoding ? "~" : ""}${formatBytes(estimatedSize)}`
    : null;

  const meta = active
    ? [
        process.bytesDownloaded
          ? totalText
            ? t("home.downloads.of_total", {
                downloaded: formatBytes(process.bytesDownloaded),
                total: totalText,
              })
            : formatBytes(process.bytesDownloaded)
          : `${sanitizedProgress.toFixed(0)}%`,
        process.speed && process.speed > 0
          ? `${bytesToMB(process.speed).toFixed(1)} MB/s`
          : null,
        eta ? t("home.downloads.time_left", { time: eta }) : null,
        isTranscoding ? t("home.downloads.transcoding") : null,
      ]
    : [t("home.downloads.live_activity.queued"), totalText];

  const poster = (
    <View
      style={{
        width: POSTER.w,
        height: POSTER.h,
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
          name={process.item.Type === "Movie" ? "film" : "tv"}
          size={16}
          color={NeonBoard.low}
        />
      )}
    </View>
  );

  return (
    <TouchableOpacity
      onPress={() => router.push(`/(auth)/items/page?id=${process.item.Id}`)}
      activeOpacity={0.7}
      style={{
        minHeight: active ? ACTIVE_ROW : QUEUE_ROW,
        flexDirection: "row",
        alignItems: "center",
        paddingLeft: Sizes.rowLead,
        paddingRight: Sizes.gutter,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: NeonBoard.line,
      }}
      {...props}
    >
      {active ? (
        <View
          style={[
            {
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: Sizes.tally,
              backgroundColor: accent,
            },
            glowRule(accent),
          ]}
        />
      ) : null}
      {poster}
      <View style={{ flex: 1, marginLeft: 12, marginRight: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text
            variant='rowTitle'
            numberOfLines={1}
            style={{ flexShrink: 1, fontSize: 16 }}
          >
            {rowTitle(process)}
          </Text>
          {active && badge ? <Badge text={badge} tint={accent} glow /> : null}
        </View>
        <Text variant='meta' muted numberOfLines={1} style={{ marginTop: 3 }}>
          {meta.filter(Boolean).join(" · ")}
        </Text>
        {active ? (
          <NeonProgress
            progress={sanitizedProgress / 100}
            color={accent}
            style={{ width: PROGRESS_WIDTH, maxWidth: "100%", marginTop: 8 }}
          />
        ) : null}
      </View>
      {active ? (
        <TouchableOpacity
          onPress={() => handleDelete(process.id)}
          hitSlop={10}
          accessibilityRole='button'
          accessibilityLabel={t("common.cancel")}
          style={{
            width: Sizes.iconButton,
            height: Sizes.iconButton,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name='x' size={22} color={NeonBoard.red} />
        </TouchableOpacity>
      ) : (
        <Badge text={t("home.downloads.live_activity.queued")} />
      )}
    </TouchableOpacity>
  );
};
