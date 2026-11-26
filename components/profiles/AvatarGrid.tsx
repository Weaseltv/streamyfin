import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type LayoutChangeEvent, Pressable, View } from "react-native";
import { NeonBoard } from "@/constants/Colors";
import { AVATAR_SOURCES } from "@/utils/avatars/avatarSources";

const GAP = 12;
const MIN_TILE = 72;
const MAX_COLUMNS = 8;

interface Props {
  ids: readonly string[];
  /** The avatar marked as current (or picked), if any. */
  selected: string | null;
  disabled?: boolean;
  onPick: (avatarId: string) => void;
}

/**
 * The bundled avatars as a wrapping grid (port of the TV's `AvatarPickerView` grid): four or more
 * per row depending on the width, the current one ringed and ticked.
 */
export function AvatarGrid({ ids, selected, disabled = false, onPick }: Props) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(0);
  const columns = Math.min(
    MAX_COLUMNS,
    Math.max(4, Math.floor((width + GAP) / (MIN_TILE + GAP + 24))),
  );
  const tile =
    width > 0 ? Math.floor((width - GAP * (columns - 1)) / columns) : 0;

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}
    >
      {tile > 0 &&
        ids.map((id) => {
          const isSelected = id === selected;
          return (
            <Pressable
              key={id}
              disabled={disabled}
              onPress={() => onPick(id)}
              accessibilityRole='button'
              accessibilityLabel={id.replace(/-/g, " ")}
              accessibilityState={{ selected: isSelected, disabled }}
              style={({ pressed }) => ({
                width: tile,
                height: tile,
                borderRadius: 16,
                borderWidth: 3,
                borderColor: isSelected ? NeonBoard.volt : "transparent",
                opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
                overflow: "hidden",
              })}
            >
              <Image
                source={AVATAR_SOURCES[id]}
                style={{ width: "100%", height: "100%" }}
                contentFit='cover'
                transition={0}
              />
              {isSelected && (
                <View
                  accessibilityLabel={t("profiles.picture.current_picture")}
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: NeonBoard.volt,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name='checkmark'
                    size={16}
                    color={NeonBoard.onAccent}
                  />
                </View>
              )}
            </Pressable>
          );
        })}
    </View>
  );
}
