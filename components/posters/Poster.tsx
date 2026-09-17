import { View } from "react-native";
import { Image } from "@/components/common/ServerImage";
import { NeonBoard } from "@/constants/Colors";

type PosterProps = {
  id?: string | null;
  url?: string | null;
  showProgress?: boolean;
  blurhash?: string | null;
};

const Poster: React.FC<PosterProps> = ({ id, url, blurhash }) => {
  if (!id && !url)
    return (
      <View
        style={{
          aspectRatio: "10/15",
          borderWidth: 1,
          borderColor: NeonBoard.line,
          backgroundColor: NeonBoard.card2,
        }}
      />
    );

  return (
    <View
      style={{
        overflow: "hidden",
        borderWidth: 1,
        borderColor: NeonBoard.line,
      }}
    >
      <Image
        placeholder={
          blurhash
            ? {
                blurhash,
              }
            : null
        }
        key={id}
        id={id!}
        source={
          url
            ? {
                uri: url,
              }
            : null
        }
        cachePolicy={"memory-disk"}
        contentFit='cover'
        style={{
          aspectRatio: "10/15",
        }}
      />
    </View>
  );
};

export default Poster;
