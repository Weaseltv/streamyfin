import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type { ImageProps } from "expo-image";
import { useAtom } from "jotai";
import { type FC, useMemo, useState } from "react";
import { View, type ViewProps } from "react-native";
import { Image } from "@/components/common/ServerImage";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getItemImage } from "@/utils/getItemImage";

interface Props extends ImageProps {
  item: BaseItemDto;
  variant?:
    | "Primary"
    | "Backdrop"
    | "ParentBackdrop"
    | "ParentLogo"
    | "Logo"
    | "AlbumPrimary"
    | "SeriesPrimary"
    | "Screenshot"
    | "Thumb";
  quality?: number;
  width?: number;
  onError?: () => void;
}

export const ItemImage: FC<Props> = ({
  item,
  variant = "Primary",
  quality = 90,
  width = 1000,
  onError,
  ...props
}) => {
  const [api] = useAtom(apiAtom);
  const [failedUri, setFailedUri] = useState<string>();

  const source = useMemo(() => {
    if (!api) {
      return;
    }
    return getItemImage({
      item,
      api,
      variant,
      quality,
      width,
    });
  }, [api, item, quality, variant, width]);

  // `blurhash` belongs to the placeholder only. expo-image reads any source
  // object carrying a `blurhash` key as a blurhash source and gives it that
  // hash's 16x16 size, so on Android Glide decoded the real 1000px artwork
  // down to 16x16 and the item page poster and backdrop stayed pixelated.
  const { blurhash, ...imageSource } = source ?? {};

  // return placeholder icon if no source
  if (!source?.uri || source.uri === failedUri)
    return (
      <View
        {...(props as ViewProps)}
        className='flex flex-col items-center justify-center border border-neutral-800 bg-neutral-900'
      >
        <Ionicons
          name='image-outline'
          size={24}
          color='white'
          style={{ opacity: 0.4 }}
        />
      </View>
    );

  return (
    <Image
      cachePolicy={"memory-disk"}
      recyclingKey={`${item.Id ?? ""}:${variant}:${source.uri}`}
      transition={300}
      placeholder={{ blurhash }}
      style={{
        width: "100%",
        height: "100%",
      }}
      // The whole source, not just its uri: getItemImage already resolved the
      // custom proxy auth headers for it.
      source={imageSource}
      {...props}
      onError={() => {
        setFailedUri(source.uri);
        onError?.();
      }}
    />
  );
};
