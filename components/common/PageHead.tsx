import type { ReactNode } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";
import { glowRule, Sizes } from "@/constants/neon";
import { useAccent } from "@/utils/atoms/pageAccent";
import { Text } from "./Text";

interface Props {
  /** Small uppercase line above the title, in the accent. */
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
 * Page head: eyebrow (accent 10/700 upper), Condensed 800 24 title, optional
 * trailing count, and a 2pt accent rule with a glow below. 12 gutter.
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
        className='flex flex-row items-end justify-between pb-2'
        style={bleedRule ? gutter : undefined}
      >
        <View className='shrink'>
          {eyebrow ? (
            <Text variant='eyebrow' accent={accent} numberOfLines={1}>
              {eyebrow}
            </Text>
          ) : null}
          <Text variant='pageTitle' numberOfLines={2} style={{ marginTop: 2 }}>
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
      <View
        style={[{ height: 2, backgroundColor: accent }, glowRule(accent)]}
      />
    </View>
  );
};
