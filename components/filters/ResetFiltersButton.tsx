import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { TouchableOpacityProps } from "react-native";
import { Chip } from "@/components/common/Chip";
import { NeonBoard } from "@/constants/Colors";
import { useFilterReset } from "@/hooks/useFilterReset";

interface Props extends TouchableOpacityProps {
  libraryId: string;
}

/** The "Reset" chip, shown only while a filter or sort is active. */
export const ResetFiltersButton: React.FC<Props> = ({ libraryId, style }) => {
  const { hasActiveFilters, resetAllFilters } = useFilterReset(libraryId);
  const { t } = useTranslation();

  if (!hasActiveFilters) {
    return null;
  }

  return (
    <Chip
      label={t("library.filters.reset")}
      icon={<Feather name='x' size={13} color={NeonBoard.text} />}
      onPress={resetAllFilters}
      style={style}
    />
  );
};
