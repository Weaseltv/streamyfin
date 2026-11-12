import type React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { ACTION_STRIP_HEIGHT } from "@/components/item/ActionCell";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";

/**
 * What a title page opened on a tapped card (phones) shows where its controls
 * will be, for as long as the title's own details have not arrived. The
 * controls themselves are not drawn until then: nothing here can be pressed
 * except Retry.
 */

const hidden = {
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

const block = { backgroundColor: NeonBoard.card2 } as const;

/** Movie and episode pages: the Play row and, below it, the action strip. */
export const ItemControlsPending: React.FC<{ strip: boolean }> = ({
  strip,
}) => (
  <View {...hidden}>
    <View
      style={{
        flexDirection: "row",
        paddingHorizontal: Sizes.gutter,
        gap: 10,
        marginTop: 14,
        marginBottom: 12,
      }}
    >
      <View style={[block, { flex: 1, height: Sizes.button }]} />
      <View style={[block, { width: Sizes.button, height: Sizes.button }]} />
    </View>
    {strip ? (
      <View
        style={{
          height: ACTION_STRIP_HEIGHT + 2,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: NeonBoard.line,
        }}
      />
    ) : null}
  </View>
);

/** Show pages: the row of buttons under the title, about two lines of them. */
export const SeriesButtonsPending: React.FC = () => (
  <View
    {...hidden}
    style={{
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      paddingHorizontal: Sizes.gutter,
      paddingTop: 12,
    }}
  >
    {[148, 116, 148, 84, 88].map((width, index) => (
      <View key={index} style={[block, { width, height: Sizes.chip }]} />
    ))}
  </View>
);

/**
 * The title's details did not load. Shown in place of the controls, with the
 * card's title and artwork still above it, so the page neither goes blank nor
 * looks as if it were still loading.
 */
export const TitleDetailsFailed: React.FC<{
  onRetry: () => void;
  retrying?: boolean;
}> = ({ onRetry, retrying = false }) => {
  const { t } = useTranslation();
  return (
    <View
      style={{
        paddingHorizontal: Sizes.gutter,
        marginTop: 14,
        marginBottom: 12,
        gap: 12,
      }}
    >
      <Text variant='body' muted>
        {t("item_card.could_not_load_item")}
      </Text>
      <Button variant='border' loading={retrying} onPress={onRetry}>
        {t("home.retry")}
      </Button>
    </View>
  );
};
