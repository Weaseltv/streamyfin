import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import React from "react";
import { Platform, View, type ViewStyle } from "react-native";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { glowChip } from "@/constants/neon";
import { scaleSize } from "@/utils/scaleSize";

const isAggregateType = (item: BaseItemDto) =>
  item.Type === "Series" || item.Type === "BoxSet";

// TV sizes are scaled relative to a 1920×1080 reference (see scaleSize).
const tvBadgeBase: ViewStyle = {
  position: "absolute",
  top: scaleSize(8),
  right: scaleSize(8),
  height: scaleSize(28),
  borderRadius: scaleSize(14),
  backgroundColor: "rgba(255,255,255,0.92)",
  alignItems: "center",
  justifyContent: "center",
};

/** Phone: a 20 square, top-right, on the card. */
const squareBase: ViewStyle = {
  position: "absolute",
  top: 4,
  right: 4,
  height: 20,
  minWidth: 20,
  alignItems: "center",
  justifyContent: "center",
};

/**
 * Renders the unplayed-episode count badge for Series/BoxSet items that still
 * have episodes left to watch. Returns null for non-aggregate types, fully
 * watched items, or items with no unplayed count, so it is safe to mount
 * unconditionally as an overlay.
 */
export const UnplayedCountBadge: React.FC<{ item: BaseItemDto }> = React.memo(
  ({ item }) => {
    if (!isAggregateType(item)) return null;
    if (item.UserData?.Played) return null;
    const unplayed = item.UserData?.UnplayedItemCount ?? 0;
    if (unplayed <= 0) return null;
    // Cap at 1k+ to keep the badge compact (jellyfin-web caps at 99+).
    const label = unplayed >= 1000 ? "1k+" : String(unplayed);

    if (Platform.isTV) {
      return (
        <View
          style={[
            tvBadgeBase,
            { minWidth: scaleSize(28), paddingHorizontal: scaleSize(7) },
          ]}
        >
          <Text
            style={{
              fontSize: scaleSize(15),
              fontWeight: "700",
              color: "black",
            }}
          >
            {label}
          </Text>
        </View>
      );
    }

    return (
      <View
        style={[
          squareBase,
          {
            paddingHorizontal: 5,
            backgroundColor: NeonBoard.stage,
            borderWidth: 1,
            borderColor: NeonBoard.yellow,
          },
        ]}
      >
        <Text
          variant='badge'
          allowFontScaling={false}
          accent={NeonBoard.yellow}
        >
          {label}
        </Text>
      </View>
    );
  },
);

/**
 * Played state on a card. Phone: a 20 green square with a check glyph and a
 * green glow, top-right; a Series / BoxSet with episodes left shows the count
 * in a yellow hairline badge instead.
 */
export const WatchedIndicator: React.FC<{ item: BaseItemDto }> = ({ item }) => {
  const isMovieOrEpisode = item.Type === "Movie" || item.Type === "Episode";
  const isAggregate = isAggregateType(item);
  const isPlayed = item.UserData?.Played === true;

  if (Platform.isTV) {
    // Fully watched → white checkmark badge (top-right)
    if (isPlayed && (isMovieOrEpisode || isAggregate)) {
      return (
        <View style={[tvBadgeBase, { width: scaleSize(28) }]}>
          <Ionicons name='checkmark' size={scaleSize(18)} color='black' />
        </View>
      );
    }
    // Series/BoxSet with remaining episodes → count badge
    return <UnplayedCountBadge item={item} />;
  }

  if (isPlayed && (isMovieOrEpisode || isAggregate)) {
    return (
      <View
        style={[
          squareBase,
          { width: 20, backgroundColor: NeonBoard.green },
          glowChip(NeonBoard.green),
        ]}
      >
        <Ionicons name='checkmark' size={14} color={NeonBoard.onAccent} />
      </View>
    );
  }

  return <UnplayedCountBadge item={item} />;
};
