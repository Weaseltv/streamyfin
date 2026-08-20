import { LinearGradient } from "expo-linear-gradient";
import type React from "react";
import { Gradients } from "@/constants/Colors";

interface Props {
  width?: number;
  height?: number;
}

/** The small rainbow dash that precedes every uppercase section label. */
export const SectionTick: React.FC<Props> = ({ width = 14, height = 3 }) => (
  <LinearGradient
    colors={Gradients.sectionTick as unknown as [string, string, ...string[]]}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 0 }}
    style={{ width, height, borderRadius: height / 2 }}
  />
);
