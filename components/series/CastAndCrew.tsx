import type {
  BaseItemDto,
  BaseItemPerson,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useSegments } from "expo-router";
import { useAtom } from "jotai";
import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View, type ViewProps } from "react-native";
import { Image } from "@/components/common/ServerImage";
import { NeonBoard, typeAccent } from "@/constants/Colors";
import useRouter from "@/hooks/useAppRouter";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { HorizontalScroll } from "../common/HorizontalScroll";
import { SectionHeader } from "../common/SectionHeader";
import { Text } from "../common/Text";

interface Props extends ViewProps {
  item?: BaseItemDto | null;
  loading?: boolean;
}

const AVATAR = 56;

const initials = (name?: string | null) =>
  (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

/** A person: the one round thing in the design, 56 across. */
export const PersonAvatar: React.FC<{
  person: BaseItemPerson;
  onPress?: () => void;
}> = ({ person, onPress }) => {
  const [api] = useAtom(apiAtom);
  const url = getPrimaryImageUrl({ api, item: person });
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ width: 84, alignItems: "center" }}
    >
      <View
        style={{
          width: AVATAR,
          height: AVATAR,
          borderRadius: AVATAR / 2,
          overflow: "hidden",
          backgroundColor: NeonBoard.card2,
          borderWidth: 1,
          borderColor: NeonBoard.line2,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {url ? (
          <Image
            id={person.Id ?? undefined}
            source={{ uri: url }}
            style={{ width: AVATAR, height: AVATAR }}
            contentFit='cover'
          />
        ) : (
          <Text variant='tally' muted>
            {initials(person.Name)}
          </Text>
        )}
      </View>
      <Text
        variant='cardTitle'
        numberOfLines={1}
        style={{ marginTop: 6, fontSize: 12, textAlign: "center" }}
      >
        {person.Name}
      </Text>
      <Text
        variant='caption'
        numberOfLines={1}
        style={{ color: NeonBoard.low, fontSize: 10, textAlign: "center" }}
      >
        {person.Role}
      </Text>
    </TouchableOpacity>
  );
};

export const CastAndCrew: React.FC<Props> = ({ item, loading, ...props }) => {
  const segments = useSegments();
  const { t } = useTranslation();
  const router = useRouter();
  const from = (segments as string[])[2];
  const accent = typeAccent(item);

  const destinctPeople = useMemo(() => {
    const people: Record<string, BaseItemPerson> = {};
    item?.People?.forEach((person) => {
      if (!person.Id) return;

      const existingPerson = people[person.Id];
      if (existingPerson) {
        existingPerson.Role = `${existingPerson.Role}, ${person.Role}`;
      } else {
        people[person.Id] = person;
      }
    });
    return Object.values(people);
  }, [item?.People]);

  if (!from) return null;

  return (
    <View {...props} className='flex flex-col'>
      <SectionHeader
        title={t("item_card.cast_and_crew")}
        accent={accent}
        count={loading ? undefined : destinctPeople.length}
      />
      <HorizontalScroll
        loading={loading}
        keyExtractor={(i, _idx) => i.Id?.toString() || ""}
        height={112}
        data={destinctPeople}
        renderItem={(i) => (
          <PersonAvatar
            person={i}
            onPress={() => {
              if (i.Id) {
                router.push({
                  pathname: "/persons/[personId]",
                  params: { personId: i.Id },
                });
              }
            }}
          />
        )}
      />
    </View>
  );
};
