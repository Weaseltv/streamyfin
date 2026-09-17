import type { MediaStream } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import type { SelectedOptions } from "@/components/ItemContent";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import { qualityLabel } from "@/utils/mediaQuality";
import { SUBTITLES_OFF } from "@/utils/subtitles/subtitleIndex";

interface Props {
  selectedOptions: SelectedOptions;
  onPress?: () => void;
}

const trackName = (s?: MediaStream) =>
  s?.DisplayTitle ??
  (s?.Language ? `${s.Language}${s.Codec ? ` · ${s.Codec}` : ""}` : undefined);

/** One 40 row: label 13 `mid`, value 13/600. */
export const OptionRow: React.FC<{
  label: string;
  value?: string | null;
  onPress?: () => void;
  last?: boolean;
}> = ({ label, value, onPress, last }) => (
  <Pressable
    onPress={onPress}
    disabled={!onPress}
    style={{
      minHeight: 40,
      paddingHorizontal: Sizes.gutter,
      paddingVertical: 8,
      flexDirection: "row",
      alignItems: "center",
      borderBottomWidth: last ? 0 : 1,
      borderBottomColor: NeonBoard.line,
    }}
  >
    <Text variant='meta' muted style={{ width: 84, fontSize: 13 }}>
      {label}
    </Text>
    <Text
      variant='rowTitle'
      numberOfLines={1}
      style={{ flex: 1, fontSize: 13 }}
    >
      {value ?? "—"}
    </Text>
  </Pressable>
);

/** Quality / Audio / Subtitles rows for the selected media source. */
export const OptionRows: React.FC<Props> = ({ selectedOptions, onPress }) => {
  const { t } = useTranslation();
  const streams = selectedOptions.mediaSource?.MediaStreams ?? [];
  const audio = streams.find(
    (s) => s.Type === "Audio" && s.Index === selectedOptions.audioIndex,
  );
  const subtitle =
    selectedOptions.subtitleIndex === SUBTITLES_OFF ||
    selectedOptions.subtitleIndex === undefined
      ? undefined
      : streams.find(
          (s) =>
            s.Type === "Subtitle" && s.Index === selectedOptions.subtitleIndex,
        );
  const video = qualityLabel({ MediaStreams: streams } as any);
  const quality = [selectedOptions.bitrate?.key, video]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: NeonBoard.line }}>
      <OptionRow
        label={t("item_card.quality")}
        value={quality}
        onPress={onPress}
      />
      <OptionRow
        label={t("item_card.audio")}
        value={
          trackName(audio) ??
          (streams.some((s) => s.Type === "Audio")
            ? t("common.default")
            : undefined)
        }
        onPress={onPress}
      />
      <OptionRow
        label={t("item_card.subtitles.label")}
        value={subtitle ? trackName(subtitle) : t("common.none")}
        onPress={onPress}
        last
      />
    </View>
  );
};
