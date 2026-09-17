import { Ionicons } from "@expo/vector-icons";
import { getLiveTvApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dimensions, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chip } from "@/components/common/Chip";
import { ItemImage } from "@/components/common/ItemImage";
import { LoadingLine } from "@/components/common/LoadingLine";
import { Text } from "@/components/common/Text";
import {
  GUIDE_HOUR_WIDTH,
  guideGridStart,
  HourHeader,
} from "@/components/livetv/HourHeader";
import {
  GUIDE_ROW_HEIGHT,
  LiveTVGuideRow,
} from "@/components/livetv/LiveTVGuideRow";
import { NeonBoard } from "@/constants/Colors";
import { glowOverline, Sizes } from "@/constants/neon";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

const HOUR_HEIGHT = 30;
const CHANNEL_COLUMN = 64;
const ITEMS_PER_PAGE = 20;

const MemoizedLiveTVGuideRow = React.memo(LiveTVGuideRow);

export default function LiveTvGuidePage() {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const insets = useSafeAreaInsets();
  const [date, _setDate] = useState<Date>(new Date());
  const [currentPage, setCurrentPage] = useState(1);

  const { data: channels } = useQuery({
    queryKey: ["livetv", "channels", currentPage],
    queryFn: async () => {
      const res = await getLiveTvApi(api!).getLiveTvChannels({
        startIndex: (currentPage - 1) * ITEMS_PER_PAGE,
        limit: ITEMS_PER_PAGE,
        enableFavoriteSorting: true,
        userId: user?.Id,
        addCurrentProgram: false,
        enableUserData: false,
        enableImageTypes: ["Primary"],
      });
      return res.data;
    },
  });

  const { data: programs } = useQuery({
    queryKey: ["livetv", "programs", date, currentPage],
    queryFn: async () => {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const now = new Date();
      const isToday = startOfDay.toDateString() === now.toDateString();

      const res = await getLiveTvApi(api!).getPrograms({
        getProgramsDto: {
          MaxStartDate: endOfDay.toISOString(),
          MinEndDate: isToday ? now.toISOString() : startOfDay.toISOString(),
          ChannelIds: channels?.Items?.map((c) => c.Id).filter(
            Boolean,
          ) as string[],
          ImageTypeLimit: 1,
          EnableImages: false,
          SortBy: ["StartDate"],
          EnableTotalRecordCount: false,
          EnableUserData: false,
        },
      });
      return res.data;
    },
    enabled: !!channels,
  });

  const screenWidth = Dimensions.get("window").width;

  const [scrollX, setScrollX] = useState(0);
  const [gridStart] = useState(() => guideGridStart());
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  const nowX =
    ((now.getTime() - gridStart.getTime()) / 3600000) * GUIDE_HOUR_WIDTH;
  const { t } = useTranslation();

  const handleNextPage = useCallback(() => {
    setCurrentPage((prev) => prev + 1);
  }, []);

  const handlePrevPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: NeonBoard.stage }}>
      <LoadingLine accent={NeonBoard.cyan} active={!channels || !programs} />
      <ScrollView
        nestedScrollEnabled
        key={"home"}
        contentContainerStyle={{
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingBottom: 16,
        }}
      >
        <PageButtons
          currentPage={currentPage}
          onPrevPage={handlePrevPage}
          onNextPage={handleNextPage}
          isNextDisabled={
            !channels || (channels?.Items?.length || 0) < ITEMS_PER_PAGE
          }
        />

        <View className='flex flex-row'>
          <View style={{ width: CHANNEL_COLUMN }}>
            <View
              style={{
                height: HOUR_HEIGHT,
                justifyContent: "center",
                paddingLeft: Sizes.gutter,
                borderBottomWidth: 1,
                borderBottomColor: NeonBoard.line,
              }}
            >
              <Text variant='overline' muted allowFontScaling={false}>
                {t("live_tv.tabs.channels")}
              </Text>
            </View>
            {channels?.Items?.map((c, i) => (
              <View
                key={i}
                style={{
                  height: GUIDE_ROW_HEIGHT,
                  paddingLeft: Sizes.gutter,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  borderBottomWidth: 1,
                  borderBottomColor: NeonBoard.line,
                }}
              >
                <Text
                  variant='numeral'
                  allowFontScaling={false}
                  numberOfLines={1}
                >
                  {c.ChannelNumber ?? i + 1}
                </Text>
                <View
                  style={{
                    width: 34,
                    height: 22,
                    borderWidth: 1,
                    borderColor: NeonBoard.line2,
                    backgroundColor: NeonBoard.inset,
                    overflow: "hidden",
                  }}
                >
                  <ItemImage
                    style={{ width: "100%", height: "100%" }}
                    contentFit='contain'
                    item={c}
                  />
                </View>
              </View>
            ))}
          </View>
          <ScrollView
            style={{
              width: screenWidth - CHANNEL_COLUMN,
            }}
            horizontal
            scrollEnabled
            scrollEventThrottle={32}
            onScroll={(e) => {
              setScrollX(e.nativeEvent.contentOffset.x);
            }}
          >
            <View className='flex flex-col'>
              <HourHeader height={HOUR_HEIGHT} gridStart={gridStart} />
              {channels?.Items?.map((c, _i) => (
                <MemoizedLiveTVGuideRow
                  channel={c}
                  programs={programs?.Items}
                  gridStart={gridStart}
                  key={c.Id}
                  scrollX={scrollX}
                />
              ))}
              {/* The now-line: 2pt cyan with a 12 dot, from the header down. */}
              {nowX >= 0 ? (
                <View
                  pointerEvents='none'
                  style={[
                    {
                      position: "absolute",
                      left: nowX - 1,
                      top: HOUR_HEIGHT - 6,
                      bottom: 0,
                      width: 2,
                      backgroundColor: NeonBoard.cyan,
                    },
                    glowOverline(NeonBoard.cyan),
                  ]}
                >
                  <View
                    style={{
                      position: "absolute",
                      top: 0,
                      left: -5,
                      width: 12,
                      height: 12,
                      backgroundColor: NeonBoard.cyan,
                    }}
                  />
                </View>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

interface PageButtonsProps {
  currentPage: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  isNextDisabled: boolean;
}

const PageButtons: React.FC<PageButtonsProps> = ({
  currentPage,
  onPrevPage,
  onNextPage,
  isNextDisabled,
}) => {
  const { t } = useTranslation();
  return (
    <View
      className='flex flex-row justify-between items-center w-full'
      style={{ paddingHorizontal: Sizes.gutter, paddingVertical: 10 }}
    >
      <Chip
        label={t("live_tv.previous")}
        accent={NeonBoard.cyan}
        disabled={currentPage === 1}
        onPress={onPrevPage}
        icon={<Ionicons name='chevron-back' size={12} color={NeonBoard.text} />}
      />
      <Text variant='tally' accent={NeonBoard.cyan}>
        {t("live_tv.page", { page: currentPage })}
      </Text>
      <Chip
        label={t("live_tv.next")}
        accent={NeonBoard.cyan}
        disabled={isNextDisabled}
        onPress={onNextPage}
        caret={false}
        icon={
          <Ionicons name='chevron-forward' size={12} color={NeonBoard.text} />
        }
      />
    </View>
  );
};
