import { useMemo, useState } from "react";
import { View } from "react-native";
import { Chip } from "@/components/common/Chip";
import { JellyseerrSearchSort } from "@/components/jellyseerr/JellyseerrIndexPage";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import { MediaType } from "@/utils/jellyseerr/server/constants/media";

export type DiscoverMediaFilter = MediaType.MOVIE | MediaType.TV | undefined;

interface DiscoverFiltersProps {
  /** Movies · Series chips; `undefined` shows both sections. */
  mediaFilter: DiscoverMediaFilter;
  setMediaFilter: (value: DiscoverMediaFilter) => void;
  /** Sort chip (a caret picker over the native menu). Hidden when false. */
  showSort?: boolean;
  jellyseerrOrderBy: JellyseerrSearchSort;
  setJellyseerrOrderBy: (value: JellyseerrSearchSort) => void;
  jellyseerrSortOrder: "asc" | "desc";
  setJellyseerrSortOrder: (value: "asc" | "desc") => void;
  t: (key: string) => string;
}

const sortOptions = Object.keys(JellyseerrSearchSort).filter((v) =>
  Number.isNaN(Number(v)),
);

const orderOptions = ["asc", "desc"] as const;

/**
 * Requests filters as chips: Movies · Series toggle the section shown, and a
 * caret chip opens the sort menu (`PlatformDropdown` keeps its native menu).
 */
export const DiscoverFilters: React.FC<DiscoverFiltersProps> = ({
  mediaFilter,
  setMediaFilter,
  showSort = false,
  jellyseerrOrderBy,
  setJellyseerrOrderBy,
  jellyseerrSortOrder,
  setJellyseerrSortOrder,
  t,
}) => {
  const [sortOpen, setSortOpen] = useState(false);

  const sortGroups = useMemo(
    () => [
      {
        title: t("library.filters.sort_by"),
        options: sortOptions.map((item) => ({
          type: "radio" as const,
          label: t(`home.settings.plugins.jellyseerr.order_by.${item}`),
          value: item,
          selected:
            jellyseerrOrderBy === (item as unknown as JellyseerrSearchSort),
          onPress: () =>
            setJellyseerrOrderBy(item as unknown as JellyseerrSearchSort),
        })),
      },
      {
        title: t("library.filters.sort_order"),
        options: orderOptions.map((item) => ({
          type: "radio" as const,
          label: t(`library.filters.${item}`),
          value: item,
          selected: jellyseerrSortOrder === item,
          onPress: () => setJellyseerrSortOrder(item),
        })),
      },
    ],
    [
      jellyseerrOrderBy,
      jellyseerrSortOrder,
      setJellyseerrOrderBy,
      setJellyseerrSortOrder,
      t,
    ],
  );

  const toggle = (value: MediaType.MOVIE | MediaType.TV) =>
    setMediaFilter(mediaFilter === value ? undefined : value);

  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <Chip
        label={t("search.movies")}
        selected={mediaFilter === MediaType.MOVIE}
        onPress={() => toggle(MediaType.MOVIE)}
      />
      <Chip
        label={t("search.series")}
        selected={mediaFilter === MediaType.TV}
        onPress={() => toggle(MediaType.TV)}
      />
      {showSort ? (
        <PlatformDropdown
          groups={sortGroups}
          title={t("library.filters.sort_by")}
          open={sortOpen}
          onOpenChange={setSortOpen}
          trigger={
            <Chip
              label={t(
                `home.settings.plugins.jellyseerr.order_by.${jellyseerrOrderBy}`,
              )}
              caret
            />
          }
        />
      ) : null}
    </View>
  );
};
