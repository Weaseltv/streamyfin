import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import type React from "react";
import { Text, type TextProps, type TextStyle } from "react-native";
import { Gradients } from "@/constants/Colors";

interface Props extends TextProps {
  children: string;
  /** Gradient stops. Defaults to the cool cyan-to-magenta title ramp. */
  colors?: readonly string[];
  style?: TextStyle | TextStyle[];
}

/**
 * Text painted with a gradient, by masking a gradient with the glyphs.
 *
 * The mask needs a laid-out copy of the text to cut from, so the string is
 * rendered twice: once transparent inside the mask, once as the gradient. Keep
 * the two style objects identical or the gradient will not line up.
 */
export const GradientText: React.FC<Props> = ({
  children,
  colors = Gradients.titleText,
  style,
  ...rest
}) => (
  <MaskedView
    maskElement={
      <Text {...rest} style={[style, { backgroundColor: "transparent" }]}>
        {children}
      </Text>
    }
  >
    <LinearGradient
      colors={colors as unknown as [string, string, ...string[]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
    >
      <Text {...rest} style={[style, { opacity: 0 }]}>
        {children}
      </Text>
    </LinearGradient>
  </MaskedView>
);
