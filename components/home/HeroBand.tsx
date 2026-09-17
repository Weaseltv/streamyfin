import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useSegments } from "expo-router";
import { useAtomValue } from "jotai";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Pressable, useWindowDimensions, View } from "react-native";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { NeonProgress } from "@/components/common/NeonProgress";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { getItemNavigation } from "@/components/common/TouchableItemRouter";
import { NeonBoard, typeAccent, typeLabel } from "@/constants/Colors";
import { glowRule, Sizes } from "@/constants/neon";
import useRouter from "@/hooks/useAppRouter";
import { useHaptic } from "@/hooks/useHaptic";
import { usePlayMedia } from "@/hooks/usePlayMedia";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { qualityLabel } from "@/utils/mediaQuality";
import { runtimeTicksToMinutes } from "@/utils/time";

export const HERO_HEIGHT = 176;

interface Props {
  items: BaseItemDto[];
  /** Eyebrow prefix before the type: "CONTINUE WATCHING" or "FEATURED". */
  eyebrow: string;
}

/**
 * The Home hero band: a 176 backdrop with a 3pt type tally on the left edge,
 * the quality badge top-right, eyebrow, Condensed 30 title, a meta line and
 * a 3pt progress beside a compact RESUME / PLAY in the type colour. Paging
 * is a swipe; the tally is the only chrome.
 */
export const HeroBand: React.FC<Props> = ({ items, eyebrow }) => {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  if (items.length === 0) return null;
  return (
    <View style={{ height: HERO_HEIGHT }}>
      <FlatList
        data={items}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.Id ?? ""}
        onMomentumScrollEnd={(e) =>
          setIndex(Math.round(e.nativeEvent.contentOffset.x / width))
        }
        renderItem={({ item }) => (
          <HeroSlide item={item} width={width} eyebrow={eyebrow} />
        )}
        getItemLayout={(_, i) => ({
          length: width,
          offset: width * i,
          index: i,
        })}
      />
      {items.length > 1 ? (
        <Text
          variant='tally'
          allowFontScaling={false}
          style={{
            position: "absolute",
            right: Sizes.gutter,
            bottom: 8,
            color: NeonBoard.low,
          }}
        >
          {index + 1}/{items.length}
        </Text>
      ) : null}
    </View>
  );
};

const HeroSlide: React.FC<{
  item: BaseItemDto;
  width: number;
  eyebrow: string;
}> = ({ item, width, eyebrow }) => {
  const api = useAtomValue(apiAtom);
  const router = useRouter();
  const { t } = useTranslation();
  const haptic = useHaptic("light");
  const playMedia = usePlayMedia();
  const segments = useSegments();
  const from = (segments as string[])[2] || "(home)";
  const accent = typeAccent(item);

  const uri = useMemo(
    () =>
      getBackdropUrl({
        api,
        item,
        quality: 70,
        width: Math.floor(width * 2),
      }),
    [api, item, width],
  );

  const open = useCallback(() => {
    haptic();
    router.push(getItemNavigation(item, from) as any);
  }, [item, from, router, haptic]);

  const position = item.UserData?.PlaybackPositionTicks ?? 0;
  const runtime = item.RunTimeTicks ?? 0;
  const progress = runtime > 0 ? position / runtime : 0;
  const left = runtime > 0 ? runtimeTicksToMinutes(runtime - position) : null;
  const meta = [
    item.ProductionYear,
    runtime > 0 ? runtimeTicksToMinutes(runtime) : null,
  ]
    .filter(Boolean)
    .join("   ");
  const title =
    item.Type === "Episode" ? (item.SeriesName ?? item.Name) : item.Name;
  const subtitle =
    item.Type === "Episode"
      ? `S${item.ParentIndexNumber}:E${item.IndexNumber} · ${item.Name}`
      : null;
  const quality = qualityLabel(item);

  const play = useCallback(() => {
    haptic();
    void playMedia(
      { itemId: item.Id!, offline: false, playbackPositionTicks: position },
      { item },
    );
  }, [haptic, playMedia, item, position]);

  return (
    <Pressable onPress={open} style={{ width, height: HERO_HEIGHT }}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width, height: HERO_HEIGHT }}
          contentFit='cover'
        />
      ) : (
        <View
          style={{
            width,
            height: HERO_HEIGHT,
            backgroundColor: NeonBoard.card,
          }}
        />
      )}
      {/* Flat wash so the type reads; no gradient. */}
      <View
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(5,6,8,0.62)",
        }}
      />
      <View
        style={[
          {
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: Sizes.tally,
            backgroundColor: accent,
          },
          glowRule(accent),
        ]}
      />
      {quality ? (
        <Badge
          text={quality}
          tint={NeonBoard.mid}
          style={{ position: "absolute", top: 10, right: Sizes.gutter }}
        />
      ) : null}
      <View
        style={{
          position: "absolute",
          left: Sizes.rowLead,
          right: Sizes.gutter,
          top: 40,
          bottom: 12,
          justifyContent: "space-between",
        }}
      >
        <View>
          <Text variant='eyebrow' accent={accent} numberOfLines={1}>
            {eyebrow} · {typeLabel(item) ?? ""}
          </Text>
          <Text variant='display' numberOfLines={1} style={{ marginTop: 4 }}>
            {title}
          </Text>
          <Text variant='meta' numberOfLines={1} style={{ marginTop: 4 }}>
            {subtitle ? `${subtitle}   ` : ""}
            <Text variant='meta'>{meta}</Text>
            {left && position > 0 ? (
              <Text variant='meta' muted>
                {"   "}
                {left} left
              </Text>
            ) : null}
          </Text>
        </View>
        <View className='flex flex-row items-center' style={{ gap: 12 }}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            {position > 0 ? (
              <NeonProgress progress={progress} color={accent} />
            ) : null}
          </View>
          <Button
            compact
            accent={accent}
            onPress={play}
            iconLeft={
              <Text variant='button' style={{ color: NeonBoard.onAccent }}>
                ▶
              </Text>
            }
          >
            {position > 0 ? t("item.resume") : t("item.play")}
          </Button>
        </View>
      </View>
    </Pressable>
  );
};
