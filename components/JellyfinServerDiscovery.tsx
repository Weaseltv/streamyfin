import { Feather } from "@expo/vector-icons";
import type React from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";
import { NeonBoard } from "@/constants/Colors";
import { useJellyfinDiscovery } from "@/hooks/useJellyfinDiscovery";
import { LoadingLine } from "./common/LoadingLine";
import { Text } from "./common/Text";
import { ListGroup } from "./list/ListGroup";
import { ListItem } from "./list/ListItem";

interface Props {
  onServerSelect?: (server: { address: string; serverName?: string }) => void;
}

/**
 * "Search for local servers" as a volt link with the `wifi` glyph; the
 * servers found list as hairline rows under a SERVERS head.
 */
const JellyfinServerDiscovery: React.FC<Props> = ({ onServerSelect }) => {
  const { servers, isSearching, startDiscovery } = useJellyfinDiscovery();
  const { t } = useTranslation();

  return (
    <View style={{ marginTop: 20 }}>
      <TouchableOpacity
        onPress={startDiscovery}
        disabled={isSearching}
        activeOpacity={0.7}
        accessibilityRole='button'
        hitSlop={8}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingVertical: 8,
          opacity: isSearching ? 0.6 : 1,
        }}
      >
        <Feather name='wifi' size={18} color={NeonBoard.volt} />
        <Text variant='rowTitle' accent={NeonBoard.volt}>
          {isSearching
            ? t("server.searching")
            : t("server.search_for_local_servers")}
        </Text>
      </TouchableOpacity>
      <LoadingLine accent={NeonBoard.volt} active={isSearching} />

      {servers.length ? (
        <ListGroup title={t("server.servers")} style={{ marginTop: 8 }}>
          {servers.map((server) => (
            <ListItem
              key={server.address}
              onPress={() =>
                onServerSelect?.({
                  address: server.address,
                  serverName: server.serverName,
                })
              }
              title={server.serverName || server.address}
              subtitle={server.serverName ? server.address : undefined}
              showArrow
            />
          ))}
        </ListGroup>
      ) : null}
    </View>
  );
};

export default JellyfinServerDiscovery;
