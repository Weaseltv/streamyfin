import { TouchableOpacity, View } from "react-native";
import { NeonBoard } from "@/constants/Colors";
import { glowRule, Sizes } from "@/constants/neon";
import { useAccent } from "@/utils/atoms/pageAccent";
import { Text } from "./Text";

type Props = {
  title: string;
  /** Rule and count colour. Defaults to volt; item pages pass the type colour. */
  accent?: string;
  /** Trailing count in the accent, Condensed 700 14. */
  count?: number | string | null;
  actionLabel?: string;
  actionDisabled?: boolean;
  onPressAction?: () => void;
  /** Row classes, so callers can set their own horizontal padding. */
  className?: string;
};

/**
 * Section head: Condensed 800 16 uppercase on a 1pt accent rule with a glow,
 * the count (or an action) in the accent on the right.
 */
export const SectionHeader: React.FC<Props> = ({
  title,
  accent: accentProp,
  count,
  actionLabel,
  actionDisabled = false,
  onPressAction,
  className = "px-4",
}) => {
  const accent = useAccent(accentProp);
  const shouldShowAction = Boolean(actionLabel) && Boolean(onPressAction);

  return (
    <View className={`mb-3 ${className}`} style={{ paddingTop: 10 }}>
      <View className='flex flex-row items-end justify-between pb-1.5'>
        <Text variant='section' numberOfLines={1} className='shrink pr-3'>
          {title}
        </Text>
        {shouldShowAction ? (
          <TouchableOpacity
            onPress={onPressAction}
            disabled={actionDisabled}
            accessibilityRole='button'
            accessibilityLabel={actionLabel}
            hitSlop={8}
          >
            <Text
              variant='tally'
              accent={actionDisabled ? NeonBoard.low : accent}
            >
              {actionLabel}
            </Text>
          </TouchableOpacity>
        ) : count !== undefined && count !== null ? (
          <Text variant='tally' accent={accent}>
            {count}
          </Text>
        ) : null}
      </View>
      <View
        style={[{ height: 1, backgroundColor: accent }, glowRule(accent)]}
      />
    </View>
  );
};

export const SECTION_GUTTER = Sizes.gutter;
