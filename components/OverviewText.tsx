import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View, type ViewProps } from "react-native";
import { Text } from "@/components/common/Text";
import { tc } from "@/utils/textTools";

interface Props extends ViewProps {
  text?: string | null;
  characterLimit?: number;
  accent?: string;
}

export const OverviewText: React.FC<Props> = ({
  text,
  characterLimit = 160,
  accent,
  ...props
}) => {
  const [limit, setLimit] = useState(characterLimit);
  const { t } = useTranslation();

  if (!text) return null;

  return (
    <View className='flex flex-col' {...props}>
      <TouchableOpacity
        onPress={() =>
          setLimit((prev) =>
            prev === characterLimit ? text.length : characterLimit,
          )
        }
      >
        <View>
          {/* White, as on the TV; tap to expand stays on phones (owner, 2026-10-16) */}
          <Text
            variant='body'
            accent='#FFFFFF'
            style={{ fontSize: 13, lineHeight: 20 }}
          >
            {tc(text, limit)}
          </Text>
          {text.length > characterLimit && (
            <Text variant='tally' accent={accent} style={{ marginTop: 6 }}>
              {limit === characterLimit
                ? t("item_card.show_more")
                : t("item_card.show_less")}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
};
