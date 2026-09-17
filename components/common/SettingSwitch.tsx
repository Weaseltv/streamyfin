import type React from "react";
import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  Switch,
  type SwitchProps,
  View,
} from "react-native";
import { NeonBoard } from "@/constants/Colors";
import { glowChip } from "@/constants/neon";
import { usePageAccent } from "@/utils/atoms/pageAccent";

const TRACK_W = 44;
const TRACK_H = 26;
const KNOB = 18;
const PAD = 3;

/**
 * The Neon Board switch: a 44×26 square track (`line2`, `text` knob); on =
 * volt track with a glow and an `onAccent` knob. The knob is the one square
 * exception, drawn round. TV keeps the native Switch.
 */
export const SettingSwitch: React.FC<SwitchProps> = ({
  value,
  onValueChange,
  disabled,
  style,
  ...props
}) => {
  const pageAccent = usePageAccent();
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: value ? 1 : 0,
      duration: 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [value, anim]);

  if (Platform.isTV)
    return (
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        style={style}
        {...props}
      />
    );

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [PAD, TRACK_W - KNOB - PAD],
  });
  const accent = props.trackColor?.true ?? pageAccent;

  return (
    <Pressable
      accessibilityRole='switch'
      accessibilityState={{ checked: !!value, disabled: !!disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => onValueChange?.(!value)}
      style={[{ opacity: disabled ? 0.5 : 1 }, style as any]}
    >
      <View
        style={[
          {
            width: TRACK_W,
            height: TRACK_H,
            justifyContent: "center",
            backgroundColor: value ? (accent as string) : NeonBoard.line2,
          },
          value ? glowChip(accent as string) : null,
        ]}
      >
        <Animated.View
          style={{
            width: KNOB,
            height: KNOB,
            borderRadius: KNOB / 2,
            backgroundColor: value ? NeonBoard.onAccent : NeonBoard.text,
            transform: [{ translateX }],
          }}
        />
      </View>
    </Pressable>
  );
};
