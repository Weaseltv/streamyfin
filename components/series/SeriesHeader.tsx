import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { ItemSlate } from "@/components/item/ItemSlate";
import { NeonBoard, typeAccent } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import { OverviewText } from "../OverviewText";

interface Props {
  item: BaseItemDto;
  /** Counts for the meta line. */
  seasons?: number;
  episodes?: number;
}

/** Series slate in yellow: eyebrow "SERIES · GENRE", title, year · seasons · episodes · rating · score. */
export const SeriesHeader = ({ item, seasons, episodes }: Props) => {
  const { t } = useTranslation();
  const startYear = useMemo(() => {
    if (item?.StartDate) {
      return new Date(item.StartDate)
        .toLocaleDateString("sv-SE", {
          calendar: "gregory",
          year: "numeric",
        })
        .toString()
        .trim();
    }
    return item.ProductionYear?.toString().trim();
  }, [item]);

  const endYear = useMemo(() => {
    if (item.EndDate) {
      return new Date(item.EndDate)
        .toLocaleDateString("sv-SE", {
          calendar: "gregory",
          year: "numeric",
        })
        .toString()
        .trim();
    }
    return "";
  }, [item]);

  const yearString = useMemo(() => {
    if (startYear && endYear) {
      if (startYear === endYear) return startYear;
      return `${startYear} – ${endYear}`;
    }
    return startYear || endYear || "";
  }, [startYear, endYear]);

  const slateItem = useMemo(
    () => ({ ...item, ProductionYear: undefined, RunTimeTicks: undefined }),
    [item],
  );

  return (
    <View>
      <ItemSlate
        item={slateItem}
        extraMeta={[
          yearString,
          seasons ? t("item.seasons_count", { count: seasons }) : null,
          episodes ? t("item.episodes_count", { count: episodes }) : null,
        ]}
      />
      <OverviewText
        text={item?.Overview}
        accent={typeAccent(item)}
        style={{
          paddingHorizontal: Sizes.gutter,
          paddingTop: 12,
          paddingBottom: 6,
          borderBottomWidth: 0,
          borderBottomColor: NeonBoard.line,
        }}
      />
    </View>
  );
};
