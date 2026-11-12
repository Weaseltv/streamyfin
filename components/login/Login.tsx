import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useNavigation } from "expo-router";
import { t } from "i18next";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { DEFAULT_SERVER_URL } from "@/constants/DefaultServer";
import { glow, Sizes } from "@/constants/neon";
import { apiAtom, useJellyfin, userAtom } from "@/providers/JellyfinProvider";
import {
  checkJellyfinServer,
  ServerTooOldError,
} from "@/utils/jellyfin/checkServer";
import { serverHost } from "@/utils/serverHost";
import {
  isWeaselPlexConnectDenied,
  WEASELPLEX_CONNECT_RETURN_URL,
  weaselPlexConnectDevice,
  weaselPlexConnectUrl,
} from "@/utils/weaselPlexConnect";

// Phone only: the auth session opens the website's approve page and comes
// back through the return link. TV builds use TVLogin.
const WebBrowser = !Platform.isTV ? require("expo-web-browser") : null;

const ACCENT = NeonBoard.volt;
const MASCOT = 96;

/** The text wordmark: `WEASEL` in `text`, `PLEX` in volt, Condensed 36. */
const Wordmark: React.FC = () => (
  <Text
    variant='display'
    allowFontScaling={false}
    style={{ fontSize: 36, lineHeight: 40, letterSpacing: 0.5 }}
  >
    WEASEL
    <Text
      variant='display'
      allowFontScaling={false}
      accent={ACCENT}
      style={{ fontSize: 36, lineHeight: 40, letterSpacing: 0.5 }}
    >
      PLEX
    </Text>
  </Text>
);

/**
 * The phone's only sign-in screen: one "Connect to your account" button.
 *
 * It connects to the WeaselPlex server this build points at, asks it for a
 * Quick Connect code and opens the theweasel.tv approve page for that code.
 * The customer signs in there with their theweasel.tv account and taps
 * Approve; the provider is polling the code and finishes the login. There is
 * no server address, username or password to type. Deny on the page comes
 * back as the return link marked denied, which stops the wait.
 */
export const Login: React.FC = () => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const navigation = useNavigation();
  const { setServer, initiateQuickConnect, stopQuickConnectPolling } =
    useJellyfin();

  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Set while the server is being connected, so the approve page opens as
  // soon as the provider has the server (its Quick Connect needs it).
  const signInWhenReady = useRef(false);

  const weaselPlexHost = serverHost(DEFAULT_SERVER_URL);
  const onWeaselPlex =
    weaselPlexHost !== "" && serverHost(api?.basePath) === weaselPlexHost;

  // No "Change server" in the header: the app only signs in to WeaselPlex.
  useEffect(() => {
    navigation.setOptions({ headerTitle: "", headerLeft: () => null });
  }, [navigation]);

  // Stop Quick Connect polling when leaving the login screen.
  useEffect(() => {
    return () => {
      stopQuickConnectPolling();
    };
  }, [stopQuickConnectPolling]);

  useEffect(() => {
    if (user) setConnecting(false);
  }, [user]);

  const openApprovePage = useCallback(async () => {
    if (!WebBrowser) return;
    try {
      const code = await initiateQuickConnect();
      if (!code) {
        setError(t("login.could_not_reach_weaselplex"));
        return;
      }
      // `isPad` only exists on the iOS Platform type; read it loosely.
      const device = weaselPlexConnectDevice(
        Platform.OS,
        (Platform as { isPad?: boolean }).isPad === true,
      );
      const result = await WebBrowser.openAuthSessionAsync(
        weaselPlexConnectUrl(code, device),
        WEASELPLEX_CONNECT_RETURN_URL,
      );
      if (result?.type === "success" && isWeaselPlexConnectDenied(result.url)) {
        stopQuickConnectPolling();
        setNotice(t("login.connect_denied"));
      }
      // Approved: polling finishes the login within a second. Closed without
      // the return link: polling keeps running quietly, so an approval that
      // already happened still signs in; tapping Connect again starts over.
    } catch (_error) {
      setError(t("login.could_not_reach_weaselplex"));
    } finally {
      setConnecting(false);
    }
  }, [initiateQuickConnect, stopQuickConnectPolling]);

  // The server was just connected: open the approve page now.
  useEffect(() => {
    if (onWeaselPlex && signInWhenReady.current) {
      signInWhenReady.current = false;
      void openApprovePage();
    }
  }, [onWeaselPlex, openApprovePage]);

  const connect = async () => {
    if (connecting) return;
    setError(null);
    setNotice(null);
    setConnecting(true);
    if (onWeaselPlex) {
      await openApprovePage();
      return;
    }
    try {
      const server = DEFAULT_SERVER_URL
        ? await checkJellyfinServer(DEFAULT_SERVER_URL.replace(/\/$/, ""))
        : null;
      if (!server) {
        setError(t("login.could_not_reach_weaselplex"));
        setConnecting(false);
        return;
      }
      signInWhenReady.current = true;
      await setServer({ address: server.url });
    } catch (e) {
      signInWhenReady.current = false;
      setError(
        e instanceof ServerTooOldError
          ? t("login.too_old_server_text")
          : t("login.could_not_reach_weaselplex"),
      );
      setConnecting(false);
    }
  };

  return (
    <SafeAreaView
      style={{ flex: 1, paddingBottom: 16, backgroundColor: NeonBoard.stage }}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingVertical: 24,
        }}
      >
        {/* Brand: 96 mascot with a volt glow over the text wordmark */}
        <View style={{ alignItems: "center", paddingHorizontal: 12 }}>
          <View
            style={[
              {
                width: MASCOT,
                height: MASCOT,
                borderRadius: MASCOT / 2,
                alignItems: "center",
                justifyContent: "center",
              },
              glow(ACCENT, 24, 0.6),
            ]}
          >
            <Image
              source={require("@/assets/images/weaselplex-mascot-white.png")}
              style={{ width: MASCOT, height: MASCOT }}
              contentFit='contain'
            />
          </View>
          <View style={{ marginTop: 16 }}>
            <Wordmark />
          </View>
          <Text
            variant='body'
            muted
            style={{
              marginTop: 10,
              textAlign: "center",
              paddingHorizontal: Sizes.gutter,
            }}
          >
            {t("server.connect_account_intro")}
          </Text>
        </View>

        <View style={{ paddingHorizontal: Sizes.gutter, marginTop: 24 }}>
          <Button
            loading={connecting}
            disabled={connecting}
            onPress={connect}
            accent={ACCENT}
            iconLeft={
              <Feather
                name='arrow-right'
                size={18}
                color={connecting ? NeonBoard.low : NeonBoard.onAccent}
              />
            }
          >
            {t("server.connect_to_your_account")}
          </Button>
          {error ? (
            <Text
              variant='meta'
              accent={NeonBoard.red}
              style={{ marginTop: 10, textAlign: "center" }}
            >
              {error}
            </Text>
          ) : null}
          {notice ? (
            <Text
              variant='meta'
              muted
              style={{ marginTop: 10, textAlign: "center" }}
            >
              {notice}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};
