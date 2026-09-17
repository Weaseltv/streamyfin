import type { MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client/models";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity, View } from "react-native";
import { Text } from "./common/Text";
import {
  DropdownTrigger,
  type OptionGroup,
  PlatformDropdown,
} from "./PlatformDropdown";

interface Props extends React.ComponentProps<typeof View> {
  source?: MediaSourceInfo;
  onChange: (value: number) => void;
  selected?: number | undefined;
}

export const AudioTrackSelector: React.FC<Props> = ({
  source,
  onChange,
  selected,
  ...props
}) => {
  const isTv = Platform.isTV;
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  const audioStreams = useMemo(
    () => source?.MediaStreams?.filter((x) => x.Type === "Audio"),
    [source],
  );

  const selectedAudioSteam = useMemo(
    () => audioStreams?.find((x) => x.Index === selected),
    [audioStreams, selected],
  );

  const optionGroups: OptionGroup[] = useMemo(
    () => [
      {
        options:
          audioStreams?.map((audio, idx) => ({
            type: "radio" as const,
            label: audio.DisplayTitle || `Audio Stream ${idx + 1}`,
            value: audio.Index ?? idx,
            selected: audio.Index === selected,
            onPress: () => {
              if (audio.Index !== null && audio.Index !== undefined) {
                onChange(audio.Index);
              }
            },
          })) || [],
      },
    ],
    [audioStreams, selected, onChange],
  );

  const handleOptionSelect = () => {
    setOpen(false);
  };

  const trigger = (
    <View className='flex flex-col' {...props}>
      <Text variant='meta' muted style={{ marginBottom: 4 }}>
        {t("item_card.audio")}
      </Text>
      <TouchableOpacity onPress={() => setOpen(true)} activeOpacity={0.7}>
        <DropdownTrigger value={selectedAudioSteam?.DisplayTitle} />
      </TouchableOpacity>
    </View>
  );

  if (isTv) return null;

  return (
    <PlatformDropdown
      groups={optionGroups}
      trigger={trigger}
      title={t("item_card.audio")}
      open={open}
      onOpenChange={setOpen}
      onOptionSelect={handleOptionSelect}
      expoUIConfig={{
        hostStyle: { flex: 1 },
      }}
      bottomSheetConfig={{
        enablePanDownToClose: true,
      }}
    />
  );
};
