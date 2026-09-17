import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { useSettings } from "@/utils/atoms/settings";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

export const ChromecastSettings: React.FC = ({ ...props }) => {
  const { settings, updateSettings } = useSettings();
  const { t } = useTranslation();
  return (
    <View {...props}>
      <ListGroup title={t("home.settings.chromecast.title")}>
        <ListItem title={t("home.settings.chromecast.enable_h265")}>
          <SettingSwitch
            value={settings.enableH265ForChromecast}
            onValueChange={(enableH265ForChromecast) =>
              updateSettings({ enableH265ForChromecast })
            }
          />
        </ListItem>
      </ListGroup>
    </View>
  );
};
