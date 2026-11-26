import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";

interface Props {
  title: string;
  subtitle?: string;
  /** "back" shows an arrow, "close" an X; omitted shows neither. */
  leading?: "back" | "close";
  onLeading?: () => void;
  children: ReactNode;
  /** Pinned under the scrolling content (buttons, progress, errors). */
  footer?: ReactNode;
}

/** The full-screen frame the profile flows share: header, scrolling body, optional footer. */
export function ProfileFlowScaffold({
  title,
  subtitle,
  leading,
  onLeading,
  children,
  footer,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: NeonBoard.stage }}
    >
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          minHeight: 44 + insets.top,
        }}
      >
        {leading ? (
          <Pressable
            onPress={onLeading}
            hitSlop={12}
            accessibilityRole='button'
            accessibilityLabel={
              leading === "back" ? t("common.back") : t("common.close")
            }
            style={{ width: 44, height: 44, justifyContent: "center" }}
          >
            <Ionicons
              name={leading === "back" ? "chevron-back" : "close"}
              size={26}
              color={NeonBoard.text}
            />
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        keyboardShouldPersistTaps='handled'
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: footer ? 16 : insets.bottom + 24,
        }}
      >
        <Text variant='pageTitle' style={{ marginTop: 4 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text muted style={{ marginTop: 8 }}>
            {subtitle}
          </Text>
        ) : null}
        <View style={{ marginTop: 24 }}>{children}</View>
      </ScrollView>
      {footer ? (
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: insets.bottom + 16,
            borderTopWidth: 1,
            borderTopColor: NeonBoard.line,
            gap: 12,
          }}
        >
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
