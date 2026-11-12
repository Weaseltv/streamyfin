import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useEffect, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Slider } from "react-native-awesome-slider";
import { useSharedValue } from "react-native-reanimated";
import { NeonBoard } from "@/constants/Colors";
import { useVideoContext } from "./contexts/VideoContext";

const VolumeManager = Platform.isTV
  ? null
  : require("react-native-volume-manager");

interface AudioSliderProps {
  setVisibility: (show: boolean) => void;
}

const AudioSlider: React.FC<AudioSliderProps> = ({ setVisibility }) => {
  const isTv = Platform.isTV;
  const { volumeSession } = useVideoContext();

  const volume = useSharedValue<number>(50); // Explicitly type as number
  const min = useSharedValue<number>(0); // Explicitly type as number
  const max = useSharedValue<number>(100); // Explicitly type as number
  const isUserInteracting = useRef(false);
  const mounted = useRef(false);
  const interactionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Use a ref to store the timeout ID

  useEffect(() => {
    if (isTv) return;
    mounted.current = true;
    // Disable the native volume UI when the component mounts
    VolumeManager.showNativeVolumeUI({ enabled: false });

    return () => {
      mounted.current = false;
      if (interactionTimeoutRef.current)
        clearTimeout(interactionTimeoutRef.current);
      // Re-enable the native volume UI when the component unmounts
      VolumeManager.showNativeVolumeUI({ enabled: true });
    };
  }, [isTv, volume]);

  const handleValueChange = async (value: number) => {
    isUserInteracting.current = true;
    volume.value = value;

    try {
      await VolumeManager.setVolume(value / 100);
    } catch (error) {
      console.error("Error setting volume:", error);
    }

    if (!mounted.current) return;
    // Re-call showNativeVolumeUI to ensure the setting is applied on iOS
    VolumeManager.showNativeVolumeUI({ enabled: false });

    // Reset interaction flag after a delay
    if (interactionTimeoutRef.current)
      clearTimeout(interactionTimeoutRef.current);
    interactionTimeoutRef.current = setTimeout(() => {
      isUserInteracting.current = false;
    }, 100);
  };

  useEffect(() => {
    if (isTv) return;
    const unsubscribe = volumeSession.subscribe((value, initial) => {
      if (!isUserInteracting.current) volume.value = value * 100;
      if (initial) return;
      setVisibility(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setVisibility(false), 1000);
    });

    return () => {
      unsubscribe();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isTv, volume, setVisibility, volumeSession]);

  if (isTv) return null;

  return (
    <View style={styles.sliderContainer}>
      <Slider
        progress={volume}
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
        name='volume-high'
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

export default AudioSlider;
