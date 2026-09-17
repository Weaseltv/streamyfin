import { BottomSheetModal } from "@gorhom/bottom-sheet";
import type React from "react";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
import {
  NeonSheet,
  NeonSheetRow,
  neonSheetModalProps,
} from "@/components/common/NeonSheet";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";

interface LibraryOptions {
  display: "row" | "list";
  imageStyle: "poster" | "cover";
  showTitles: boolean;
  showStats: boolean;
}

interface Props extends ViewProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  settings: LibraryOptions;
  updateSettings: (options: Partial<LibraryOptions>) => void;
  disabled?: boolean;
}

/** A section label on the panel: Condensed 14 in `mid`, above its rows. */
const OptionGroup: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <View>
    <View
      style={{
        paddingLeft: Sizes.rowLead,
        paddingRight: Sizes.gutter,
        paddingTop: 16,
        paddingBottom: 6,
      }}
    >
      <Text variant='tally' muted>
        {title}
      </Text>
    </View>
    {children}
  </View>
);

const OptionItem: React.FC<{
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}> = ({ label, selected, onPress, disabled: itemDisabled }) => (
  <NeonSheetRow
    label={label}
    selected={selected}
    onPress={onPress}
    disabled={itemDisabled}
  />
);

const ToggleItem: React.FC<{
  label: string;
  value: boolean;
  onToggle: () => void;
  disabled?: boolean;
}> = ({ label, value, onToggle, disabled: itemDisabled }) => (
  <NeonSheetRow
    label={label}
    onPress={onToggle}
    disabled={itemDisabled}
    right={
      <SettingSwitch
        value={value}
        onValueChange={onToggle}
        disabled={itemDisabled}
      />
    }
  />
);

/**
 * LibraryOptionsSheet Component
 *
 * This component creates a bottom sheet modal for managing library display options.
 */
export const LibraryOptionsSheet: React.FC<Props> = ({
  open,
  setOpen,
  settings,
  updateSettings,
  disabled = false,
}) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { t } = useTranslation();

  const handlePresentModal = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);

  const handleDismissModal = useCallback(() => {
    bottomSheetModalRef.current?.dismiss();
  }, []);

  useEffect(() => {
    if (open) {
      handlePresentModal();
    } else {
      handleDismissModal();
    }
  }, [open, handlePresentModal, handleDismissModal]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        setOpen(false);
      }
    },
    [setOpen],
  );

  if (disabled) return null;

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      enableDynamicSizing
      onChange={handleSheetChanges}
      {...neonSheetModalProps}
      enablePanDownToClose
      enableDismissOnClose
    >
      <NeonSheet
        title={t("library.options.display")}
        accent={NeonBoard.volt}
        onClose={() => setOpen(false)}
      >
        <OptionGroup title={t("library.options.display")}>
          <OptionItem
            label={t("library.options.row")}
            selected={settings.display === "row"}
            onPress={() => updateSettings({ display: "row" })}
          />
          <OptionItem
            label={t("library.options.list")}
            selected={settings.display === "list"}
            onPress={() => updateSettings({ display: "list" })}
          />
        </OptionGroup>

        <OptionGroup title={t("library.options.image_style")}>
          <OptionItem
            label={t("library.options.poster")}
            selected={settings.imageStyle === "poster"}
            onPress={() => updateSettings({ imageStyle: "poster" })}
          />
          <OptionItem
            label={t("library.options.cover")}
            selected={settings.imageStyle === "cover"}
            onPress={() => updateSettings({ imageStyle: "cover" })}
          />
        </OptionGroup>

        <OptionGroup title={t("library.options.options_title")}>
          <ToggleItem
            label={t("library.options.show_titles")}
            value={settings.showTitles}
            onToggle={() =>
              updateSettings({ showTitles: !settings.showTitles })
            }
            disabled={settings.imageStyle === "poster"}
          />
          <ToggleItem
            label={t("library.options.show_stats")}
            value={settings.showStats}
            onToggle={() => updateSettings({ showStats: !settings.showStats })}
          />
        </OptionGroup>
      </NeonSheet>
    </BottomSheetModal>
  );
};
