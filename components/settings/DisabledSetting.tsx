import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";

const DisabledSetting: React.FC<
  { disabled: boolean; showText?: boolean; text?: string } & ViewProps
> = ({ disabled = false, showText = true, text, children, ...props }) => {
  const { t } = useTranslation();
  return (
    <View
      pointerEvents={disabled ? "none" : "auto"}
      style={{
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View {...props}>
        {children}
        {disabled && showText && (
          <Text
            variant='caption'
            className='px-3 mt-1'
            style={{ color: NeonBoard.red }}
          >
            {text ?? t("home.settings.disabled_by_admin")}
          </Text>
        )}
      </View>
    </View>
  );
};

export default DisabledSetting;
