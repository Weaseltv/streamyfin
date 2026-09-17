import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { HardwareAccelerationType } from "@jellyfin/sdk/lib/generated-client";
import {
  GeneralCommandType,
  PlaystateCommand,
  SessionInfoDto,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity, View } from "react-native";
import { Badge } from "@/components/Badge";
import { LoadingLine } from "@/components/common/LoadingLine";
import { NeonProgress } from "@/components/common/NeonProgress";
import { Text } from "@/components/common/Text";
import Poster from "@/components/posters/Poster";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import { useInterval } from "@/hooks/useInterval";
import { useSessions, type useSessionsProps } from "@/hooks/useSessions";
import { apiAtom } from "@/providers/JellyfinProvider";
import { formatBitrate } from "@/utils/bitrate";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { formatTimeString } from "@/utils/time";

export default function SessionsPage() {
  const { sessions, isLoading } = useSessions({} as useSessionsProps);
  const { t } = useTranslation();

  if (isLoading) return <LoadingLine />;

  if (!sessions || sessions.length === 0)
    return (
      <View className='h-full w-full flex justify-center items-center'>
        <Text variant='body' muted>
          {t("home.sessions.no_active_sessions")}
        </Text>
      </View>
    );

  return (
    <FlashList
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingTop: Platform.OS === "android" ? 10 : 0,
        paddingHorizontal: Sizes.gutter,
        paddingBottom: 150,
      }}
      data={sessions}
      renderItem={({ item }) => <SessionCard session={item} />}
      keyExtractor={(item) => item.Id || ""}
    />
  );
}

interface SessionCardProps {
  session: SessionInfoDto;
}

const SessionCard = ({ session }: SessionCardProps) => {
  const { t } = useTranslation();
  const api = useAtomValue(apiAtom);
  const [remainingTicks, setRemainingTicks] = useState<number>(0);

  const tick = () => {
    if (session.PlayState?.IsPaused) return;
    setRemainingTicks(remainingTicks - 10000000);
  };

  const getProgressPercentage = () => {
    if (!session.NowPlayingItem?.RunTimeTicks) {
      return 0;
    }

    return Math.round(
      (100 / session.NowPlayingItem?.RunTimeTicks) *
        (session.NowPlayingItem?.RunTimeTicks - remainingTicks),
    );
  };

  useEffect(() => {
    const currentTime = session.PlayState?.PositionTicks;
    const duration = session.NowPlayingItem?.RunTimeTicks;
    if (
      duration !== null &&
      duration !== undefined &&
      currentTime !== null &&
      currentTime !== undefined
    ) {
      const remainingTimeTicks = duration - currentTime;
      setRemainingTicks(remainingTimeTicks);
    }
  }, [session]);

  const { data: ipInfo } = useQuery<{
    cityName?: string;
    countryCode?: string;
  }>({
    queryKey: ["ipinfo", session.RemoteEndPoint],
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      const resp = await api!.axiosInstance.get(
        `https://freeipapi.com/api/json/${session.RemoteEndPoint}`,
      );
      return resp.data;
    },
    enabled: !!api,
  });

  // Handle session controls
  const [isControlLoading, setIsControlLoading] = useState<
    Record<string, boolean>
  >({});

  const handleSystemCommand = async (command: GeneralCommandType) => {
    if (!api || !session.Id) return false;

    setIsControlLoading({ ...isControlLoading, [command]: true });

    try {
      getSessionApi(api).sendSystemCommand({
        sessionId: session.Id,
        command,
      });
      return true;
    } catch (error) {
      console.error(`Error sending ${command} command:`, error);
      return false;
    } finally {
      setIsControlLoading({ ...isControlLoading, [command]: false });
    }
  };

  const handlePlaystateCommand = async (command: PlaystateCommand) => {
    if (!api || !session.Id) return false;

    setIsControlLoading({ ...isControlLoading, [command]: true });

    try {
      getSessionApi(api).sendPlaystateCommand({
        sessionId: session.Id,
        command,
      });

      return true;
    } catch (error) {
      console.error(`Error sending playstate ${command} command:`, error);
      return false;
    } finally {
      setIsControlLoading({ ...isControlLoading, [command]: false });
    }
  };

  const handlePlayPause = async () => {
    console.log("handlePlayPause");
    await handlePlaystateCommand(PlaystateCommand.PlayPause);
  };

  const handleStop = async () => {
    await handlePlaystateCommand(PlaystateCommand.Stop);
  };

  const handlePrevious = async () => {
    await handlePlaystateCommand(PlaystateCommand.PreviousTrack);
  };

  const handleNext = async () => {
    await handlePlaystateCommand(PlaystateCommand.NextTrack);
  };

  const handleToggleMute = async () => {
    await handleSystemCommand(GeneralCommandType.ToggleMute);
  };
  const handleVolumeUp = async () => {
    await handleSystemCommand(GeneralCommandType.VolumeUp);
  };
  const handleVolumeDown = async () => {
    await handleSystemCommand(GeneralCommandType.VolumeDown);
  };

  useInterval(tick, 1000);

  return (
    <View
      className='flex flex-col mb-4'
      style={{ borderBottomWidth: 1, borderBottomColor: NeonBoard.line }}
    >
      <View className='flex flex-row py-3'>
        <View className='w-20 pr-4'>
          <Poster
            id={session.NowPlayingItem?.Id}
            url={getPrimaryImageUrl({ api, item: session.NowPlayingItem })}
          />
        </View>
        <View className='w-full flex-1'>
          <View className='flex flex-row justify-between'>
            <View className='flex-1 pr-4'>
              {session.NowPlayingItem?.Type === "Episode" ? (
                <>
                  <Text variant='rowTitle'>{session.NowPlayingItem?.Name}</Text>
                  <Text numberOfLines={1} variant='meta' muted>
                    {`S${session.NowPlayingItem.ParentIndexNumber?.toString()}:E${session.NowPlayingItem.IndexNumber?.toString()}`}
                    {" - "}
                    {session.NowPlayingItem.SeriesName}
                  </Text>
                </>
              ) : (
                <>
                  <Text variant='rowTitle'>{session.NowPlayingItem?.Name}</Text>
                  <Text variant='meta' muted>
                    {session.NowPlayingItem?.ProductionYear}
                  </Text>
                  <Text variant='meta' muted>
                    {session.NowPlayingItem?.SeriesName}
                  </Text>
                </>
              )}
            </View>
            <Text variant='caption' muted className='text-right'>
              {session.UserName}
              {"\n"}
              {session.Client}
              {"\n"}
              {session.DeviceName}
              {"\n"}
              {ipInfo?.cityName} {ipInfo?.countryCode}
            </Text>
          </View>
          <View className='flex-1' />
          <View className='flex flex-col align-bottom'>
            <View className='flex flex-row justify-between align-bottom mb-1'>
              <View className='-ml-0.5'>
                {!session.PlayState?.IsPaused ? (
                  <Ionicons name='play' size={14} color={NeonBoard.volt} />
                ) : (
                  <Ionicons name='pause' size={14} color={NeonBoard.mid} />
                )}
              </View>
              <Text variant='caption' muted className='text-right'>
                {t("home.downloads.time_left", {
                  time: formatTimeString(remainingTicks, "tick"),
                })}
              </Text>
            </View>
            <NeonProgress
              progress={getProgressPercentage() / 100}
              color={NeonBoard.volt}
            />

            {/* Session controls */}
            <View className='flex flex-row mt-2 space-x-4 justify-center'>
              <TouchableOpacity
                onPress={handlePrevious}
                disabled={isControlLoading[PlaystateCommand.PreviousTrack]}
                style={{
                  opacity: isControlLoading[PlaystateCommand.PreviousTrack]
                    ? 0.5
                    : 1,
                }}
              >
                <MaterialCommunityIcons
                  name='skip-previous'
                  size={24}
                  color={NeonBoard.text}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handlePlayPause}
                disabled={isControlLoading[PlaystateCommand.PlayPause]}
                style={{
                  opacity: isControlLoading[PlaystateCommand.PlayPause]
                    ? 0.5
                    : 1,
                }}
              >
                {session.PlayState?.IsPaused ? (
                  <Ionicons name='play' size={24} color={NeonBoard.text} />
                ) : (
                  <Ionicons name='pause' size={24} color={NeonBoard.text} />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleStop}
                disabled={isControlLoading[PlaystateCommand.Stop]}
                style={{
                  opacity: isControlLoading[PlaystateCommand.Stop] ? 0.5 : 1,
                }}
              >
                <Ionicons name='stop' size={24} color={NeonBoard.text} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleNext}
                disabled={isControlLoading[PlaystateCommand.NextTrack]}
                style={{
                  opacity: isControlLoading[PlaystateCommand.NextTrack]
                    ? 0.5
                    : 1,
                }}
              >
                <MaterialCommunityIcons
                  name='skip-next'
                  size={24}
                  color={NeonBoard.text}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleVolumeDown}
                disabled={isControlLoading[GeneralCommandType.VolumeDown]}
                style={{
                  opacity: isControlLoading[GeneralCommandType.VolumeDown]
                    ? 0.5
                    : 1,
                }}
              >
                <Ionicons name='volume-low' size={24} color={NeonBoard.text} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleToggleMute}
                disabled={isControlLoading[GeneralCommandType.ToggleMute]}
                style={{
                  opacity: isControlLoading[GeneralCommandType.ToggleMute]
                    ? 0.5
                    : 1,
                }}
              >
                <Ionicons
                  name='volume-mute'
                  size={24}
                  color={
                    session.PlayState?.IsMuted ? NeonBoard.red : NeonBoard.text
                  }
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleVolumeUp}
                disabled={isControlLoading[GeneralCommandType.VolumeUp]}
                style={{
                  opacity: isControlLoading[GeneralCommandType.VolumeUp]
                    ? 0.5
                    : 1,
                }}
              >
                <Ionicons name='volume-high' size={24} color={NeonBoard.text} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
      <TranscodingView session={session} />
    </View>
  );
};

interface TranscodingBadgesProps {
  properties: StreamProps;
}

const TranscodingBadges = ({ properties }: TranscodingBadgesProps) => {
  const iconMap = {
    bitrate: (
      <Ionicons name='speedometer-outline' size={12} color={NeonBoard.mid} />
    ),
    codec: <Ionicons name='layers-outline' size={12} color={NeonBoard.mid} />,
    videoRange: (
      <Ionicons name='color-palette-outline' size={12} color={NeonBoard.mid} />
    ),
    resolution: (
      <Ionicons name='film-outline' size={12} color={NeonBoard.mid} />
    ),
    language: (
      <Ionicons name='language-outline' size={12} color={NeonBoard.mid} />
    ),
    audioChannels: (
      <Ionicons name='mic-outline' size={12} color={NeonBoard.mid} />
    ),
    hwType: (
      <Ionicons name='hardware-chip-outline' size={12} color={NeonBoard.mid} />
    ),
  } as const;

  const icon = (val: string) => {
    return (
      iconMap[val as keyof typeof iconMap] ?? (
        <Ionicons name='layers-outline' size={12} color={NeonBoard.mid} />
      )
    );
  };

  const formatVal = (key: string, val: any) => {
    switch (key) {
      case "bitrate":
        return formatBitrate(val);
      case "hwType":
        return val === HardwareAccelerationType.None ? "sw" : "hw";
      default:
        return val;
    }
  };

  return Object.entries(properties)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([key]) => (
      <Badge
        key={key}
        variant='outline'
        style={{ marginRight: 4, marginBottom: 4 }}
        text={formatVal(key, properties[key as keyof StreamProps])}
        iconLeft={icon(key)}
      />
    ));
};

interface StreamProps {
  hwType?: HardwareAccelerationType | null | undefined;
  resolution?: string | null | undefined;
  language?: string | null | undefined;
  codec?: string | null | undefined;
  bitrate?: number | null | undefined;
  videoRange?: string | null | undefined;
  audioChannels?: string | null | undefined;
}

interface TranscodingStreamViewProps {
  title: string | undefined;
  value?: string;
  isTranscoding: boolean;
  transcodeValue?: string | undefined | null;
  properties: StreamProps;
  transcodeProperties?: StreamProps;
}

const TranscodingStreamView = ({
  title,
  isTranscoding,
  properties,
  transcodeProperties,
}: TranscodingStreamViewProps) => {
  return (
    <View className='flex flex-col pt-2 first:pt-0'>
      <View className='flex flex-row'>
        <Text
          variant='eyebrow'
          muted
          className='w-20 text-right pr-4'
          style={{ paddingTop: 3 }}
        >
          {title}
        </Text>
        <View className='flex-1 flex-row flex-wrap'>
          <TranscodingBadges properties={properties} />
        </View>
      </View>
      {isTranscoding && transcodeProperties ? (
        <View className='flex flex-row'>
          <View className='w-20 items-end pr-4'>
            <MaterialCommunityIcons
              name='arrow-right-bottom'
              size={14}
              color={NeonBoard.mid}
            />
          </View>
          <View className='flex-1 flex-row flex-wrap mt-1'>
            <TranscodingBadges properties={transcodeProperties} />
          </View>
        </View>
      ) : null}
    </View>
  );
};

const TranscodingView = ({ session }: SessionCardProps) => {
  const { t } = useTranslation();
  const videoStream = useMemo(() => {
    return session.NowPlayingItem?.MediaStreams?.filter(
      (s) => s.Type === "Video",
    )[0];
  }, [session]);

  const audioStream = useMemo(() => {
    const index = session.PlayState?.AudioStreamIndex;
    return index !== null && index !== undefined
      ? session.NowPlayingItem?.MediaStreams?.[index]
      : undefined;
  }, [session.PlayState?.AudioStreamIndex]);

  const subtitleStream = useMemo(() => {
    const index = session.PlayState?.SubtitleStreamIndex;
    return index !== null && index !== undefined
      ? session.NowPlayingItem?.MediaStreams?.[index]
      : undefined;
  }, [session.PlayState?.SubtitleStreamIndex]);

  const isTranscoding = useMemo(() => {
    return (
      session.PlayState?.PlayMethod === "Transcode" && session.TranscodingInfo
    );
  }, [session.PlayState?.PlayMethod, session.TranscodingInfo]);

  const videoStreamTitle = () => {
    return videoStream?.DisplayTitle?.split(" ")[0];
  };

  return (
    <View
      className='flex flex-col pb-3 pt-2'
      style={{ borderTopWidth: 1, borderTopColor: NeonBoard.line }}
    >
      <TranscodingStreamView
        title={t("common.video")}
        properties={{
          resolution: videoStreamTitle(),
          bitrate: videoStream?.BitRate,
          codec: videoStream?.Codec,
        }}
        transcodeProperties={{
          hwType: session.TranscodingInfo?.HardwareAccelerationType,
          bitrate: session.TranscodingInfo?.Bitrate,
          codec: session.TranscodingInfo?.VideoCodec,
        }}
        isTranscoding={
          !!(isTranscoding && !session.TranscodingInfo?.IsVideoDirect)
        }
      />

      <TranscodingStreamView
        title={t("common.audio")}
        properties={{
          language: audioStream?.Language,
          bitrate: audioStream?.BitRate,
          codec: audioStream?.Codec,
          audioChannels: audioStream?.ChannelLayout,
        }}
        transcodeProperties={{
          codec: session.TranscodingInfo?.AudioCodec,
          audioChannels: session.TranscodingInfo?.AudioChannels?.toString(),
        }}
        isTranscoding={
          !!(isTranscoding && !session.TranscodingInfo?.IsVideoDirect)
        }
      />

      {subtitleStream && (
        <TranscodingStreamView
          title={t("common.subtitle")}
          isTranscoding={false}
          properties={{
            language: subtitleStream?.Language,
            codec: subtitleStream?.Codec,
          }}
          transcodeValue={null}
        />
      )}
    </View>
  );
};
