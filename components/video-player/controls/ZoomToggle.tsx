import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform } from "react-native";
import { NeonBoard } from "@/constants/Colors";
import { useHaptic } from "@/hooks/useHaptic";
import { GlassSquare } from "./GlassSquare";

interface ZoomToggleProps {
  isZoomedToFill: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export const ZoomToggle: React.FC<ZoomToggleProps> = ({
  isZoomedToFill,
  onToggle,
  disabled = false,
}) => {
  const lightHapticFeedback = useHaptic("light");

  const handlePress = () => {
    if (disabled) return;
    lightHapticFeedback();
    onToggle();
  };

  // Hide on TV platforms
  if (Platform.isTV) return null;

  return (
    <GlassSquare onPress={handlePress} disabled={disabled}>
      <Ionicons
        name={isZoomedToFill ? "contract-outline" : "expand-outline"}
        size={20}
        color={NeonBoard.text}
      />
    </GlassSquare>
  );
};
