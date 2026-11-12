import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { View } from "react-native";
import { SvgXml } from "react-native-svg";
import { Text } from "@/components/common/Text";
import { Sizes } from "@/constants/neon";
import { PROVIDER_WORDMARK_SVGS } from "./providerWordmarks";

/** The header wordmark's tint, as on the TV (`StreamingProviderHeader.kt`): Hallmark too, unlike the poster. */
const HEADER_TINTED = new Set([
  "netflix",
  "hulu",
  "prime_video",
  "amc",
  "mgm",
  "britbox",
  "crunchyroll",
  "hallmark",
]);

const LOGO_HEIGHT = 64;

/**
 * A streaming service page's header, as on WeaselPlex TV
 * (`CollectionDetailsHeader.kt`): the title and the collection's overview
 * (two lines, without " in WeaselPlex") on the left, the service's wordmark on
 * the right.
 */
export const StreamingServiceHeader: React.FC<{
  collection: BaseItemDto;
  wordmark: string;
  brand: string;
}> = ({ collection, wordmark, brand }) => {
  const svg = PROVIDER_WORDMARK_SVGS[wordmark];
  // The poster's tint rules, plus Hallmark in its brand colour
  const xml =
    svg && wordmark === "hallmark" ? svg.replace(/#FFFFFF/gi, brand) : svg;
  const overview = collection.Overview?.replace(" in WeaselPlex", "").trim();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: Sizes.gutter,
        paddingTop: 14,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text variant='section' accent='#FFFFFF' numberOfLines={2}>
          {collection.Name}
        </Text>
        {overview ? (
          <Text
            variant='body'
            accent='#FFFFFF'
            numberOfLines={2}
            style={{ marginTop: 4 }}
          >
            {overview}
          </Text>
        ) : null}
      </View>
      <View style={{ width: "42%", height: LOGO_HEIGHT }}>
        {xml ? (
          <SvgXml xml={xml} width='100%' height={LOGO_HEIGHT} />
        ) : (
          <Image
            source={require("@/assets/images/provider-wordmarks/amc.png")}
            style={{ width: "100%", height: LOGO_HEIGHT }}
            contentFit='contain'
            tintColor={HEADER_TINTED.has(wordmark) ? brand : undefined}
          />
        )}
      </View>
    </View>
  );
};
