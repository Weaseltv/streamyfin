import { Ionicons } from "@expo/vector-icons";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { Slider } from "react-native-awesome-slider";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import GoogleCast, {
  CastContext,
  PlayServicesState,
  useCastDevice,
  useCastSession,
  useDevices,
  useMediaStatus,
} from "react-native-google-cast";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { Scrims, Sizes } from "@/constants/neon";

const castDialogOpenAtom = atom(false);

/** Opens the shared cast sheet. Safe to call from a header button. */
export function useOpenCastDialog() {
  const setOpen = useSetAtom(castDialogOpenAtom);
  return () => setOpen(true);
}

/** One sheet for the whole phone app, outside any header's fixed box. */
export function CastDialogHost() {
  const visible = useAtomValue(castDialogOpenAtom);
  const setOpen = useSetAtom(castDialogOpenAtom);
  return <CastDialog visible={visible} onClose={() => setOpen(false)} />;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

const mediaTitle = (metadata: unknown): string | null => {
  if (!metadata || typeof metadata !== "object" || !("title" in metadata)) {
    return null;
  }
  const title = (metadata as { title?: unknown }).title;
  if (typeof title !== "string") return null;
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Cast device picker and the connected-session sheet.
 *
 * The system Cast dialog paints the status ("No media selected", or the
 * media title) in a fixed-height label and lays the divider across the
 * bottom of those glyphs. This sheet gives that line its own padding and
 * lets it wrap, on both phones.
 */
export const CastDialog: React.FC<Props> = ({ visible, onClose }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const devices = useDevices();
  const castDevice = useCastDevice();
  const session = useCastSession();
  const mediaStatus = useMediaStatus();
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [stopping, setStopping] = useState(false);
  const volumeProgress = useSharedValue(0);
  const volumeMin = useSharedValue(0);
  const volumeMax = useSharedValue(1);

  useEffect(() => {
    if (visible) return;
    setConnectingId(null);
    setStopping(false);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    GoogleCast.getDiscoveryManager()?.startDiscovery();
    if (Platform.OS !== "android") return;
    CastContext.getPlayServicesState().then((state) => {
      if (state && state !== PlayServicesState.SUCCESS) {
        CastContext.showPlayServicesErrorDialog(state);
      }
    });
  }, [visible]);

  useEffect(() => {
    if (castDevice) setConnectingId(null);
  }, [castDevice]);

  useEffect(() => {
    if (!visible || !session) return;
    let cancelled = false;
    session.getVolume().then((value) => {
      if (cancelled || typeof value !== "number" || Number.isNaN(value)) {
        return;
      }
      volumeProgress.value = Math.min(1, Math.max(0, value));
    });
    session.isMute().then((value) => {
      if (!cancelled && typeof value === "boolean") setMuted(value);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, session, volumeProgress]);

  const connecting = devices.find((device) => device.deviceId === connectingId);
  const sessionOpen = Boolean(castDevice || connecting);
  const heading =
    castDevice?.friendlyName || connecting?.friendlyName || t("cast.cast_to");
  const title = mediaTitle(mediaStatus?.mediaInfo?.metadata);
  const ordered = [...devices].sort((a, b) =>
    a.friendlyName.localeCompare(b.friendlyName),
  );

  const pick = async (deviceId: string) => {
    setConnectingId(deviceId);
    try {
      const ok = await GoogleCast.getSessionManager().startSession(deviceId);
      if (!ok) setConnectingId(null);
    } catch {
      setConnectingId(null);
    }
  };

  const stop = async () => {
    if (stopping) return;
    setStopping(true);
    try {
      await GoogleCast.getSessionManager().endCurrentSession(true);
      onClose();
    } finally {
      setStopping(false);
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    session?.setMute(next);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType='slide'
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: Scrims.modal,
        }}
      >
        <Pressable
          style={{ flex: 1 }}
          onPress={onClose}
          accessibilityRole='button'
          accessibilityLabel={t("common.cancel")}
        />
        <View
          style={{
            maxHeight: "90%",
            backgroundColor: NeonBoard.card,
            borderTopWidth: 1,
            borderTopColor: NeonBoard.line2,
            paddingBottom: Math.max(insets.bottom, Sizes.gutter),
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingLeft: Sizes.gutter,
              paddingRight: 8,
              paddingTop: 8,
            }}
          >
            <View style={{ flex: 1, paddingVertical: 12, paddingRight: 8 }}>
              <Text
                variant='rowTitle'
                numberOfLines={3}
                style={{ lineHeight: 22 }}
              >
                {heading}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole='button'
              style={{ paddingHorizontal: 12, paddingVertical: 12 }}
            >
              <Text variant='body' accent={NeonBoard.cyan}>
                {t("common.cancel")}
              </Text>
            </Pressable>
          </View>

          {sessionOpen ? (
            <View>
              <View
                style={{
                  paddingHorizontal: Sizes.gutter + 8,
                  paddingTop: 4,
                  paddingBottom: 16,
                }}
              >
                {connecting && !castDevice ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                    }}
                  >
                    <ActivityIndicator color={NeonBoard.mid} />
                    <Text variant='body' muted>
                      {t("cast.connecting")}
                    </Text>
                  </View>
                ) : (
                  <Text
                    variant='body'
                    muted={!title}
                    numberOfLines={4}
                    style={{ textAlign: "center", lineHeight: 20 }}
                  >
                    {title ?? t("cast.no_media_selected")}
                  </Text>
                )}
              </View>
              <View
                style={{
                  height: 1,
                  backgroundColor: NeonBoard.line,
                  marginHorizontal: Sizes.gutter,
                }}
              />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingHorizontal: Sizes.gutter,
                  paddingVertical: 16,
                }}
              >
                <Pressable
                  onPress={toggleMute}
                  disabled={!session}
                  hitSlop={8}
                  accessibilityRole='button'
                  accessibilityLabel={muted ? t("cast.unmute") : t("cast.mute")}
                >
                  <Ionicons
                    name={muted ? "volume-mute" : "volume-medium"}
                    size={22}
                    color={session ? NeonBoard.text : NeonBoard.low}
                  />
                </Pressable>
                <GestureHandlerRootView style={{ flex: 1, height: 40 }}>
                  <Slider
                    theme={{
                      maximumTrackTintColor: NeonBoard.line2,
                      minimumTrackTintColor: NeonBoard.volt,
                    }}
                    progress={volumeProgress}
                    minimumValue={volumeMin}
                    maximumValue={volumeMax}
                    disable={!session}
                    onSlidingComplete={(value) => session?.setVolume(value)}
                    sliderHeight={4}
                    containerStyle={{ borderRadius: 0 }}
                    renderBubble={() => null}
                    renderThumb={() => (
                      <View
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 8,
                          backgroundColor: NeonBoard.text,
                        }}
                      />
                    )}
                  />
                </GestureHandlerRootView>
              </View>
              {castDevice ? (
                <Pressable
                  onPress={stop}
                  disabled={stopping}
                  accessibilityRole='button'
                  style={{
                    marginHorizontal: Sizes.gutter,
                    marginTop: 8,
                    minHeight: Sizes.button,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 20,
                    paddingVertical: 14,
                    borderWidth: 1,
                    borderColor: NeonBoard.line2,
                    opacity: stopping ? 0.6 : 1,
                  }}
                >
                  <Text
                    variant='button'
                    accent={NeonBoard.cyan}
                    style={{ lineHeight: 18 }}
                  >
                    {t("cast.stop_casting")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 420 }} bounces={false}>
              {ordered.length === 0 ? (
                <View
                  style={{
                    paddingHorizontal: Sizes.gutter + 8,
                    paddingTop: 8,
                    paddingBottom: 24,
                    gap: 8,
                  }}
                >
                  <Text variant='body'>{t("cast.searching")}</Text>
                  <Text variant='meta' muted>
                    {t("cast.no_devices")}
                  </Text>
                </View>
              ) : (
                ordered.map((device) => (
                  <Pressable
                    key={device.deviceId}
                    onPress={() => pick(device.deviceId)}
                    accessibilityRole='button'
                    style={{
                      minHeight: Sizes.row,
                      paddingVertical: 12,
                      paddingHorizontal: Sizes.gutter,
                      justifyContent: "center",
                      borderTopWidth: 1,
                      borderTopColor: NeonBoard.line,
                    }}
                  >
                    <Text
                      variant='rowTitle'
                      numberOfLines={2}
                      style={{ lineHeight: 22 }}
                    >
                      {device.friendlyName}
                    </Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};
