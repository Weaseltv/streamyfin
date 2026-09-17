import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import type React from "react";
import { useMemo } from "react";
import { View } from "react-native";
import { Badge } from "@/components/Badge";
import { ItemImage } from "@/components/common/ItemImage";
import { Text } from "@/components/common/Text";
import { NeonBoard, typeAccent, typeLabel } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import { runtimeTicksToMinutes } from "@/utils/time";

interface Props {
  item: BaseItemDto;
  /** Show the 108×162 poster (movies). Series and episodes carry none. */
  poster?: boolean;
  /** Extra meta parts appended to the meta line ("2 seasons", "16 episodes"). */
  extraMeta?: (string | null | undefined)[];
}

/** Year · runtime · rating · score in the type colour · RT badge. */
export const ItemMetaLine: React.FC<{
  item: BaseItemDto;
  extra?: (string | null | undefined)[];
}> = ({ item, extra = [] }) => {
  const accent = typeAccent(item);
  const parts = [
    item.ProductionYear ? String(item.ProductionYear) : null,
    item.RunTimeTicks ? runtimeTicksToMinutes(item.RunTimeTicks) : null,
    ...extra,
    item.OfficialRating ?? null,
  ].filter(Boolean) as string[];
  return (
    <View
      className='flex flex-row flex-wrap items-center'
      style={{ gap: 10, marginTop: 6 }}
    >
      {parts.map((p, i) => (
        <Text key={i} variant='tally' style={{ color: NeonBoard.mid }}>
          {p}
        </Text>
      ))}
      {item.CommunityRating ? (
        <Text variant='tally' accent={accent}>
          {item.CommunityRating.toFixed(1)}
        </Text>
      ) : null}
      {item.CriticRating ? (
        <Badge
          text={`RT ${item.CriticRating}%`}
          tint={NeonBoard.mid}
          iconLeft={
            <Image
              source={
                item.CriticRating < 60
                  ? require("@/assets/images/rt_rotten.svg")
                  : require("@/assets/images/rt_fresh.svg")
              }
              style={{ width: 11, height: 11 }}
            />
          }
        />
      ) : null}
    </View>
  );
};

/**
 * The item slate that overlaps the backdrop: optional 108×162 poster with a
 * 1pt `line2` border, eyebrow "MOVIE · GENRES", Condensed 30 title, meta line.
 */
export const ItemSlate: React.FC<Props> = ({ item, poster, extraMeta }) => {
  const accent = typeAccent(item);
  const eyebrow = useMemo(() => {
    const type =
      item.Type === "Episode"
        ? `${typeLabel(item)} · S${item.ParentIndexNumber ?? "?"}:E${item.IndexNumber ?? "?"}`
        : typeLabel(item);
    const genres = item.Genres?.slice(0, 2).join(", ");
    return [type, genres].filter(Boolean).join(" · ");
  }, [item]);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        paddingHorizontal: Sizes.gutter,
        gap: 16,
      }}
    >
      {poster ? (
        <View
          style={{
            width: 108,
            height: 162,
            borderWidth: 1,
            borderColor: NeonBoard.line2,
            backgroundColor: NeonBoard.card2,
            boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
          }}
        >
          <ItemImage
            item={item}
            variant='Primary'
            style={{ width: "100%", height: "100%" }}
          />
        </View>
      ) : null}
      <View style={{ flex: 1, paddingBottom: 2 }}>
        <Text variant='eyebrow' accent={accent} numberOfLines={1}>
          {eyebrow}
        </Text>
        <Text variant='display' numberOfLines={2} style={{ marginTop: 4 }}>
          {item.Type === "Episode" ? item.SeriesName : item.Name}
        </Text>
        {item.Type === "Episode" ? (
          <Text variant='rowTitle' numberOfLines={2} style={{ marginTop: 2 }}>
            {item.Name}
          </Text>
        ) : null}
        <ItemMetaLine item={item} extra={extraMeta} />
      </View>
    </View>
  );
};
