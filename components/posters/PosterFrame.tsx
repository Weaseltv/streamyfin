import { Feather } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type { PropsWithChildren } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";
import { Badge } from "@/components/Badge";
import { ProgressBar } from "@/components/common/ProgressBar";
import { WatchedIndicator } from "@/components/WatchedIndicator";
import { NeonBoard, typeAccent, typeLabel } from "@/constants/Colors";
import { glowChip } from "@/constants/neon";
import { useDownloadedItem } from "@/hooks/useDownloadedItem";

interface Props {
  item: BaseItemDto;
  width: number;
  height: number;
  /** Type (or status) badge top-left. Defaults to the item's type label. */
  badge?: string | null;
  badgeColor?: string;
  /** Show the played check / unplayed count top-right. */
  watched?: boolean;
  /** Show the 3pt type-coloured progress at the bottom edge. */
  progress?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The card frame every poster and thumb shares: 1pt `line` border, radius 0,
 * badge top-left, played square top-right, progress at the bottom edge, and
 * the green `download` glyph bottom-right when the item is downloaded.
 */
export const PosterFrame: React.FC<PropsWithChildren<Props>> = ({
  item,
  width,
  height,
  badge,
  badgeColor,
  watched = true,
  progress = true,
  style,
  children,
}) => {
  const accent = badgeColor ?? typeAccent(item);
  const label = badge === undefined ? typeLabel(item) : badge;
  const downloaded = useDownloadedItem(item.Id);

  return (
    <View
      style={[
        {
          width,
          height,
          borderWidth: 1,
          borderColor: NeonBoard.line,
          backgroundColor: NeonBoard.card2,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {children}
      {label ? (
        <Badge
          text={label}
          tint={accent}
          glow
          style={[{ position: "absolute", top: 6, left: 6 }, glowChip(accent)]}
        />
      ) : null}
      {watched ? <WatchedIndicator item={item} /> : null}
      {downloaded ? (
        <View style={{ position: "absolute", right: 6, bottom: 8 }}>
          <Feather name='download' size={14} color={NeonBoard.green} />
        </View>
      ) : null}
      {progress ? <ProgressBar item={item} /> : null}
    </View>
  );
};
