import { MaterialIcons } from "@expo/vector-icons";
import { type FC, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useVideoContext } from "../contexts/VideoContext";
import { IOS_PLAYER } from "./layout";

const VolumeManager = require("react-native-volume-manager");
const Brightness = require("expo-brightness");

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

/**
 * The iPhone's vertical slider pill (SideSliderViews.swift): a 6 pt capsule
 * that fills from the bottom inside a 34 × 130 pt drag area, with the icon
 * 10 pt underneath. Dragging anywhere on the pill sets the value.
 */
const VerticalSliderPill: FC<{
  icon: keyof typeof MaterialIcons.glyphMap;
  value: number;
  onChange: (value: number) => void;
  onEditingChanged: (editing: boolean) => void;
}> = ({ icon, value, onChange, onEditingChanged }) => {
  const height = IOS_PLAYER.sliderTrackHeight;
  const line = IOS_PLAYER.sliderLineWidth;
  const pan = Gesture.Pan()
    .minDistance(0)
    .runOnJS(true)
    .onBegin((e) => {
      onEditingChanged(true);
      onChange(clamp01(1 - e.y / height));
    })
    .onUpdate((e) => onChange(clamp01(1 - e.y / height)))
    .onFinalize(() => onEditingChanged(false));

  return (
    <View style={{ alignItems: "center", gap: 10 }}>
      <GestureDetector gesture={pan}>
        <View
          style={{
            width: IOS_PLAYER.sliderPillWidth,
            height,
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: line,
              borderRadius: line / 2,
              backgroundColor: "rgba(255,255,255,0.3)",
            }}
          />
          <View
            style={{
              width: line,
              height: Math.max(line, height * value),
              borderRadius: line / 2,
              backgroundColor: "white",
            }}
          />
        </View>
      </GestureDetector>
      {/* 14 pt semibold SF Symbol ≈ 17 dp Material glyph. */}
      <MaterialIcons name={icon} size={17} color='white' />
    </View>
  );
};

/**
 * System media volume, kept in step with the hardware buttons. The pill
 * replaces the system volume HUD while the player is up, like the iPhone's.
 */
export const AndroidVolumePill: FC<{
  onEditingChanged: (editing: boolean) => void;
  /** Hardware buttons or a swipe changed the volume. */
  onExternalChange: () => void;
}> = ({ onEditingChanged, onExternalChange }) => {
  const { volumeSession } = useVideoContext();
  const [volume, setVolume] = useState(0.5);
  const dragging = useRef(false);
  const onExternalChangeRef = useRef(onExternalChange);
  onExternalChangeRef.current = onExternalChange;

  useEffect(() => {
    VolumeManager.showNativeVolumeUI({ enabled: false });
    return () => {
      VolumeManager.showNativeVolumeUI({ enabled: true });
    };
  }, []);

  useEffect(
    () =>
      volumeSession.subscribe((value, initial) => {
        if (dragging.current) return;
        setVolume(value);
        if (!initial) onExternalChangeRef.current();
      }),
    [volumeSession],
  );

  const icon =
    volume <= 0.001 ? "volume-off" : volume < 0.5 ? "volume-down" : "volume-up";

  return (
    <VerticalSliderPill
      icon={icon}
      value={volume}
      onChange={(value) => {
        setVolume(value);
        VolumeManager.setVolume(value).catch(() => {});
      }}
      onEditingChanged={(editing) => {
        dragging.current = editing;
        onEditingChanged(editing);
      }}
    />
  );
};

/** Screen brightness, polled while shown so swipes and the system agree. */
export const AndroidBrightnessPill: FC<{
  onEditingChanged: (editing: boolean) => void;
}> = ({ onEditingChanged }) => {
  const [brightness, setBrightness] = useState(0.5);
  const [supported, setSupported] = useState(true);
  const dragging = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let pending = false;
    const refresh = async () => {
      if (pending || dragging.current) return;
      pending = true;
      try {
        const value = await Brightness.getBrightnessAsync();
        if (!cancelled && !dragging.current) setBrightness(clamp01(value));
      } catch {
        if (!cancelled) setSupported(false);
      } finally {
        pending = false;
      }
    };
    void refresh();
    const id = setInterval(refresh, 200);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!supported) return <View style={{ width: IOS_PLAYER.sliderPillWidth }} />;

  return (
    <VerticalSliderPill
      icon={brightness < 0.4 ? "brightness-low" : "light-mode"}
      value={brightness}
      onChange={(value) => {
        setBrightness(value);
        Brightness.setBrightnessAsync(value).catch(() => {});
      }}
      onEditingChanged={(editing) => {
        dragging.current = editing;
        onEditingChanged(editing);
      }}
    />
  );
};
