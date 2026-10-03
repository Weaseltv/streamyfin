import { ExpoAvRoutePickerView } from "@douglowder/expo-av-route-picker-view";
import { Feather } from "@expo/vector-icons";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
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
import { SHEET_MAX_HEIGHT_RATIO } from "@/constants/Values";

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

/** Row geometry shared by every entry so the list reads as one set. */
const ROW_HEIGHT = 60;
const ROW_ICON_COLUMN = 56;
const ROW_ICON_SIZE = 24;
const SHEET_RADIUS = 20;

interface RowProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress?: () => void;
  /** Dim the row (a device we are still trying to reach). */
  muted?: boolean;
  /** Label and glyph in the accent, for the device we are casting to. */
  active?: boolean;
  /** Something on the right (a spinner, a check). */
  right?: ReactNode;
  /** A native control laid over the whole row (the AirPlay picker). */
  overlay?: ReactNode;
}

const DeviceRow: React.FC<RowProps> = ({
  icon,
  label,
  onPress,
  muted = false,
  active = false,
  right,
  overlay,
}) => {
  const tone = active ? NeonBoard.cyan : muted ? NeonBoard.low : NeonBoard.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole='button'
      accessibilityLabel={label}
      style={({ pressed }) => ({
        minHeight: ROW_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        paddingRight: Sizes.gutter,
        backgroundColor: pressed ? NeonBoard.card2 : "transparent",
      })}
    >
      <View
        style={{
          width: ROW_ICON_COLUMN,
          paddingLeft: Sizes.gutter,
          alignItems: "flex-start",
          justifyContent: "center",
        }}
      >
        <Feather name={icon} size={ROW_ICON_SIZE} color={tone} />
      </View>
      <View style={{ flex: 1, paddingLeft: 4, paddingRight: 12 }}>
        <Text
          variant='body'
          numberOfLines={2}
          style={{ fontSize: 17, lineHeight: 22, color: tone }}
        >
          {label}
        </Text>
      </View>
      {right}
      {overlay}
    </Pressable>
  );
};

/**
 * Cast device picker and the connected-session sheet, laid out like the
 * YouTube one: a grabber, a "Select a device" head with a spinner while the
 * scan runs, then one icon + name row per device. On iOS the first row hands
 * off to the system AirPlay & Bluetooth picker.
 *
 * Only Google Cast receivers can appear here. Roku TVs are not Cast
 * receivers (YouTube reaches them through its own DIAL pairing), so they
 * will never be listed by the Cast SDK.
 */
export const CastDialog: React.FC<Props> = ({ visible, onClose }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
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
    const discovery = GoogleCast.getDiscoveryManager();
    if (Platform.OS === "ios") {
      // An active scan while the sheet is open so new receivers show up in
      // seconds rather than on the passive scan's slow cadence.
      discovery?.setPassiveScan(false).catch(() => undefined);
    }
    discovery?.startDiscovery().catch(() => undefined);
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

  const connected = Boolean(castDevice);
  const title = mediaTitle(mediaStatus?.mediaInfo?.metadata);
  const ordered = [...devices].sort((a, b) =>
    a.friendlyName.localeCompare(b.friendlyName),
  );

  const pick = async (deviceId: string) => {
    if (connectingId) return;
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

  const heading = connected
    ? t("cast.casting_to", { device: castDevice?.friendlyName })
    : t("cast.select_device");

  return (
    <Modal
      visible={visible}
      transparent
      animationType='slide'
      statusBarTranslucent
      navigationBarTranslucent
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
            maxHeight: windowHeight * SHEET_MAX_HEIGHT_RATIO,
            backgroundColor: NeonBoard.card,
            borderTopLeftRadius: SHEET_RADIUS,
            borderTopRightRadius: SHEET_RADIUS,
            paddingBottom: Math.max(insets.bottom, Sizes.gutter),
            overflow: "hidden",
          }}
        >
          {/* Grabber */}
          <View style={{ alignItems: "center", paddingTop: 10 }}>
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: NeonBoard.line2,
              }}
            />
          </View>

          {/* Head: title plus a spinner for as long as the scan runs. */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: Sizes.gutter,
              paddingTop: 22,
              paddingBottom: 14,
              gap: 14,
            }}
          >
            <Text
              variant='rowTitle'
              numberOfLines={2}
              style={{ fontSize: 19, lineHeight: 24, flexShrink: 1 }}
            >
              {heading}
            </Text>
            {connected ? null : (
              <ActivityIndicator size='small' color={NeonBoard.mid} />
            )}
          </View>

          {connected ? (
            <View>
              <View
                style={{
                  paddingHorizontal: Sizes.gutter,
                  paddingBottom: 14,
                }}
              >
                <Text
                  variant='body'
                  muted={!title}
                  numberOfLines={4}
                  style={{ lineHeight: 20 }}
                >
                  {title ?? t("cast.no_media_selected")}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingHorizontal: Sizes.gutter,
                  paddingVertical: 12,
                }}
              >
                <Pressable
                  onPress={toggleMute}
                  disabled={!session}
                  hitSlop={8}
                  accessibilityRole='button'
                  accessibilityLabel={muted ? t("cast.unmute") : t("cast.mute")}
                  style={{ width: ROW_ICON_COLUMN - Sizes.gutter }}
                >
                  <Feather
                    name={muted ? "volume-x" : "volume-2"}
                    size={ROW_ICON_SIZE}
                    color={session ? NeonBoard.text : NeonBoard.low}
                  />
                </Pressable>
                <GestureHandlerRootView style={{ flex: 1, height: 40 }}>
                  <Slider
                    theme={{
                      maximumTrackTintColor: NeonBoard.line2,
                      minimumTrackTintColor: NeonBoard.text,
                    }}
                    progress={volumeProgress}
                    minimumValue={volumeMin}
                    maximumValue={volumeMax}
                    disable={!session}
                    onSlidingComplete={(value) => session?.setVolume(value)}
                    sliderHeight={4}
                    containerStyle={{ borderRadius: 2 }}
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
              <View
                style={{
                  height: 1,
                  backgroundColor: NeonBoard.line,
                  marginVertical: 6,
                }}
              />
              <DeviceRow
                icon='tv'
                label={castDevice?.friendlyName ?? ""}
                active
                right={
                  <Feather name='check' size={20} color={NeonBoard.cyan} />
                }
              />
              <DeviceRow
                icon='x-circle'
                label={t("cast.stop_casting")}
                onPress={stop}
                muted={stopping}
                right={
                  stopping ? (
                    <ActivityIndicator size='small' color={NeonBoard.mid} />
                  ) : null
                }
              />
            </View>
          ) : (
            <ScrollView bounces={false}>
              {Platform.OS === "ios" ? (
                <DeviceRow
                  icon='airplay'
                  label={t("cast.airplay_bluetooth")}
                  overlay={
                    // AVRoutePickerView fills whatever frame it is given, so
                    // stretching it over the row makes the whole row open the
                    // system picker while our own glyph and label stay visible.
                    <ExpoAvRoutePickerView
                      tintColor='transparent'
                      activeTintColor='transparent'
                      prioritizesVideoDevices
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                      }}
                    />
                  }
                />
              ) : null}
              {ordered.map((device) => {
                const connecting = connectingId === device.deviceId;
                return (
                  <DeviceRow
                    key={device.deviceId}
                    icon='tv'
                    label={device.friendlyName}
                    onPress={() => pick(device.deviceId)}
                    muted={Boolean(connectingId) && !connecting}
                    right={
                      connecting ? (
                        <ActivityIndicator size='small' color={NeonBoard.mid} />
                      ) : null
                    }
                  />
                );
              })}
              {ordered.length === 0 ? (
                <View
                  style={{
                    paddingHorizontal: Sizes.gutter,
                    paddingTop: Platform.OS === "ios" ? 10 : 2,
                    paddingBottom: 18,
                    gap: 4,
                  }}
                >
                  <Text variant='body' muted>
                    {t("cast.searching")}
                  </Text>
                  <Text variant='meta' muted>
                    {t("cast.no_devices")}
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};
