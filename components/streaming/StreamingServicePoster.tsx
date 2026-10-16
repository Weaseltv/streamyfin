import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { NeonBoard } from "@/constants/Colors";
import { PROVIDER_WORDMARK_SVGS } from "./providerWordmarks";

const BACKGROUND = "#080C14";

/** The poster's middle colour: each channel 72 % background, 28 % brand. */
const middle = (brand: string): string => {
  const parse = (hex: string) => {
    const n = Number.parseInt(hex.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const bg = parse(BACKGROUND);
  return `#${parse(brand)
    .map((c, i) => Math.round(bg[i] * 0.72 + c * 0.28))
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
};

interface Props {
  wordmark: string;
  brand: string;
  width: number;
  height: number;
}

/**
 * A streaming service's Home poster, as on WeaselPlex TV
 * (`StreamingProviderPoster.kt`): a dark vertical gradient through the brand
 * colour, with the bundled wordmark centred at 78 % of the width and 38 % of
 * the height. No server artwork to download or upscale.
 */
export const StreamingServicePoster: React.FC<Props> = ({
  wordmark,
  brand,
  width,
  height,
}) => {
  const logoWidth = width * 0.78;
  const logoHeight = height * 0.38;
  const svg = PROVIDER_WORDMARK_SVGS[wordmark];
  return (
    <View
      style={{
        width,
        height,
        borderWidth: 1,
        borderColor: NeonBoard.line2,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <LinearGradient
        colors={[BACKGROUND, middle(brand), BACKGROUND]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      {svg ? (
        <SvgXml xml={svg} width={logoWidth} height={logoHeight} />
      ) : (
        <Image
          source={require("@/assets/images/provider-wordmarks/amc.png")}
          style={{ width: logoWidth, height: logoHeight }}
          contentFit='contain'
          tintColor={brand}
        />
      )}
    </View>
  );
};
