import { Ionicons } from "@expo/vector-icons";
import {
  type BaseItemDto,
  PlayCommand,
  type SessionInfoDto,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import { useAtomValue } from "jotai";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FlatList,
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { toast } from "sonner-native";
import { NeonBoard } from "@/constants/Colors";
import { useAllSessions } from "@/hooks/useSessions";
import { apiAtom } from "@/providers/JellyfinProvider";
import { HeaderIcon } from "./common/HeaderIcon";
import { Text } from "./common/Text";
import type { SelectedOptions } from "./ItemContent";
import { Loader } from "./Loader";
import { SquareButton } from "./SquareButton";

interface Props extends React.ComponentProps<typeof View> {
  item: BaseItemDto;
  size?: "default" | "large";
  /** The version and tracks the user picked on the item page, sent along so the other device plays the same thing. */
  selectedOptions?: SelectedOptions;
}

export const PlayInRemoteSessionButton: React.FC<Props> = ({
  item,
  selectedOptions,
  ...props
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const api = useAtomValue(apiAtom);
  // Only the open chooser polls; the closed icon stays neutral.
  const { sessions, isLoading } = useAllSessions({ enabled: modalVisible });
  const { t } = useTranslation();
  const isPlayingElsewhere =
    modalVisible &&
    !!sessions?.some(
      (session) =>
        session.NowPlayingItem?.Id === item.Id &&
        session.DeviceId !== api?.deviceInfo.id,
    );
  const handlePlayInSession = async (session: SessionInfoDto) => {
    if (!api || !item.Id || !session.Id) return;
    const device = session.DeviceName || session.Client || "";

    try {
      console.log(`Playing ${item.Name} on ${device} (session ${session.Id})`);
      await getSessionApi(api).play({
        sessionId: session.Id,
        itemIds: [item.Id],
        playCommand: PlayCommand.PlayNow,
        // Resume where the user left off, as pressing Play on that device would.
        startPositionTicks: item.UserData?.PlaybackPositionTicks || undefined,
        mediaSourceId: selectedOptions?.mediaSource?.Id ?? undefined,
        audioStreamIndex: selectedOptions?.audioIndex ?? undefined,
        // -1 means "no subtitles" to the server and to WeaselPlex TV.
        subtitleStreamIndex: selectedOptions?.subtitleIndex ?? undefined,
      });

      setModalVisible(false);
      toast.success(t("home.sessions.playing_on", { device }));
    } catch (error) {
      console.error("Error playing in remote session:", error);
      toast.error(t("home.sessions.play_failed", { device }));
    }
  };

  return (
    <View {...props}>
      <SquareButton onPress={() => setModalVisible(true)} size={props.size}>
        <HeaderIcon
          name='remoteSession'
          tintColor={isPlayingElsewhere ? NeonBoard.text : NeonBoard.mid}
          size={props.size === "large" ? undefined : 18}
        />
      </SquareButton>

      <Modal
        animationType='slide'
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t("home.sessions.select_session")}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name='close' size={24} color='white' />
              </TouchableOpacity>
            </View>

            <View style={styles.modalContent}>
              {isLoading ? (
                <View style={styles.loadingContainer}>
                  <Loader />
                </View>
              ) : !sessions || sessions.length === 0 ? (
                <Text style={styles.noSessionsText}>
                  {t("home.sessions.no_remote_targets")}
                </Text>
              ) : (
                <FlatList
                  data={sessions}
                  keyExtractor={(session) => session.Id || "unknown"}
                  renderItem={({ item: session }) => (
                    <TouchableOpacity
                      style={styles.sessionItem}
                      onPress={() => handlePlayInSession(session)}
                    >
                      <View style={styles.sessionInfo}>
                        <Text style={styles.sessionName}>
                          {session.DeviceName}
                        </Text>
                        <Text style={styles.sessionDetails}>
                          {session.UserName} • {session.Client}
                        </Text>
                        {session.NowPlayingItem && (
                          <Text style={styles.nowPlaying} numberOfLines={1}>
                            {t("home.sessions.now_playing")}{" "}
                            {session.NowPlayingItem.SeriesName
                              ? `${session.NowPlayingItem.SeriesName} :`
                              : ""}
                            {session.NowPlayingItem.Name}
                          </Text>
                        )}
                      </View>
                      <Ionicons name='play-sharp' size={20} color='#888' />
                    </TouchableOpacity>
                  )}
                  contentContainerStyle={styles.listContent}
                />
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  modalView: {
    width: "90%",
    maxHeight: "80%",
    backgroundColor: "#1c1c1c",
    borderRadius: 0,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  // Not flex: 1. The sheet has no fixed height (only maxHeight), so a flex: 1
  // child resolves to zero height on iOS and the chooser rendered as a bare
  // title bar. Shrink to fit the sheet instead and keep room for the empty and
  // loading states.
  modalContent: {
    flexShrink: 1,
    minHeight: 120,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  loadingContainer: {
    padding: 40,
    alignItems: "center",
  },
  noSessionsText: {
    padding: 40,
    textAlign: "center",
    color: "#888",
  },
  listContent: {
    paddingVertical: 8,
  },
  sessionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  sessionInfo: {
    flex: 1,
  },
  sessionName: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 4,
  },
  sessionDetails: {
    fontSize: 13,
    opacity: 0.7,
    marginBottom: 2,
  },
  nowPlaying: {
    fontSize: 12,
    opacity: 0.5,
    fontStyle: "italic",
  },
});
