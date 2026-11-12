import { LinearGradient } from "expo-linear-gradient";
import { TouchableOpacity, View } from "react-native";
import { glowOf, NeonBoard } from "@/constants/Colors";
import { rgba, Sizes } from "@/constants/neon";
import { useAccent } from "@/utils/atoms/pageAccent";
import { Text } from "./Text";

type Props = {
  title: string;
  /** Small line above the title in the accent's glow colour, as on the TV ("NEXT UP &"). */
  kicker?: string;
  /** Rule colour (the kicker takes its glow). Defaults to the page accent; item pages pass the type colour. */
  accent?: string;
  /** Trailing count, Exo 2 600 14 in grey. */
  count?: number | string | null;
  actionLabel?: string;
  actionDisabled?: boolean;
  onPressAction?: () => void;
  /** Row classes, so callers can set their own horizontal padding. */
  className?: string;
  /** Run the rule edge to edge (the default, as on the TV); the title row keeps its padding. */
  bleedRule?: boolean;
};

/** The TV's row count grey (`ItemRow.kt`). */
const COUNT_GREY = "#787E8C";

/**
 * Section head as on WeaselPlex TV: an optional kicker over an Audiowide
 * uppercase title, the count (or an action) on the right, then a 3pt rule in
 * the accent with its glow rising 7pt above it.
 */
export const SectionHeader: React.FC<Props> = ({
  title,
  kicker,
  accent: accentProp,
  count,
  actionLabel,
  actionDisabled = false,
  onPressAction,
  className = "px-4",
  bleedRule = true,
}) => {
  const accent = useAccent(accentProp);
  const glow = glowOf(accent);
  const shouldShowAction = Boolean(actionLabel) && Boolean(onPressAction);

  return (
    <View
      className={bleedRule ? "mb-3" : `mb-3 ${className}`}
      style={{ paddingTop: 10 }}
    >
      <View
        className={`flex flex-row items-end justify-between ${
          bleedRule ? className : ""
        }`}
        style={{ paddingBottom: 2 }}
      >
        <View className='shrink pr-3'>
          {kicker ? (
            <Text variant='kicker' accent={glow} numberOfLines={1}>
              {kicker}
            </Text>
          ) : null}
          {/* Two lines, not one: a long title ("Recently added in Stand Up
              Comedy") doesn't fit beside See all on a phone. */}
          <Text variant='section' accent='#FFFFFF' numberOfLines={2}>
            {title}
          </Text>
        </View>
        {shouldShowAction ? (
          <TouchableOpacity
            onPress={onPressAction}
            disabled={actionDisabled}
            accessibilityRole='button'
            accessibilityLabel={actionLabel}
            hitSlop={8}
            style={{ paddingBottom: 2 }}
          >
            <Text
              variant='headTally'
              accent={actionDisabled ? NeonBoard.low : accent}
            >
              {actionLabel}
            </Text>
          </TouchableOpacity>
        ) : count !== undefined && count !== null ? (
          <Text
            variant='count'
            accent={COUNT_GREY}
            style={{ paddingBottom: 2 }}
          >
            {count}
          </Text>
        ) : null}
      </View>
      <SectionRule accent={accent} />
    </View>
  );
};

/**
 * The TV's section rule: 3pt in the accent (Home's in its bright glow green,
 * as on the TV), with a 10pt glow gradient behind it (transparent to the glow
 * colour at 0.8) that shows 7pt above the rule.
 */
export const SectionRule: React.FC<{ accent: string }> = ({ accent }) => {
  const glow = glowOf(accent);
  const rule = accent === NeonBoard.home ? glow : accent;
  return (
    <View style={{ marginTop: 7 }}>
      <LinearGradient
        pointerEvents='none'
        colors={[rgba(glow, 0), rgba(glow, 0.8)]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 10,
        }}
      />
      <View style={{ height: 3, backgroundColor: rule }} />
    </View>
  );
};

export const SECTION_GUTTER = Sizes.gutter;
