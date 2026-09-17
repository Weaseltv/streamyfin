import { Feather } from "@expo/vector-icons";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { isEqual } from "lodash";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Input } from "@/components/common/Input";
import { NeonSheetHead, NeonSheetRow } from "@/components/common/NeonSheet";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";

interface Props<T> {
  title: string;
  data: T[];
  initialValues: T[];
  set: (value: T[]) => void;
  renderItemLabel: (item: T) => string;
  multiple?: boolean;
  onClose: () => void;
}

const SEARCH_THRESHOLD = 15;

/**
 * Sheet content for FilterButton, rendered inside the GlobalModal bottom
 * sheet. The GlobalModal stores its content as a static snapshot, so this
 * component owns the selection state locally and mirrors changes back to the
 * caller through `set`.
 *
 * Uses a virtualized BottomSheetFlatList — filter lists (genres, tags, years)
 * can contain thousands of entries.
 *
 * The sheet sizes itself to this content, and it measures the scrollable's
 * content rather than the view tree: a title sitting next to the list is not
 * counted, and the sheet then opens too short and clips its last rows. So the
 * head, the count and the search box are the list's header instead.
 */
export const FilterSheetContent = <T,>({
  title,
  data,
  initialValues,
  set,
  renderItemLabel,
  multiple = false,
  onClose,
}: Props<T>) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [values, setValues] = useState<T[]>(initialValues);
  const [search, setSearch] = useState("");

  const showSearch = data.length > SEARCH_THRESHOLD;

  const filteredData = useMemo(() => {
    if (!search || !showSearch) return data;
    const query = search.toLowerCase();
    return data.filter((item) =>
      renderItemLabel(item).toLowerCase().includes(query),
    );
  }, [data, search, showSearch, renderItemLabel]);

  const select = (item: T) => {
    const selected = values.some((v) => isEqual(v, item));
    if (multiple) {
      const next = selected
        ? values.filter((v) => !isEqual(v, item))
        : values.concat(item);
      setValues(next);
      set(next);
    } else {
      if (!selected) {
        setValues([item]);
        set([item]);
      }
      setTimeout(() => onClose(), 250);
    }
  };

  return (
    <BottomSheetFlatList
      data={filteredData}
      keyExtractor={(item, index) => `${renderItemLabel(item)}-${index}`}
      keyboardShouldPersistTaps='handled'
      initialNumToRender={20}
      style={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
      contentContainerStyle={{ paddingBottom: Math.max(16, insets.bottom) }}
      ListHeaderComponent={
        <>
          <NeonSheetHead
            title={title}
            right={
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text variant='tally' accent={NeonBoard.volt}>
                  {t("search.x_items", { count: data.length })}
                </Text>
                <TouchableOpacity
                  onPress={onClose}
                  hitSlop={8}
                  accessibilityRole='button'
                  style={{
                    width: Sizes.iconButton,
                    height: Sizes.iconButton,
                    alignItems: "center",
                    justifyContent: "center",
                    marginLeft: 4,
                  }}
                >
                  <Feather name='x' size={22} color={NeonBoard.text} />
                </TouchableOpacity>
              </View>
            }
          />
          {showSearch && (
            <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <Input
                placeholder={t("search.search")}
                value={search}
                onChangeText={setSearch}
                returnKeyType='done'
              />
            </View>
          )}
        </>
      }
      renderItem={({ item }) => {
        const selected = values.some((v) => isEqual(v, item));
        return (
          <NeonSheetRow
            label={renderItemLabel(item)}
            selected={selected}
            onPress={() => select(item)}
          />
        );
      }}
    />
  );
};
