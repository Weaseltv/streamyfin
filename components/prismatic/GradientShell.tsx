import { LinearGradient } from "expo-linear-gradient";
import type React from "react";
import { Platform, type StyleProp, View, type ViewStyle } from "react-native";
import { Gradients, Prism } from "@/constants/Colors";

interface Props {
  children: React.ReactNode;
  /** Outer corner radius. The inner fill uses this minus the shell thickness. */
  radius: number;
  /** Gradient stops for the border itself. Defaults to the full rainbow. */
  colors?: readonly string[];
  /** Border thickness. The design uses 1.5 everywhere. */
  thickness?: number;
  /** Fill behind the children. Pass "transparent" to let artwork show through. */
  innerFill?: string;
  /** iOS glow cast by the shell. Android has no shadowColor support, so it is skipped. */
  glowColor?: string;
  glowRadius?: number;
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
}

/**
 * A gradient border drawn as a thin gradient rectangle with a solid child laid
 * on top. React Native cannot stroke a border with a gradient, so every ring in
 * this app - play pill, hero card, connect button, avatars - is built this way.
 */
export const GradientShell: React.FC<Props> = ({
  children,
  radius,
  colors = Gradients.rainbow,
  thickness = Prism.shellThickness,
  innerFill = Prism.shellInnerFill,
  glowColor,
  glowRadius = 12,
  style,
  innerStyle,
}) => {
  const glow =
    glowColor && Platform.OS === "ios"
      ? {
          shadowColor: glowColor,
          shadowRadius: glowRadius,
          shadowOpacity: 1,
          shadowOffset: { width: 0, height: 0 },
        }
      : null;

  return (
    <View style={[glow, style]}>
      <LinearGradient
        colors={colors as unknown as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ borderRadius: radius, padding: thickness }}
      >
        <View
          style={[
            {
              borderRadius: Math.max(radius - thickness, 0),
              backgroundColor: innerFill,
              overflow: "hidden",
            },
            innerStyle,
          ]}
        >
          {children}
        </View>
      </LinearGradient>
    </View>
  );
};
