import type { ReactNode } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";
import { glowOf } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import { useAccent } from "@/utils/atoms/pageAccent";
import { SectionRule } from "./SectionHeader";
import { Text } from "./Text";

interface Props {
  /** Small uppercase line above the title, in the accent's glow. */
  eyebrow?: string | null;
  title: string;
  /** Trailing text in the accent (a count, "A – Z", "Today"). */
  trailing?: string | number | null;
  /** Or any element on the right. */
  right?: ReactNode;
  accent?: string;
  style?: StyleProp<ViewStyle>;
  /** Run the rule edge to edge instead of inside the gutter. */
  bleedRule?: boolean;
}

/**
 * Page head as on WeaselPlex TV: eyebrow (Exo 2 700 upper in the glow
 * colour), Audiowide uppercase title, optional trailing count, and the 3pt
 * section rule with its glow. 16 gutter.
 */
export const PageHead: React.FC<Props> = ({
  eyebrow,
  title,
  trailing,
  right,
  accent: accentProp,
  style,
  bleedRule = false,
}) => {
  const accent = useAccent(accentProp);
  const gutter = { paddingHorizontal: Sizes.gutter };
  return (
    <View style={[!bleedRule && gutter, { paddingTop: 12 }, style]}>
      <View
        className='flex flex-row items-end justify-between'
        style={bleedRule ? gutter : undefined}
      >
        <View className='shrink'>
          {eyebrow ? (
            <Text variant='eyebrow' accent={glowOf(accent)} numberOfLines={1}>
              {eyebrow}
            </Text>
          ) : null}
          <Text
            variant='pageTitle'
            accent='#FFFFFF'
            numberOfLines={2}
            style={{ marginTop: 2 }}
          >
            {title}
          </Text>
        </View>
        {right ??
          (trailing !== undefined && trailing !== null ? (
            <Text variant='headTally' accent={accent} className='pl-3'>
              {trailing}
            </Text>
          ) : null)}
      </View>
      <SectionRule accent={accent} />
    </View>
  );
};
