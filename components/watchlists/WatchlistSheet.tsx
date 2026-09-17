import { Feather } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge } from "@/components/Badge";
import { LoadingLine } from "@/components/common/LoadingLine";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { glowRule, Scrims, Sizes } from "@/constants/neon";
import useRouter from "@/hooks/useAppRouter";
import {
  useAddToWatchlist,
  useRemoveFromWatchlist,
} from "@/hooks/useWatchlistMutations";
import {
  useItemInWatchlists,
  useMyWatchlistsQuery,
} from "@/hooks/useWatchlists";
import type { StreamystatsWatchlist } from "@/utils/streamystats/types";

export interface WatchlistSheetRef {
  open: (item: BaseItemDto) => void;
  close: () => void;
}

interface WatchlistRowProps {
  watchlist: StreamystatsWatchlist;
  isInWatchlist: boolean;
  isCompatible: boolean;
  onToggle: () => void;
  isLoading: boolean;
}

/** A hairline row: name + type badge, "n items · description" meta, the state glyph right. */
const WatchlistRow: React.FC<WatchlistRowProps> = ({
  watchlist,
  isInWatchlist,
  isCompatible,
  onToggle,
  isLoading,
}) => {
  const { t } = useTranslation();
  const disabled = !isCompatible && !isInWatchlist;
  const meta = [
    t("watchlists.items_count", { count: watchlist.itemCount ?? 0 }),
    watchlist.description,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <TouchableOpacity
      onPress={onToggle}
      disabled={disabled || isLoading}
      activeOpacity={0.7}
      style={{
        minHeight: Sizes.row,
        paddingVertical: 8,
        paddingLeft: Sizes.rowLead,
        paddingRight: Sizes.gutter,
        flexDirection: "row",
        alignItems: "center",
        borderBottomWidth: 1,
        borderBottomColor: NeonBoard.line,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {isInWatchlist ? (
        <View
          style={[
            {
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: Sizes.tally,
              backgroundColor: NeonBoard.volt,
            },
            glowRule(NeonBoard.volt),
          ]}
        />
      ) : null}
      <View style={{ flex: 1, marginRight: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text variant='rowTitle' numberOfLines={1} style={{ flexShrink: 1 }}>
            {watchlist.name}
          </Text>
          {watchlist.allowedItemType && (
            <Badge text={watchlist.allowedItemType} />
          )}
        </View>
        <Text variant='meta' muted numberOfLines={1} style={{ marginTop: 2 }}>
          {meta}
        </Text>
      </View>
      <View style={{ width: 24, alignItems: "center" }}>
        {isInWatchlist ? (
          <Feather name='check' size={20} color={NeonBoard.volt} />
        ) : isCompatible ? (
          <Feather name='plus' size={20} color={NeonBoard.mid} />
        ) : (
          <Feather name='slash' size={18} color={NeonBoard.low} />
        )}
      </View>
    </TouchableOpacity>
  );
};

interface WatchlistSheetContentProps {
  item: BaseItemDto;
  onClose: () => void;
}

const WatchlistSheetContent: React.FC<WatchlistSheetContentProps> = ({
  item,
  onClose,
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: myWatchlists, isLoading: watchlistsLoading } =
    useMyWatchlistsQuery();
  const { data: watchlistsContainingItem, isLoading: checkingLoading } =
    useItemInWatchlists(item.Id);

  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();

  const isLoading = watchlistsLoading || checkingLoading;

  // Sort watchlists: ones containing item first, then compatible ones, then incompatible
  const sortedWatchlists = useMemo(() => {
    if (!myWatchlists) return [];

    return [...myWatchlists].sort((a, b) => {
      const aInWatchlist = watchlistsContainingItem?.includes(a.id) ?? false;
      const bInWatchlist = watchlistsContainingItem?.includes(b.id) ?? false;

      const aCompatible = !a.allowedItemType || a.allowedItemType === item.Type;
      const bCompatible = !b.allowedItemType || b.allowedItemType === item.Type;

      // Items in watchlist first
      if (aInWatchlist && !bInWatchlist) return -1;
      if (!aInWatchlist && bInWatchlist) return 1;

      // Then compatible items
      if (aCompatible && !bCompatible) return -1;
      if (!aCompatible && bCompatible) return 1;

      // Then alphabetically
      return a.name.localeCompare(b.name);
    });
  }, [myWatchlists, watchlistsContainingItem, item.Type]);

  const handleToggle = useCallback(
    async (watchlist: StreamystatsWatchlist) => {
      if (!item.Id) return;

      const isInWatchlist = watchlistsContainingItem?.includes(watchlist.id);

      if (isInWatchlist) {
        await removeFromWatchlist.mutateAsync({
          watchlistId: watchlist.id,
          itemId: item.Id,
          watchlistName: watchlist.name,
        });
      } else {
        await addToWatchlist.mutateAsync({
          watchlistId: watchlist.id,
          itemId: item.Id,
          watchlistName: watchlist.name,
        });
      }
    },
    [item.Id, watchlistsContainingItem, addToWatchlist, removeFromWatchlist],
  );

  const handleCreateNew = useCallback(() => {
    onClose();
    router.push("/(auth)/(tabs)/(watchlists)/create");
  }, [onClose, router]);

  const isItemCompatible = useCallback(
    (watchlist: StreamystatsWatchlist) => {
      if (!watchlist.allowedItemType) return true;
      return watchlist.allowedItemType === item.Type;
    },
    [item.Type],
  );

  return (
    <View
      style={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      {/* Head: tally, eyebrow + title, close, 2pt rule */}
      <View
        style={{
          paddingLeft: Sizes.rowLead,
          paddingRight: Sizes.gutter,
          paddingTop: 14,
          paddingBottom: 10,
        }}
      >
        <View
          style={[
            {
              position: "absolute",
              left: 0,
              top: 14,
              bottom: 10,
              width: Sizes.tally,
              backgroundColor: NeonBoard.volt,
            },
            glowRule(NeonBoard.volt),
          ]}
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flexShrink: 1 }}>
            <Text variant='eyebrow' accent={NeonBoard.volt} numberOfLines={1}>
              {item.Name}
            </Text>
            <Text
              variant='pageTitle'
              numberOfLines={1}
              style={{ marginTop: 2 }}
            >
              {t("watchlists.select_watchlist")}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole='button'
            accessibilityLabel={t("common.close")}
            hitSlop={8}
            style={{ paddingLeft: 12 }}
          >
            <Feather name='x' size={22} color={NeonBoard.mid} />
          </TouchableOpacity>
        </View>
      </View>
      <View
        style={[
          { height: 2, backgroundColor: NeonBoard.volt },
          glowRule(NeonBoard.volt),
        ]}
      />

      {isLoading ? (
        <View style={{ paddingVertical: 24 }}>
          <LoadingLine active />
          <Text
            variant='meta'
            muted
            style={{ textAlign: "center", marginTop: 16 }}
          >
            {t("watchlists.loading")}
          </Text>
        </View>
      ) : sortedWatchlists.length === 0 ? (
        <View style={{ paddingVertical: 28, alignItems: "center" }}>
          <Feather name='list' size={28} color={NeonBoard.volt} />
          <Text
            variant='rowTitle'
            style={{ textAlign: "center", marginTop: 12 }}
          >
            {t("watchlists.empty_title")}
          </Text>
          <Text
            variant='meta'
            muted
            style={{ textAlign: "center", marginTop: 4 }}
          >
            {t("watchlists.empty_description")}
          </Text>
        </View>
      ) : (
        <View>
          {sortedWatchlists.map((watchlist) => (
            <WatchlistRow
              key={watchlist.id}
              watchlist={watchlist}
              isInWatchlist={
                watchlistsContainingItem?.includes(watchlist.id) ?? false
              }
              isCompatible={isItemCompatible(watchlist)}
              onToggle={() => handleToggle(watchlist)}
              isLoading={
                addToWatchlist.isPending || removeFromWatchlist.isPending
              }
            />
          ))}
        </View>
      )}

      {/* Create new: a volt link row */}
      <TouchableOpacity
        onPress={handleCreateNew}
        activeOpacity={0.7}
        style={{
          minHeight: Sizes.row,
          paddingLeft: Sizes.rowLead,
          paddingRight: Sizes.gutter,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Feather name='plus' size={18} color={NeonBoard.volt} />
        <Text variant='rowTitle' accent={NeonBoard.volt}>
          {t("watchlists.create_new")}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export const WatchlistSheet = forwardRef<WatchlistSheetRef, object>(
  (_props, ref) => {
    const bottomSheetModalRef = useRef<BottomSheetModal>(null);
    const [currentItem, setCurrentItem] = React.useState<BaseItemDto | null>(
      null,
    );
    const insets = useSafeAreaInsets();

    useImperativeHandle(ref, () => ({
      open: (item: BaseItemDto) => {
        setCurrentItem(item);
        bottomSheetModalRef.current?.present();
      },
      close: () => {
        bottomSheetModalRef.current?.dismiss();
      },
    }));

    const handleClose = useCallback(() => {
      bottomSheetModalRef.current?.dismiss();
    }, []);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={1}
          style={[props.style, { backgroundColor: Scrims.modal }]}
        />
      ),
      [],
    );

    return (
      <BottomSheetModal
        ref={bottomSheetModalRef}
        enableDynamicSizing
        maxDynamicContentSize={600}
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{ backgroundColor: "transparent" }}
        backgroundStyle={{
          backgroundColor: NeonBoard.card,
          borderRadius: 0,
          borderTopWidth: 1,
          borderTopColor: NeonBoard.line2,
        }}
      >
        <BottomSheetView style={{ paddingBottom: insets.bottom }}>
          {currentItem && (
            <WatchlistSheetContent item={currentItem} onClose={handleClose} />
          )}
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);
