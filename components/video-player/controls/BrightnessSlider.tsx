import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Slider } from "react-native-awesome-slider";
import { useSharedValue } from "react-native-reanimated";

// import * as Brightness from "expo-brightness";
const Brightness = !Platform.isTV ? require("expo-brightness") : null;

import { Ionicons } from "@expo/vector-icons";
import { NeonBoard } from "@/constants/Colors";

const BrightnessSlider = ({ active = true }: { active?: boolean }) => {
  const isTv = Platform.isTV;

  const brightness = useSharedValue(50);
  const min = useSharedValue(0);
  const max = useSharedValue(100);
  const isUserInteracting = useRef(false);
  const mounted = useRef(false);
  const interactionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastKnownBrightness = useRef<number>(50);
  const brightnessSupportedRef = useRef(true);
  const [brightnessSupported, setBrightnessSupported] = useState(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (interactionTimeoutRef.current)
        clearTimeout(interactionTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (isTv || !active || !Brightness) return;
    let cancelled = false;
    let pending = false;
    const updateBrightnessFromDevice = async () => {
      if (
        pending ||
        isUserInteracting.current ||
        !brightnessSupportedRef.current
      )
        return;
      pending = true;
      try {
        const currentBrightness = await Brightness.getBrightnessAsync();
        if (cancelled) return;
        const brightnessPercent = Math.round(currentBrightness * 100);
        if (Math.abs(brightnessPercent - lastKnownBrightness.current) > 1) {
          brightness.value = brightnessPercent;
          lastKnownBrightness.current = brightnessPercent;
        }
      } catch (error) {
        if (cancelled) return;
        console.warn("Brightness not supported on this device:", error);
        brightnessSupportedRef.current = false;
        setBrightnessSupported(false);
      } finally {
        pending = false;
      }
    };
    // Refresh immediately when revealed, including changes made by gestures.
    void updateBrightnessFromDevice();
    const interval = setInterval(updateBrightnessFromDevice, 200);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isTv, active, brightness]);

  const handleValueChange = async (value: number) => {
    isUserInteracting.current = true;
    brightness.value = value;
    lastKnownBrightness.current = value;

    try {
      await Brightness.setBrightnessAsync(value / 100);
    } catch (error) {
      console.error("Error setting brightness:", error);
    }

    if (!mounted.current) return;
    // Reset interaction flag after a delay
    if (interactionTimeoutRef.current)
      clearTimeout(interactionTimeoutRef.current);
    interactionTimeoutRef.current = setTimeout(() => {
      isUserInteracting.current = false;
    }, 100);
  };

  if (isTv || !brightnessSupported) return null;

  return (
    <View style={styles.sliderContainer}>
      <Slider
        progress={brightness}
        minimumValue={min}
        maximumValue={max}
        thumbWidth={0}
        onValueChange={handleValueChange}
        renderBubble={() => null}
        renderThumb={() => null}
        sliderHeight={3}
        containerStyle={{
          borderRadius: 0,
        }}
        theme={{
          minimumTrackTintColor: NeonBoard.text,
          maximumTrackTintColor: NeonBoard.line2,
        }}
      />
      <Ionicons
        name='sunny'
        size={18}
        color={NeonBoard.mid}
        style={{
          marginLeft: 8,
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  sliderContainer: {
    width: 110,
    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
});

export default BrightnessSlider;
