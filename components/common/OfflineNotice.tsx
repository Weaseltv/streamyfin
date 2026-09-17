import { Feather } from "@expo/vector-icons";
import type React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { glowRule, Sizes } from "@/constants/neon";

interface Props {
  host: string;
  onRetry: () => void;
  loading?: boolean;
}

/**
 * The Home offline notice: a 60 `card` row under the brand row with a warn
 * tally, the `wifi-off` glyph, "Offline mode" + detail, and a RETRY outline
 * in volt.
 */
export const OfflineNotice: React.FC<Props> = ({ host, onRetry, loading }) => {
  const { t } = useTranslation();
  return (
    <View
      style={{
        minHeight: 60,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingLeft: Sizes.rowLead,
        paddingRight: Sizes.gutter,
        paddingVertical: 10,
        backgroundColor: NeonBoard.card,
        borderBottomWidth: 1,
        borderBottomColor: NeonBoard.line,
      }}
    >
      <View
        style={[
          {
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: Sizes.tally,
            backgroundColor: NeonBoard.warn,
          },
          glowRule(NeonBoard.warn),
        ]}
      />
      <Feather name='wifi-off' size={20} color={NeonBoard.warn} />
      <View style={{ flex: 1 }}>
        <Text variant='rowTitle' numberOfLines={1}>
          {t("states.offline_title")}
        </Text>
        <Text variant='caption' muted numberOfLines={2}>
          {t("states.offline_detail", { host })}
        </Text>
      </View>
      <Button compact variant='border' onPress={onRetry} loading={loading}>
        {t("states.retry")}
      </Button>
    </View>
  );
};
