import type React from "react";
import { TouchableOpacity, View, type ViewProps } from "react-native";
import { Text } from "@/components/common/Text";
import { Scrims } from "@/constants/neon";
import { usePlayerAccent } from "@/utils/atoms/pageAccent";

interface SkipButtonProps extends ViewProps {
  onPress: () => void;
  showButton: boolean;
  buttonText: string;
}

/** SKIP INTRO / SKIP CREDITS: a 40 outline button in the item's type colour over glass. */
const SkipButton: React.FC<SkipButtonProps> = ({
  onPress,
  showButton,
  buttonText,
  ...props
}) => {
  const accent = usePlayerAccent();
  return (
    <View className={showButton ? "flex" : "hidden"} {...props}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={{
          height: 40,
          paddingHorizontal: 14,
          justifyContent: "center",
          backgroundColor: Scrims.glass,
          borderWidth: 1,
          borderColor: accent,
        }}
      >
        <Text variant='button' allowFontScaling={false} accent={accent}>
          {buttonText}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default SkipButton;
