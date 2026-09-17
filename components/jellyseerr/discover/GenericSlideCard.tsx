import type { ImageContentFit } from "expo-image";
import type React from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";

export const textShadowStyle = StyleSheet.create({
  shadow: {
    shadowColor: "#000",
    shadowOffset: {
      width: 1,
      height: 1,
    },
    shadowOpacity: 1,
    shadowRadius: 0.5,

    elevation: 6,
  },
});

const GenericSlideCard: React.FC<
  {
    id: string;
    url?: string;
    title?: string;
    /** Kept for call-site compatibility; the card is a flat `card` panel now. */
    colors?: readonly [string, string, ...string[]];
    contentFit?: ImageContentFit;
  } & ViewProps
> = ({ id, url, title, colors: _colors, contentFit = "contain", ...props }) => (
  <>
    <View
      style={{
        backgroundColor: NeonBoard.card,
        borderWidth: 1,
        borderColor: NeonBoard.line,
      }}
    >
      <View {...props}>
        <Image
          key={id}
          id={id}
          source={url ? { uri: url } : null}
          cachePolicy={"memory-disk"}
          contentFit={contentFit}
          style={{
            aspectRatio: "4/3",
          }}
        />
        {title && (
          <View className='absolute justify-center top-0 left-0 right-0 bottom-0 items-center'>
            <Text
              className='text-center font-bold'
              style={textShadowStyle.shadow}
            >
              {title}
            </Text>
          </View>
        )}
      </View>
    </View>
  </>
);

export default GenericSlideCard;
