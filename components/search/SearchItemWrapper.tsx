import { FlashList } from "@shopify/flash-list";
import type React from "react";
import type { PropsWithChildren } from "react";
import { View } from "react-native";
import { SectionHeader } from "@/components/common/SectionHeader";
import { RAIL_GAP } from "@/components/home/ItemCard";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";

type SearchItemWrapperProps<T> = {
  items?: T[];
  renderItem: (item: any) => React.ReactElement | null;
  header?: string;
  /** Rule colour: the type colour of the section (movies orange, series yellow, people volt). */
  accent?: string;
  onEndReached?: (() => void) | null | undefined;
};

/**
 * One search result section: a section head on a type-coloured rule with the
 * count, and a horizontal rail of cards on a 12 gutter with a 10 gap.
 */
export const SearchItemWrapper = <T,>({
  items,
  renderItem,
  header,
  accent = NeonBoard.volt,
  onEndReached,
}: PropsWithChildren<SearchItemWrapperProps<T>>) => {
  if (!items || items.length === 0) return null;

  return (
    <View style={{ marginBottom: 8 }}>
      {header ? (
        <SectionHeader title={header} accent={accent} count={items.length} />
      ) : null}
      <FlashList
        horizontal
        contentContainerStyle={{
          paddingHorizontal: Sizes.gutter,
          paddingBottom: 8,
        }}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, index) => index.toString()}
        data={items}
        onEndReachedThreshold={1}
        onEndReached={onEndReached}
        renderItem={({ item }) =>
          item ? (
            <View style={{ marginRight: RAIL_GAP }}>{renderItem(item)}</View>
          ) : null
        }
      />
    </View>
  );
};
