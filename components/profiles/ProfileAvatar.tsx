import { View } from "react-native";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { getUserImageUrl } from "@/utils/jellyfin/image/getUserImageUrl";
import type { PhoneProfile } from "@/utils/profiles/phoneProfiles";

export function ProfileAvatar({
  profile,
  size = 68,
}: {
  profile: Pick<
    PhoneProfile,
    "serverUrl" | "userId" | "username" | "primaryImageTag"
  >;
  size?: number;
}) {
  const image = getUserImageUrl({
    serverAddress: profile.serverUrl,
    userId: profile.userId,
    primaryImageTag: profile.primaryImageTag,
  });

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: NeonBoard.line,
      }}
    >
      <Text variant='section'>
        {profile.username.slice(0, 1).toUpperCase()}
      </Text>
      {image ? (
        <Image
          source={image}
          style={{ position: "absolute", width: size, height: size }}
        />
      ) : null}
    </View>
  );
}
