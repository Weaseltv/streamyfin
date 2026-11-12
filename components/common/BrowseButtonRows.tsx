import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { NeonBoard, typeAccent } from "@/constants/Colors";
import { Chip } from "./Chip";

export type BrowseType = "All" | "Movie" | "Series";
export type QuickList = "POPULAR" | "TRENDING" | "TOP_10" | "NEW";

const typeColor = (type: BrowseType) =>
  type === "All" ? NeonBoard.volt : typeAccent({ Type: type });

/**
 * The TV's first button row on collection, streaming and Watchlist pages:
 * ALL / MOVIES / SHOWS, always in volt / cyan / red, then RANDOM. Sized to fit
 * a 360-wide phone on one row (owner, 2026-10-16).
 */
export const TypeButtonRow: React.FC<{
  value: BrowseType;
  onChange: (type: BrowseType) => void;
  onRandom?: () => void;
  randomBusy?: boolean;
}> = ({ value, onChange, onRandom, randomBusy }) => {
  const { t } = useTranslation();
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 15,
        paddingTop: 16,
      }}
    >
      {(["All", "Movie", "Series"] as const).map((type) => (
        <Chip
          key={type}
          label={t(
            type === "All"
              ? "library.filters.all"
              : type === "Movie"
                ? "item_card.movies"
                : "item_card.shows",
          )}
          selected={value === type}
          tone={typeColor(type)}
          accent={typeColor(type)}
          onPress={() => onChange(type)}
        />
      ))}
      {onRandom ? (
        <Chip
          label={t("library.random")}
          icon={
            <Ionicons name='dice-outline' size={14} color={NeonBoard.text} />
          }
          disabled={randomBusy}
          onPress={onRandom}
        />
      ) : null}
    </View>
  );
};

/** The TV's quick lists on a streaming service page: POPULAR / TRENDING / TOP 10 / NEW. */
export const QuickListRow: React.FC<{
  value: QuickList;
  accent: string;
  onChange: (list: QuickList) => void;
}> = ({ value, accent, onChange }) => {
  const { t } = useTranslation();
  const labels: Record<QuickList, string> = {
    POPULAR: t("library.quick_list_popular"),
    TRENDING: t("library.quick_list_trending"),
    TOP_10: t("library.quick_list_top_10"),
    NEW: t("library.quick_list_new"),
  };
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 15,
        paddingTop: 10,
      }}
    >
      {(["POPULAR", "TRENDING", "TOP_10", "NEW"] as const).map((list) => (
        <Chip
          key={list}
          label={labels[list]}
          selected={value === list}
          accent={accent}
          onPress={() => onChange(list)}
        />
      ))}
    </View>
  );
};
