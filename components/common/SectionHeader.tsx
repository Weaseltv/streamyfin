import { TouchableOpacity, View } from "react-native";
import { SectionTick } from "@/components/prismatic/SectionTick";
import { Colors } from "@/constants/Colors";
import { Text } from "./Text";

type Props = {
  title: string;
  actionLabel?: string;
  actionDisabled?: boolean;
  onPressAction?: () => void;
  /** Row classes, so callers can set their own horizontal padding. */
  className?: string;
};

export const SectionHeader: React.FC<Props> = ({
  title,
  actionLabel,
  actionDisabled = false,
  onPressAction,
  className = "px-4",
}) => {
  const shouldShowAction = Boolean(actionLabel) && Boolean(onPressAction);

  return (
    <View
      className={`flex flex-row items-center justify-between mb-2 ${className}`}
    >
      <View className='flex flex-row items-center'>
        <SectionTick />
        <Text
          style={{
            color: Colors.sectionLabel,
            letterSpacing: 1.8,
            fontSize: 13,
            fontWeight: "700",
            marginLeft: 8,
          }}
        >
          {title.toUpperCase()}
        </Text>
      </View>
      {shouldShowAction && (
        <TouchableOpacity
          onPress={onPressAction}
          disabled={actionDisabled}
          accessibilityRole='button'
          accessibilityLabel={actionLabel}
          className='py-1 pl-3'
        >
          <Text
            style={{
              color: actionDisabled ? "rgba(255,255,255,0.4)" : Colors.primary,
            }}
          >
            {actionLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};
