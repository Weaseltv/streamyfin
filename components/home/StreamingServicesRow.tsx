import { useActionSheet } from "@expo/react-native-action-sheet";
import { Feather } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Text } from "@/components/common/Text";
import { TouchableItemRouter } from "@/components/common/TouchableItemRouter";
import { RAIL_GAP, railCardWidth } from "@/components/home/ItemCard";
import { StreamingServicePoster } from "@/components/streaming/StreamingServicePoster";
import { NeonBoard } from "@/constants/Colors";
import { Scrims, Sizes } from "@/constants/neon";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  loadStreamingCollections,
  streamingService,
} from "@/utils/streamingCollections";
import { loadStreamingOrder, saveStreamingOrder } from "@/utils/streamingOrder";

interface Props {
  queryKey: (string | undefined)[];
  refetchInterval?: number | false;
}

const WIDTH = railCardWidth("vertical");
const HEIGHT = Math.round(WIDTH * 1.5);

/**
 * Home's Streaming Services row, as on WeaselPlex TV: "COLLECTIONS" over
 * "STREAMING SERVICES" in the Collections yellow, each service a bundled
 * wordmark on its brand gradient. Long press a service to reorder the row or
 * reset it; the order is saved on this device for this member, as on the TV.
 */
export const StreamingServicesRow: React.FC<Props> = ({
  queryKey,
  refetchInterval = false,
}) => {
  const { t } = useTranslation();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { showActionSheetWithOptions } = useActionSheet();
  const [reordering, setReordering] = useState<BaseItemDto[] | null>(null);

  const { data } = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      api && user?.Id
        ? loadStreamingCollections(
            api,
            user.Id,
            signal,
            loadStreamingOrder(user.Id),
          )
        : Promise.resolve([]),
    enabled: !!api && !!user?.Id,
    refetchInterval,
  });

  const saveOrder = useCallback(
    (ids: string[]) => {
      if (!user?.Id) return;
      saveStreamingOrder(user.Id, ids);
      queryClient.invalidateQueries({ queryKey });
    },
    [queryClient, queryKey, user?.Id],
  );

  const showMenu = useCallback(
    (item: BaseItemDto) => {
      const options = [
        t("home.streaming_reorder"),
        t("home.streaming_reset_order"),
        t("common.cancel"),
      ];
      showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 2,
          ...(Platform.OS === "android"
            ? {
                title: item.Name ?? undefined,
                tintColor: NeonBoard.text,
                cancelButtonTintColor: NeonBoard.collections,
                titleTextStyle: {
                  color: NeonBoard.collections,
                  fontWeight: "600" as const,
                },
                containerStyle: {
                  backgroundColor: NeonBoard.card,
                  paddingBottom: insets.bottom,
                  borderTopWidth: 2,
                  borderTopColor: NeonBoard.collections,
                },
                showSeparators: true,
                separatorStyle: { backgroundColor: NeonBoard.line },
              }
            : {}),
        },
        (index) => {
          if (index === 0) setReordering(data ?? []);
          if (index === 1) saveOrder([]);
        },
      );
    },
    [data, insets.bottom, saveOrder, showActionSheetWithOptions, t],
  );

  if (!data || data.length === 0) return null;

  const move = (from: number, to: number) => {
    setReordering((current) => {
      if (!current || to < 0 || to >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  return (
    <View>
      <SectionHeader
        kicker={t("home.kicker_collections")}
        title={t("home.streaming")}
        accent={NeonBoard.collections}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className='flex flex-row px-4' style={{ gap: RAIL_GAP }}>
          {data.map((item) => {
            const service = streamingService(item.Name);
            return (
              <TouchableItemRouter
                key={item.Id}
                item={item}
                onLongPress={() => showMenu(item)}
                accessible
                accessibilityRole='button'
                accessibilityLabel={item.Name ?? undefined}
                style={{ width: WIDTH }}
              >
                {service ? (
                  <StreamingServicePoster
                    wordmark={service.wordmark}
                    brand={service.brand}
                    width={WIDTH}
                    height={HEIGHT}
                  />
                ) : (
                  <View
                    style={{
                      width: WIDTH,
                      height: HEIGHT,
                      borderWidth: 1,
                      borderColor: NeonBoard.line2,
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 8,
                    }}
                  >
                    <Text variant='cardTitle' style={{ textAlign: "center" }}>
                      {item.Name}
                    </Text>
                  </View>
                )}
              </TouchableItemRouter>
            );
          })}
        </View>
      </ScrollView>
      <Modal
        visible={reordering !== null}
        transparent
        animationType='slide'
        onRequestClose={() => setReordering(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: Scrims.modal }}
          onPress={() => setReordering(null)}
        />
        <View
          style={{
            backgroundColor: NeonBoard.card,
            borderTopWidth: 2,
            borderTopColor: NeonBoard.collections,
            paddingBottom: insets.bottom + 12,
            maxHeight: "75%",
          }}
        >
          <View style={{ paddingHorizontal: Sizes.gutter, paddingTop: 14 }}>
            <Text variant='kicker' accent='#FFFF33'>
              {t("home.streaming")}
            </Text>
            <Text variant='section' accent='#FFFFFF'>
              {t("home.streaming_reorder")}
            </Text>
          </View>
          <ScrollView style={{ marginTop: 8 }}>
            {reordering?.map((item, index) => (
              <View
                key={item.Id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: Sizes.gutter,
                  height: 52,
                  borderBottomWidth: 1,
                  borderBottomColor: NeonBoard.line,
                }}
              >
                <Text variant='rowTitle' style={{ flex: 1 }} numberOfLines={1}>
                  {item.Name}
                </Text>
                <TouchableOpacity
                  onPress={() => move(index, index - 1)}
                  disabled={index === 0}
                  accessibilityLabel={t("home.streaming_move_up", {
                    name: item.Name,
                  })}
                  hitSlop={6}
                  style={{ padding: 8, opacity: index === 0 ? 0.3 : 1 }}
                >
                  <Feather name='chevron-up' size={22} color={NeonBoard.text} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => move(index, index + 1)}
                  disabled={index === reordering.length - 1}
                  accessibilityLabel={t("home.streaming_move_down", {
                    name: item.Name,
                  })}
                  hitSlop={6}
                  style={{
                    padding: 8,
                    opacity: index === reordering.length - 1 ? 0.3 : 1,
                  }}
                >
                  <Feather
                    name='chevron-down'
                    size={22}
                    color={NeonBoard.text}
                  />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
          <View
            style={{
              flexDirection: "row",
              gap: 12,
              paddingHorizontal: Sizes.gutter,
              paddingTop: 14,
            }}
          >
            <Button
              variant='border'
              compact
              className='flex-1'
              onPress={() => setReordering(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              compact
              accent={NeonBoard.collections}
              className='flex-1'
              onPress={() => {
                saveOrder(
                  (reordering ?? [])
                    .map((item) => item.Id)
                    .filter((id): id is string => !!id),
                );
                setReordering(null);
              }}
            >
              {t("home.streaming_save_order")}
            </Button>
          </View>
        </View>
      </Modal>
    </View>
  );
};
