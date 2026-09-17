import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { NeonBoard } from "@/constants/Colors";
import type { ServerUrlResolverState } from "@/hooks/useServerUrlResolver";
import { Loader } from "../Loader";
import { Text } from "./Text";

/**
 * Compact status line for the server-URL resolver, for screens whose layout
 * (e.g. ListItem rows) doesn't fit the full `ServerUrlField`. Renders nothing
 * while idle. 12 `mid` while resolving, green when resolved, red on failure.
 */
export function ServerUrlStatusText({
  state,
  className = "",
}: {
  state: ServerUrlResolverState;
  className?: string;
}) {
  const { t } = useTranslation();

  if (state.status === "idle") return null;

  if (state.status === "resolving") {
    return (
      <View className={`flex-row items-center ${className}`}>
        <Loader color={NeonBoard.mid} />
        <Text variant='meta' muted style={{ marginLeft: 8 }}>
          {t("server_url.resolving")}
        </Text>
      </View>
    );
  }

  if (state.status === "ok") {
    return (
      <Text variant='meta' accent={NeonBoard.green} className={className}>
        {t("server_url.resolved", { url: state.resolvedUrl })}
      </Text>
    );
  }

  const message =
    state.reason === "wrong-service"
      ? t("server_url.wrong_service")
      : state.reason === "invalid" || state.reason === "empty"
        ? t("server_url.invalid_url")
        : t("server_url.unreachable");

  return (
    <Text variant='meta' accent={NeonBoard.red} className={className}>
      {message}
    </Text>
  );
}
