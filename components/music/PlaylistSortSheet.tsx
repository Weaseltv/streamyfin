import { Feather } from "@expo/vector-icons";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  NeonSheetHead,
  neonSheetModalProps,
} from "@/components/common/NeonSheet";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { glowRule, Sizes } from "@/constants/neon";

export type PlaylistSortOption = "SortName" | "DateCreated";

export type PlaylistSortOrder = "Ascending" | "Descending";

interface Props {
  open: boolean;
  setOpen: (open: boolean) => void;
  sortBy: PlaylistSortOption;
  sortOrder: PlaylistSortOrder;
  onSortChange: (
    sortBy: PlaylistSortOption,
    sortOrder: PlaylistSortOrder,
  ) => void;
}

const SORT_OPTIONS: {
  key: PlaylistSortOption;
  label: string;
  icon: keyof typeof Feather.glyphMap;
}[] = [
  { key: "SortName", label: "music.sort.alphabetical", icon: "type" },
  { key: "DateCreated", label: "music.sort.date_created", icon: "clock" },
];

export const PlaylistSortSheet: React.FC<Props> = ({
  open,
  setOpen,
  sortBy,
  sortOrder,
  onSortChange,
}) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const snapPoints = useMemo(() => ["40%"], []);

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

  const handleSortSelect = useCallback(
    (option: PlaylistSortOption) => {
      // If selecting same option, toggle order; otherwise use sensible default
      if (option === sortBy) {
        onSortChange(
          option,
          sortOrder === "Ascending" ? "Descending" : "Ascending",
        );
      } else {
        // Default order based on sort type
        const defaultOrder: PlaylistSortOrder =
          option === "SortName" ? "Ascending" : "Descending";
        onSortChange(option, defaultOrder);
      }
      setOpen(false);
    },
    [sortBy, sortOrder, onSortChange, setOpen],
  );

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      index={0}
      snapPoints={snapPoints}
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
          eyebrow={t("music.tabs.playlists")}
          title={t("music.sort.title")}
          onClose={() => setOpen(false)}
        />
        <View>
          {SORT_OPTIONS.map((option) => {
            const isSelected = sortBy === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                onPress={() => handleSortSelect(option.key)}
                accessibilityRole='button'
                accessibilityState={{ selected: isSelected }}
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
                {isSelected && (
                  <View
                    style={[
                      {
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: Sizes.tally,
                        backgroundColor: NeonBoard.volt,
                      },
                      glowRule(NeonBoard.volt),
                    ]}
                  />
                )}
                <Feather
                  name={option.icon}
                  size={18}
                  color={isSelected ? NeonBoard.volt : NeonBoard.mid}
                />
                <Text
                  variant='rowTitle'
                  style={{
                    marginLeft: 14,
                    flex: 1,
                    color: isSelected ? NeonBoard.volt : NeonBoard.text,
                  }}
                >
                  {t(option.label)}
                </Text>
                {isSelected && (
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Feather
                      name={
                        sortOrder === "Ascending" ? "arrow-up" : "arrow-down"
                      }
                      size={16}
                      color={NeonBoard.volt}
                    />
                    <Feather
                      name='check'
                      size={18}
                      color={NeonBoard.volt}
                      style={{ marginLeft: 10 }}
                    />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
};
