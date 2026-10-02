import { Feather } from "@expo/vector-icons";
import { useAtom, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { Platform, View, type ViewProps } from "react-native";
import { NeonBoard } from "@/constants/Colors";
import { useAppUpdate } from "@/hooks/useAppUpdate";
import { apiAtom, useJellyfin, userAtom } from "@/providers/JellyfinProvider";
import { appUpdatePromptAtom } from "@/utils/atoms/appUpdate";
import { useAccent } from "@/utils/atoms/pageAccent";
import { serverHost } from "@/utils/serverHost";
import { getVersionInfo } from "@/utils/version";
import { useConfirmDialog } from "../common/ConfirmDialog";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

interface Props extends ViewProps {
  accent?: string;
}

/**
 * ACCOUNT: Server, User and Version info rows, then Log out as a red row
 * that confirms through the P14 dialog.
 */
export const UserInfo: React.FC<Props> = ({ accent: accentProp, ...props }) => {
  const accent = useAccent(accentProp);
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { logout } = useJellyfin();
  const { t } = useTranslation();
  const { confirm, dialog } = useConfirmDialog();
  const { check, checkNow, available: updatesAvailable } = useAppUpdate();
  const setUpdatePrompt = useSetAtom(appUpdatePromptAtom);
  // Android phone only: iOS updates through TestFlight.
  const showUpdates = updatesAvailable && !Platform.isTV;
  const updateValue = (() => {
    switch (check.kind) {
      case "checking":
        return t("home.settings.user_info.checking_for_updates");
      case "available":
        return t("home.settings.user_info.update_to_version", {
          version: check.versionName,
        });
      case "upToDate":
        return t("home.settings.user_info.up_to_date");
      case "unsupported":
        return t("home.settings.user_info.updates_unavailable");
      case "error":
        return t("home.settings.user_info.update_check_failed");
      default:
        return undefined;
    }
  })();
  const onCheckForUpdates = () => {
    if (check.kind === "checking") return;
    if (check.kind === "available") {
      setUpdatePrompt({ versionName: check.versionName, percent: null });
    } else {
      checkNow();
    }
  };

  // Graduated build identifier — see utils/version.ts:
  // dev → "0.54.1 · branch · commit", develop/CI → "0.54.1 · commit · #run", production → "0.54.1".
  const { display: version } = getVersionInfo();

  const onLogout = () =>
    confirm({
      title: t("home.settings.log_out_confirm_title"),
      message: t("home.settings.log_out_confirm_desc"),
      confirmLabel: t("home.settings.log_out_button"),
      destructive: true,
      onConfirm: () => logout(),
    });

  return (
    <View {...props}>
      <ListGroup
        title={t("home.settings.user_info.user_info_title")}
        accent={accent}
      >
        <ListItem
          icon='server-outline'
          title={t("home.settings.user_info.server")}
          value={serverHost(api?.basePath) || api?.basePath}
        />
        <ListItem
          icon='person-outline'
          title={t("home.settings.user_info.user")}
          value={user?.Name}
        />
        <ListItem
          icon='information-circle-outline'
          title={t("home.settings.user_info.app_version")}
          value={version}
        />
        {showUpdates && (
          <ListItem
            icon='cloud-download-outline'
            title={t("home.settings.user_info.check_for_updates")}
            value={updateValue}
            onPress={onCheckForUpdates}
          />
        )}
        <ListItem
          icon='power-outline'
          textColor='red'
          title={t("home.settings.log_out_button")}
          onPress={onLogout}
        >
          <Feather name='arrow-right' size={18} color={NeonBoard.red} />
        </ListItem>
      </ListGroup>
      {dialog}
    </View>
  );
};
