import { Feather } from "@expo/vector-icons";
import { TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import DisabledSetting from "@/components/settings/DisabledSetting";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import { useAccent } from "@/utils/atoms/pageAccent";

interface StepperProps {
  value: number;
  disabled?: boolean;
  step: number;
  min: number;
  max: number;
  onUpdate: (value: number) => void;
  appendValue?: string;
  /** Accent for the value. Defaults to volt. */
  accent?: string;
}

const BOX = Sizes.buttonCompact;

/**
 * Square `card2` boxes with a 1pt `line2` border: minus, the value in the
 * accent (Condensed 700), plus. Radius 0.
 */
export const Stepper: React.FC<StepperProps> = ({
  value,
  disabled,
  step,
  min,
  max,
  onUpdate,
  appendValue,
  accent: accentProp,
}) => {
  const accent = useAccent(accentProp);
  const box = {
    height: BOX,
    backgroundColor: NeonBoard.card2,
    borderWidth: 1,
    borderColor: NeonBoard.line2,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };
  return (
    <DisabledSetting
      disabled={disabled === true}
      showText={false}
      className='flex flex-row items-center'
    >
      <TouchableOpacity
        onPress={() => onUpdate(Math.max(min, value - step))}
        accessibilityRole='button'
        hitSlop={4}
        style={[box, { width: BOX }]}
      >
        <Feather name='minus' size={20} color={NeonBoard.text} />
      </TouchableOpacity>
      <View
        style={[
          box,
          { minWidth: 56, paddingHorizontal: 8, marginHorizontal: -1 },
        ]}
      >
        <Text variant='tally' accent={accent} allowFontScaling={false}>
          {value}
          {appendValue}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => onUpdate(Math.min(max, value + step))}
        accessibilityRole='button'
        hitSlop={4}
        style={[box, { width: BOX }]}
      >
        <Feather name='plus' size={20} color={NeonBoard.text} />
      </TouchableOpacity>
    </DisabledSetting>
  );
};
