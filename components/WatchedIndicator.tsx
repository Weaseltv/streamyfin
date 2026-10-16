import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import React from "react";
import { Platform, View, type ViewStyle } from "react-native";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
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
  top: 6,
  right: 6,
  height: 20,
  minWidth: 20,
  alignItems: "center",
  justifyContent: "center",
};

/**
 * The count badge top-right: a collection's number of titles (phone, as on
 * the TV), or a series' unplayed-episode count. Returns null for other types,
 * fully watched series, or no count, so it is safe to mount unconditionally as
 * an overlay.
 */
export const UnplayedCountBadge: React.FC<{ item: BaseItemDto }> = React.memo(
  ({ item }) => {
    if (!isAggregateType(item)) return null;
    const titles = !Platform.isTV && item.Type === "BoxSet";
    if (!titles && item.UserData?.Played) return null;
    const count = titles
      ? (item.ChildCount ?? 0)
      : (item.UserData?.UnplayedItemCount ?? 0);
    if (count <= 0) return null;
    // Cap at 1k+ to keep the badge compact (jellyfin-web caps at 99+).
    const label = count >= 1000 ? "1k+" : String(count);

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

    // The TV's count badge: black at 75 %, rounded, Exo 2 400 11 in `text`
    return (
      <View
        style={[
          squareBase,
          {
            paddingHorizontal: 5,
            borderRadius: 4,
            backgroundColor: "rgba(0,0,0,0.75)",
          },
        ]}
      >
        <Text
          allowFontScaling={false}
          style={{ fontSize: 11, lineHeight: 14, color: NeonBoard.text }}
        >
          {label}
        </Text>
      </View>
    );
  },
);

/**
 * Played state on a card. Phone: a 20 green square with a dark check and a
 * hairline black edge, top-right, as on the TV; a collection shows its title
 * count and a series with episodes left its unplayed count instead.
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

  if (isPlayed && (isMovieOrEpisode || item.Type === "Series")) {
    return (
      <View
        style={[
          squareBase,
          {
            width: 20,
            backgroundColor: NeonBoard.green,
            borderWidth: 0.5,
            borderColor: "#000000",
          },
        ]}
      >
        <Ionicons name='checkmark' size={15} color={NeonBoard.onAccent} />
      </View>
    );
  }

  return <UnplayedCountBadge item={item} />;
};
