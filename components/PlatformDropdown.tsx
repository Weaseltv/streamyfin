import { Feather } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { NeonSheet, NeonSheetRow } from "@/components/common/NeonSheet";
import { SectionHeader } from "@/components/common/SectionHeader";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import { useGlobalModal } from "@/providers/GlobalModalProvider";
import { useAccent } from "@/utils/atoms/pageAccent";

// @expo/ui's SwiftUI native module (ExpoUI) does not exist in tvOS builds.
// A static top-level import evaluates requireNativeModule('ExpoUI') at module
// load and crashes the entire route tree on tvOS (expo-router requires every
// route file). Load it lazily and only off-TV; TV never renders these.
const { Button, Host, Menu } = Platform.isTV
  ? ({} as typeof import("@expo/ui/swift-ui"))
  : require("@expo/ui/swift-ui");
const { disabled, menuOrder } = Platform.isTV
  ? ({} as typeof import("@expo/ui/swift-ui/modifiers"))
  : require("@expo/ui/swift-ui/modifiers");

// UIMenu reorders items by proximity to the anchor, so a menu that opens
// upward shows them reversed. Keep the order they were provided in.
// Built once, and never on TV where the modifiers module is not loaded.
const fixedOrder = Platform.isTV ? [] : [menuOrder("fixed")];

// Option types
export type RadioOption<T = any> = {
  type: "radio";
  label: string;
  value: T;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
};

export type ToggleOption = {
  type: "toggle";
  label: string;
  value: boolean;
  onToggle: () => void;
  disabled?: boolean;
};

export type ActionOption = {
  type: "action";
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

export type Option = RadioOption | ToggleOption | ActionOption;

// Option group structure
export type OptionGroup = {
  title?: string;
  options: Option[];
};

interface PlatformDropdownProps {
  trigger?: React.ReactNode;
  title?: string;
  groups: OptionGroup[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onOptionSelect?: (value?: any) => void;
  /** Section accent for the Android sheet (tally, rule, checks). */
  accent?: string;
  expoUIConfig?: {
    hostStyle?: any;
  };
  bottomSheetConfig?: {
    enableDynamicSizing?: boolean;
    enablePanDownToClose?: boolean;
  };
}

/**
 * The picker trigger for settings rows: the current value in the accent on a
 * `card2` box with a 1pt `line2` border, radius 0, and a `mid` caret.
 */
export const DropdownTrigger: React.FC<{
  value?: string | null;
  accent?: string;
  disabled?: boolean;
  compact?: boolean;
}> = ({ value, accent: accentProp, disabled = false, compact = true }) => {
  const accent = useAccent(accentProp);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        height: compact ? Sizes.buttonCompact : Sizes.outline,
        paddingLeft: 12,
        paddingRight: 10,
        backgroundColor: NeonBoard.card2,
        borderWidth: 1,
        borderColor: NeonBoard.line2,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text
        variant='chip'
        numberOfLines={1}
        style={{ color: accent, fontSize: 13, maxWidth: 200 }}
      >
        {value}
      </Text>
      <Feather name='chevron-down' size={19} color={NeonBoard.mid} />
    </View>
  );
};

const OptionItem: React.FC<{ option: Option; accent: string }> = ({
  option,
  accent,
}) => {
  const isToggle = option.type === "toggle";
  const isAction = option.type === "action";
  const handlePress = isToggle
    ? option.onToggle
    : (option as RadioOption | ActionOption).onPress;

  return (
    <NeonSheetRow
      label={option.label}
      onPress={handlePress}
      disabled={option.disabled}
      accent={accent}
      selected={!isToggle && !isAction && (option as RadioOption).selected}
      right={
        isToggle ? (
          <SettingSwitch
            value={option.value}
            onValueChange={handlePress}
            disabled={option.disabled}
            trackColor={{ false: NeonBoard.line2, true: accent }}
          />
        ) : undefined
      }
    />
  );
};

const OptionGroupComponent: React.FC<{
  group: OptionGroup;
  accent: string;
}> = ({ group, accent }) => (
  <View>
    {group.title && (
      <SectionHeader title={group.title} accent={accent} className='px-4' />
    )}
    {group.options.map((option, index) => (
      <OptionItem key={index} option={option} accent={accent} />
    ))}
  </View>
);

const BottomSheetContent: React.FC<{
  title?: string;
  groups: OptionGroup[];
  accent: string;
  onOptionSelect?: (value?: any) => void;
  onClose?: () => void;
}> = ({ title, groups, accent, onOptionSelect, onClose }) => {
  const { t } = useTranslation();

  // Wrap the groups to call onOptionSelect when an option is pressed
  const wrappedGroups = groups.map((group) => ({
    ...group,
    options: group.options.map((option) => {
      if (option.type === "radio") {
        return {
          ...option,
          onPress: () => {
            option.onPress();
            onOptionSelect?.(option.value);
            onClose?.();
          },
        };
      }
      if (option.type === "toggle") {
        return {
          ...option,
          onToggle: () => {
            option.onToggle();
            onOptionSelect?.(option.value);
          },
        };
      }
      if (option.type === "action") {
        return {
          ...option,
          onPress: () => {
            option.onPress();
            onClose?.();
          },
        };
      }
      return option;
    }),
  }));

  return (
    <NeonSheet
      scroll
      title={title ?? t("common.open_menu")}
      accent={accent}
      onClose={onClose}
    >
      {wrappedGroups.map((group, index) => (
        <OptionGroupComponent key={index} group={group} accent={accent} />
      ))}
    </NeonSheet>
  );
};

const PlatformDropdownComponent = ({
  trigger,
  title,
  groups,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onOptionSelect,
  accent: accentProp,
  expoUIConfig,
  bottomSheetConfig,
}: PlatformDropdownProps) => {
  const accent = useAccent(accentProp);
  const { t } = useTranslation();
  const { showModal, hideModal, isVisible } = useGlobalModal();

  // Handle controlled open state for Android
  useEffect(() => {
    if (Platform.OS === "android" && controlledOpen === true) {
      showModal(
        <BottomSheetContent
          title={title}
          groups={groups}
          accent={accent}
          onOptionSelect={onOptionSelect}
          onClose={() => {
            hideModal();
            controlledOnOpenChange?.(false);
          }}
        />,
        {
          // No snap points: sized to its options, so a two-entry dropdown
          // opens small and a long one stops at the shared ceiling.
          enablePanDownToClose: bottomSheetConfig?.enablePanDownToClose ?? true,
        },
      );
    }
  }, [controlledOpen]);

  // Watch for modal dismissal on Android (e.g., swipe down, backdrop tap)
  // and sync the controlled open state
  useEffect(() => {
    if (Platform.OS === "android" && controlledOpen === true && !isVisible) {
      controlledOnOpenChange?.(false);
    }
  }, [isVisible, controlledOpen, controlledOnOpenChange]);

  if (Platform.OS === "ios" && !Platform.isTV) {
    // @expo/ui's <Host> can't size to content, so an in-flow invisible copy of
    // the trigger sizes the wrapper while the Host overlays the real Menu.
    return (
      <View>
        <View pointerEvents='none' aria-hidden style={{ opacity: 0 }}>
          {trigger}
        </View>
        <Host style={[StyleSheet.absoluteFill, expoUIConfig?.hostStyle as any]}>
          <Menu label={trigger} modifiers={fixedOrder}>
            {groups.flatMap((group, groupIndex) => {
              // Check if this group has radio options
              const radioOptions = group.options.filter(
                (opt) => opt.type === "radio",
              ) as RadioOption[];
              const toggleOptions = group.options.filter(
                (opt) => opt.type === "toggle",
              ) as ToggleOption[];
              const actionOptions = group.options.filter(
                (opt) => opt.type === "action",
              ) as ActionOption[];

              const items = [];

              // Group radio options under a submenu ONLY if there's a title
              // Otherwise render as individual buttons
              if (radioOptions.length > 0) {
                if (group.title) {
                  // Use a nested Menu as a submenu for grouped options. This
                  // reads as "Title: Selected" and expands to the choices on
                  // tap, keeping the nested look while staying a dropdown.
                  // (Menu opens on a single tap and nests cleanly; ContextMenu
                  // would require a long-press and read as a context menu.)
                  const selectedOption = radioOptions.find(
                    (opt) => opt.selected,
                  );
                  const displayTitle = selectedOption
                    ? `${group.title}: ${selectedOption.label}`
                    : group.title;
                  items.push(
                    <Menu
                      key={`submenu-${groupIndex}`}
                      label={displayTitle}
                      modifiers={fixedOrder}
                    >
                      {radioOptions.map((option, optionIndex) => (
                        <Button
                          key={`radio-${groupIndex}-${optionIndex}`}
                          label={option.label}
                          systemImage={
                            option.selected ? "checkmark.circle.fill" : "circle"
                          }
                          modifiers={
                            option.disabled ? [disabled(true)] : undefined
                          }
                          onPress={() => {
                            option.onPress();
                            onOptionSelect?.(option.value);
                          }}
                        />
                      ))}
                    </Menu>,
                  );
                } else {
                  // Render radio options as direct buttons
                  radioOptions.forEach((option, optionIndex) => {
                    items.push(
                      <Button
                        key={`radio-${groupIndex}-${optionIndex}`}
                        label={option.label}
                        systemImage={
                          option.selected ? "checkmark.circle.fill" : "circle"
                        }
                        modifiers={
                          option.disabled ? [disabled(true)] : undefined
                        }
                        onPress={() => {
                          option.onPress();
                          onOptionSelect?.(option.value);
                        }}
                      />,
                    );
                  });
                }
              }

              // Add Buttons for toggle options
              toggleOptions.forEach((option, optionIndex) => {
                items.push(
                  <Button
                    key={`toggle-${groupIndex}-${optionIndex}`}
                    label={option.label}
                    systemImage={
                      option.value ? "checkmark.circle.fill" : "circle"
                    }
                    modifiers={option.disabled ? [disabled(true)] : undefined}
                    onPress={() => {
                      option.onToggle();
                      onOptionSelect?.(option.value);
                    }}
                  />,
                );
              });

              // Add Buttons for action options (no icon)
              actionOptions.forEach((option, optionIndex) => {
                items.push(
                  <Button
                    key={`action-${groupIndex}-${optionIndex}`}
                    label={option.label}
                    modifiers={option.disabled ? [disabled(true)] : undefined}
                    onPress={() => {
                      option.onPress();
                    }}
                  />,
                );
              });

              return items;
            })}
          </Menu>
        </Host>
      </View>
    );
  }

  // Android: Direct modal trigger
  const handlePress = () => {
    showModal(
      <BottomSheetContent
        title={title}
        groups={groups}
        accent={accent}
        onOptionSelect={onOptionSelect}
        onClose={hideModal}
      />,
      {
        // No snap points: sized to its options, so a two-entry dropdown opens
        // small and a long one stops at the shared ceiling.
        enablePanDownToClose: bottomSheetConfig?.enablePanDownToClose ?? true,
      },
    );
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
      {trigger || <DropdownTrigger value={t("common.open_menu")} />}
    </TouchableOpacity>
  );
};

// Memoize to prevent unnecessary re-renders when parent re-renders
export const PlatformDropdown = React.memo(
  PlatformDropdownComponent,
  (prevProps, nextProps) => {
    // Custom comparison - only re-render if these props actually change
    return (
      prevProps.title === nextProps.title &&
      prevProps.open === nextProps.open &&
      prevProps.groups === nextProps.groups && // Reference equality (works because we memoize groups in caller)
      prevProps.accent === nextProps.accent &&
      prevProps.trigger === nextProps.trigger // Reference equality
    );
  },
);
