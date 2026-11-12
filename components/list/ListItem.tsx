import { Ionicons } from "@expo/vector-icons";
import type { PropsWithChildren, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Platform,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type ViewProps,
} from "react-native";
import { NeonBoard } from "@/constants/Colors";
import { glowRule, Sizes } from "@/constants/neon";
import { usePageAccent } from "@/utils/atoms/pageAccent";
import { Text } from "../common/Text";

interface Props extends ViewProps {
  title?: string | null | undefined;
  subtitle?: string | null | undefined;
  subtitleColor?: "default" | "red";
  value?: string | null | undefined;
  children?: ReactNode;
  iconAfter?: ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Colour for the leading glyph: the section accent (ListGroup passes it). */
  iconTint?: string;
  showArrow?: boolean;
  /** `blue` is the legacy name for the accent; `red` is destructive. */
  textColor?: "default" | "blue" | "red";
  /** A 3pt tally on the leading edge when the row is current or selected. */
  tally?: string | null;
  onPress?: () => void;
  disabled?: boolean;
  disabledByAdmin?: boolean;
  stackControlOnCompact?: boolean;
}

/**
 * A 56 hairline row on the stage: optional 20 glyph in the section accent,
 * title 15/600, value 13 `mid` right, chevron `low`. Rows grow with the
 * font size; the 1pt bottom rule comes from `ListGroup`.
 */
export const ListItem: React.FC<PropsWithChildren<Props>> = ({
  title,
  subtitle,
  value,
  iconAfter,
  children,
  showArrow = false,
  icon,
  iconTint,
  textColor = "default",
  tally,
  onPress,
  disabled = false,
  disabledByAdmin = false,
  stackControlOnCompact = false,
  style,
  ...viewProps
}) => {
  const { t } = useTranslation();
  const effectiveSubtitle = disabledByAdmin
    ? t("home.settings.disabled_by_admin")
    : subtitle;
  const isDisabled = disabled || disabledByAdmin;
  const rowStyle = [
    {
      minHeight: Sizes.row,
      paddingVertical: 10,
      paddingLeft: Sizes.rowLead,
      paddingRight: Sizes.gutter,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      opacity: isDisabled ? 0.5 : 1,
    },
    style,
  ];
  const content = (
    <ListItemContent
      title={title}
      subtitle={effectiveSubtitle}
      subtitleColor={disabledByAdmin ? "red" : undefined}
      value={value}
      icon={icon}
      iconTint={iconTint}
      textColor={textColor}
      showArrow={showArrow}
      iconAfter={iconAfter}
      tally={tally}
      stackControlOnCompact={stackControlOnCompact}
    >
      {children}
    </ListItemContent>
  );
  if (onPress)
    return (
      <TouchableOpacity
        disabled={isDisabled}
        onPress={onPress}
        activeOpacity={0.7}
        style={rowStyle}
        {...(viewProps as any)}
      >
        {content}
      </TouchableOpacity>
    );
  return (
    <View style={rowStyle} {...viewProps}>
      {content}
    </View>
  );
};

const ListItemContent = ({
  title,
  subtitle,
  subtitleColor,
  textColor,
  icon,
  iconTint,
  value,
  showArrow,
  iconAfter,
  tally,
  children,
  stackControlOnCompact,
}: Props) => {
  const { width, fontScale } = useWindowDimensions();
  const stackControl =
    !Platform.isTV &&
    stackControlOnCompact &&
    (width < 400 || fontScale > 1.15);
  const pageAccent = usePageAccent();
  const titleColor =
    textColor === "red"
      ? NeonBoard.red
      : textColor === "blue"
        ? (iconTint ?? pageAccent)
        : NeonBoard.text;
  const glyphColor =
    textColor === "red" ? NeonBoard.red : (iconTint ?? pageAccent);
  return (
    <>
      {tally ? (
        <View
          style={[
            {
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: Sizes.tally,
              backgroundColor: tally,
            },
            glowRule(tally),
          ]}
        />
      ) : null}
      <View
        style={{
          flexDirection: stackControl ? "column" : "row",
          alignItems: stackControl ? "stretch" : "center",
          width: "100%",
          gap: stackControl ? 8 : 0,
        }}
      >
        {icon && (
          <View
            style={{
              width: 24,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 14,
            }}
          >
            <Ionicons name={icon} size={24} color={glyphColor} />
          </View>
        )}
        {/* The label sizes to its content and only shrinks if it alone
            overflows; the value column takes whatever is left. */}
        <View
          style={{
            flex: stackControl || value ? undefined : 1,
            flexShrink: 1,
            minWidth: 0,
          }}
        >
          <Text variant='rowTitle' style={{ color: titleColor }}>
            {title}
          </Text>
          {subtitle && (
            <Text
              variant='meta'
              style={{
                marginTop: 2,
                color: subtitleColor === "red" ? NeonBoard.red : NeonBoard.mid,
              }}
            >
              {subtitle}
            </Text>
          )}
        </View>
        {value && (
          // Values here are diagnostics — build string, token, server URL —
          // that are only useful in full, so wrap rather than truncate. The row
          // has a min height, not a fixed one, so it grows to fit.
          <View className='flex-1 items-end pl-3'>
            <Text
              selectable
              variant='meta'
              style={{ fontSize: 13, textAlign: "right" }}
            >
              {value}
            </Text>
          </View>
        )}
        {children && (
          <View
            style={{
              flexShrink: 0,
              marginLeft: stackControl ? 0 : 12,
              alignSelf: stackControl ? "flex-end" : undefined,
              maxWidth: "100%",
            }}
          >
            {children}
          </View>
        )}
        {showArrow && (
          <View className={children ? "ml-1" : "ml-auto"}>
            <Ionicons
              name='chevron-forward'
              size={22}
              color={textColor === "red" ? NeonBoard.red : NeonBoard.low}
            />
          </View>
        )}
      </View>
      {iconAfter}
    </>
  );
};
