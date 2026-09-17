import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { t } from "i18next";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";
import { Button } from "@/components/Button";
import { HeaderButton } from "@/components/common/HeaderButton";
import { Input } from "@/components/common/Input";
import { SectionHeader } from "@/components/common/SectionHeader";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { Text } from "@/components/common/Text";
import JellyfinServerDiscovery from "@/components/JellyfinServerDiscovery";
import { QuickConnectCodeModal } from "@/components/login/QuickConnectCodeModal";
import { PreviousServersList } from "@/components/PreviousServersList";
import { CustomHeaderSheet } from "@/components/settings/CustomHeaderSheet";
import { NeonBoard } from "@/constants/Colors";
import { DEFAULT_SERVER_URL } from "@/constants/DefaultServer";
import { glow, Sizes } from "@/constants/neon";
import { useGlobalModal } from "@/providers/GlobalModalProvider";
import {
  apiAtom,
  pendingAccountSaveAtom,
  useJellyfin,
  userAtom,
} from "@/providers/JellyfinProvider";
import { type CustomHeader, usableCustomHeaders } from "@/utils/customHeaders";
import {
  checkJellyfinServer,
  ServerTooOldError,
} from "@/utils/jellyfin/checkServer";
import type { SavedServer } from "@/utils/secureCredentials";
import { serverHost } from "@/utils/serverHost";

const CredentialsSchema = z.object({
  username: z.string().min(1, t("login.username_required")),
});

const ACCENT = NeonBoard.volt;
const MASCOT = 96;
const LABEL_WIDTH = 104;

/** A 12 `mid` inline error under a field. */
const FieldError: React.FC<{ message?: string | null }> = ({ message }) =>
  message ? (
    <Text
      variant='meta'
      accent={NeonBoard.red}
      style={{ marginTop: 6, paddingHorizontal: Sizes.gutter }}
    >
      {message}
    </Text>
  ) : null;

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

export const Login: React.FC = () => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const {
    setServer,
    login,
    removeServer,
    initiateQuickConnect,
    stopQuickConnectPolling,
    loginWithSavedCredential,
    loginWithPassword,
  } = useJellyfin();
  const setPendingAccountSave = useSetAtom(pendingAccountSaveAtom);

  const {
    apiUrl: _apiUrl,
    username: _username,
    password: _password,
  } = params as { apiUrl: string; username: string; password: string };

  const [loadingServerCheck, setLoadingServerCheck] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [serverURL, setServerURL] = useState<string>(
    _apiUrl || DEFAULT_SERVER_URL,
  );
  const [serverName, setServerName] = useState<string>("");
  const [credentials, setCredentials] = useState<{
    username: string;
    password: string;
  }>({
    username: _username || "",
    password: _password || "",
  });
  const [showPassword, setShowPassword] = useState(false);

  // Failures show inline in red under the field they belong to.
  const [serverError, setServerError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Custom proxy auth headers entered before connecting. Passing `undefined`
  // keeps whatever is already saved for the server (see checkJellyfinServer),
  // so half-filled rows — a preset added but not typed into — can never
  // overwrite a saved server's working headers. Clearing them is done from
  // Settings → Network.
  const [pendingHeaders, setPendingHeaders] = useState<CustomHeader[]>([]);
  const usableHeaders = usableCustomHeaders(pendingHeaders);
  const connectHeaders = usableHeaders.length > 0 ? usableHeaders : undefined;

  const { showModal, hideModal } = useGlobalModal();
  const openHeaderSheet = useCallback(() => {
    showModal(
      <CustomHeaderSheet
        initialHeaders={pendingHeaders}
        onChange={setPendingHeaders}
        onClose={hideModal}
      />,
    );
  }, [pendingHeaders, showModal, hideModal]);

  // Quick Connect code shown in the in-app sheet while polling for authorization
  const [quickConnectCode, setQuickConnectCode] = useState<string | null>(null);

  // Close the code sheet as soon as the session is authorized — the native
  // Alert used before had no programmatic dismiss and stayed open after login.
  useEffect(() => {
    if (user) setQuickConnectCode(null);
  }, [user]);

  // Stop Quick Connect polling when leaving the login page (parity with TVLogin)
  useEffect(() => {
    return () => {
      stopQuickConnectPolling();
    };
  }, [stopQuickConnectPolling]);

  // Going back to server selection keeps this component mounted (same screen,
  // different state), so the unmount cleanup above doesn't run. Without this a
  // code authorized after leaving would silently log the user in later.
  useEffect(() => {
    if (!api?.basePath) {
      stopQuickConnectPolling();
      setQuickConnectCode(null);
    }
  }, [api?.basePath, stopQuickConnectPolling]);

  // Save account state — only the intent lives here; the protection picker is
  // the global PendingAccountSaveModal, shown after the login succeeds.
  const [saveAccount, setSaveAccount] = useState(false);

  // Tracks an in-flight Quick Connect attempt (code issued, provider polling).
  const [quickConnectActive, setQuickConnectActive] = useState(false);

  // A Quick Connect login with "save account" on flags the post-login save:
  // the protection picker shows globally once the session exists (this screen
  // unmounts on login, so it can't host the modal).
  useEffect(() => {
    if (user) {
      if (quickConnectActive && saveAccount) {
        setPendingAccountSave({ serverName });
      }
      setQuickConnectActive(false);
    }
  }, [user]);

  // Handle URL params for server connection
  useEffect(() => {
    (async () => {
      if (_apiUrl) {
        await setServer({
          address: _apiUrl,
        });
      }
    })();
  }, [_apiUrl]);

  // Handle auto-login when api is ready and credentials are provided via URL params
  useEffect(() => {
    if (api?.basePath && _apiUrl && _username && _password) {
      setCredentials({ username: _username, password: _password });
      login(_username, _password);
    }
  }, [api?.basePath, _apiUrl, _username, _password]);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: "",
      headerLeft: () =>
        api?.basePath ? (
          <HeaderButton
            placement='left'
            variant='text'
            onPress={() => {
              setLoginError(null);
              removeServer();
            }}
            style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
          >
            <Feather name='chevron-left' size={22} color={ACCENT} />
            <Text variant='rowTitle' accent={ACCENT}>
              {t("login.change_server")}
            </Text>
          </HeaderButton>
        ) : null,
    });
  }, [serverName, navigation, api?.basePath]);

  const handleLogin = async () => {
    Keyboard.dismiss();

    const result = CredentialsSchema.safeParse(credentials);
    if (!result.success) {
      setLoginError(t("login.username_required"));
      return;
    }

    const ok = await performLogin(credentials.username, credentials.password);
    // The protection picker shows AFTER a successful login (global modal) —
    // never for a failed one.
    if (ok && saveAccount) {
      setPendingAccountSave({ serverName });
    }
  };

  const performLogin = async (
    username: string,
    password: string,
  ): Promise<boolean> => {
    setLoading(true);
    setLoginError(null);
    try {
      await login(username, password, serverName);
      return true;
    } catch (error) {
      setLoginError(
        error instanceof Error
          ? error.message
          : t("login.an_unexpected_error_occurred"),
      );
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLoginWithSavedCredential = async (
    serverUrl: string,
    userId: string,
  ) => {
    await loginWithSavedCredential(serverUrl, userId);
  };

  const handlePasswordLogin = async (
    serverUrl: string,
    username: string,
    password: string,
  ) => {
    await loginWithPassword(serverUrl, username, password);
  };

  const handleAddAccount = (server: SavedServer) => {
    setServer({ address: server.address });
    if (server.name) {
      setServerName(server.name);
    }
  };

  const handleConnect = useCallback(
    async (url: string, headers?: CustomHeader[]) => {
      setLoadingServerCheck(true);
      setServerError(null);
      try {
        const result = await checkJellyfinServer(
          url.trim().replace(/\/$/, ""),
          headers,
        );
        if (!result) {
          setServerError(t("login.could_not_connect_to_server"));
          return;
        }
        setServerName(result.name);
        await setServer({ address: result.url });
      } catch (e) {
        if (e instanceof ServerTooOldError) {
          setServerError(
            `${t("login.too_old_server_text")} · ${t(
              "login.too_old_server_description",
            )}`,
          );
        }
      } finally {
        setLoadingServerCheck(false);
      }
    },
    [setServer],
  );

  const handleQuickConnect = async () => {
    try {
      const code = await initiateQuickConnect();
      if (code) {
        setQuickConnectActive(true);
        setQuickConnectCode(code);
      }
    } catch (_error) {
      Alert.alert(
        t("login.error_title"),
        t("login.failed_to_initiate_quick_connect"),
      );
    }
  };

  const host = serverHost(api?.basePath);
  const disabledGlyph = NeonBoard.low;

  return (
    <SafeAreaView
      style={{ flex: 1, paddingBottom: 16, backgroundColor: NeonBoard.stage }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        {api?.basePath ? (
          <ScrollView
            keyboardShouldPersistTaps='handled'
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
          >
            {/* Page head: host eyebrow, title, note */}
            <View style={{ paddingHorizontal: Sizes.gutter }}>
              <Text variant='eyebrow' accent={ACCENT} numberOfLines={1}>
                {host || api.basePath}
              </Text>
              <Text variant='display' style={{ marginTop: 4 }}>
                {serverName
                  ? `${t("login.login_to_title")} ${serverName}`
                  : t("login.log_in_to_weaselplex")}
              </Text>
              <Text
                variant='body'
                muted
                style={{ fontSize: 13, lineHeight: 18, marginTop: 6 }}
              >
                {t("login.account_note")}
              </Text>
            </View>

            <SectionHeader
              title={t("home.settings.switch_user.account")}
              accent={ACCENT}
            />

            {/* Username */}
            <View style={fieldRow}>
              <Text variant='meta' muted style={{ width: LABEL_WIDTH }}>
                {t("login.username_placeholder")}
              </Text>
              <Input
                style={{ flex: 1 }}
                placeholder={t("login.username_placeholder")}
                onChangeText={(text) => {
                  setLoginError(null);
                  setCredentials((prev) => ({ ...prev, username: text }));
                }}
                onEndEditing={(e) => {
                  const newValue = e.nativeEvent.text;
                  if (newValue && newValue !== credentials.username) {
                    setCredentials((prev) => ({
                      ...prev,
                      username: newValue,
                    }));
                  }
                }}
                value={credentials.username}
                keyboardType='default'
                returnKeyType='done'
                autoCapitalize='none'
                autoCorrect={false}
                textContentType='username'
                clearButtonMode='while-editing'
                maxLength={500}
              />
            </View>

            {/* Password with the eye toggle */}
            <View style={fieldRow}>
              <Text variant='meta' muted style={{ width: LABEL_WIDTH }}>
                {t("login.password_placeholder")}
              </Text>
              <View style={{ flex: 1 }}>
                <Input
                  style={{ paddingRight: 44 }}
                  placeholder={t("login.password_placeholder")}
                  onChangeText={(text) => {
                    setLoginError(null);
                    setCredentials((prev) => ({ ...prev, password: text }));
                  }}
                  onEndEditing={(e) => {
                    const newValue = e.nativeEvent.text;
                    if (newValue && newValue !== credentials.password) {
                      setCredentials((prev) => ({
                        ...prev,
                        password: newValue,
                      }));
                    }
                  }}
                  value={credentials.password}
                  secureTextEntry={!showPassword}
                  keyboardType='default'
                  returnKeyType='done'
                  autoCapitalize='none'
                  textContentType='password'
                  clearButtonMode='never'
                  maxLength={500}
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  accessibilityRole='button'
                  accessibilityLabel={
                    showPassword
                      ? t("custom_headers.hide_value")
                      : t("custom_headers.show_value")
                  }
                  hitSlop={8}
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: 44,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather
                    name={showPassword ? "eye" : "eye-off"}
                    size={20}
                    color={NeonBoard.mid}
                  />
                </TouchableOpacity>
              </View>
            </View>
            <FieldError message={loginError} />

            {/* Save this account */}
            <TouchableOpacity
              onPress={() => setSaveAccount(!saveAccount)}
              activeOpacity={0.7}
              accessibilityRole='switch'
              accessibilityState={{ checked: saveAccount }}
              style={[
                fieldRow,
                { justifyContent: "space-between", minHeight: Sizes.row },
              ]}
            >
              <Text variant='rowTitle'>{t("save_account.save_for_later")}</Text>
              <SettingSwitch
                value={saveAccount}
                onValueChange={setSaveAccount}
              />
            </TouchableOpacity>

            <View style={{ paddingHorizontal: Sizes.gutter, marginTop: 20 }}>
              <Button
                onPress={handleLogin}
                loading={loading}
                disabled={!credentials.username.trim()}
                accent={ACCENT}
                iconLeft={
                  <Feather
                    name='arrow-right'
                    size={18}
                    color={
                      credentials.username.trim()
                        ? NeonBoard.onAccent
                        : disabledGlyph
                    }
                  />
                }
              >
                {t("login.login_button")}
              </Button>
              <Button
                onPress={handleQuickConnect}
                color='white'
                variant='border'
                style={{ marginTop: 12 }}
                iconLeft={
                  <Feather name='grid' size={18} color={NeonBoard.text} />
                }
              >
                {t("login.quick_connect")}
              </Button>
            </View>
          </ScrollView>
        ) : (
          <ScrollView
            keyboardShouldPersistTaps='handled'
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
                style={{ marginTop: 10, textAlign: "center" }}
              >
                {t("server.enter_url_to_jellyfin_server")}
              </Text>
            </View>

            {/* Server URL */}
            <View style={[fieldRow, { marginTop: 20 }]}>
              <Text variant='meta' muted style={{ width: LABEL_WIDTH }}>
                {t("server.server_url")}
              </Text>
              <Input
                style={{ flex: 1 }}
                aria-label={t("server.server_url")}
                placeholder={t("server.server_url_placeholder")}
                onChangeText={(text) => {
                  setServerError(null);
                  setServerURL(text);
                }}
                value={serverURL}
                keyboardType='url'
                returnKeyType='go'
                autoCapitalize='none'
                autoCorrect={false}
                textContentType='URL'
                maxLength={500}
                onSubmitEditing={() => handleConnect(serverURL, connectHeaders)}
              />
            </View>
            <FieldError message={serverError} />

            <View style={{ paddingHorizontal: Sizes.gutter, marginTop: 16 }}>
              <Button
                loading={loadingServerCheck}
                disabled={loadingServerCheck}
                onPress={async () => {
                  await handleConnect(serverURL, connectHeaders);
                }}
                accent={ACCENT}
                iconLeft={
                  <Feather
                    name='arrow-right'
                    size={18}
                    color={
                      loadingServerCheck ? disabledGlyph : NeonBoard.onAccent
                    }
                  />
                }
              >
                {t("server.connect_button")}
              </Button>

              {/* Servers behind an access gateway need their headers before
                  the very first request, so they are configured here. */}
              <TouchableOpacity
                onPress={openHeaderSheet}
                activeOpacity={0.7}
                accessibilityRole='button'
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 12,
                }}
              >
                <Text variant='rowTitle' accent={ACCENT}>
                  {t("custom_headers.advanced_title")}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text variant='meta' muted style={{ marginRight: 4 }}>
                    {usableHeaders.length > 0
                      ? t("custom_headers.header_count", {
                          count: usableHeaders.length,
                        })
                      : t("custom_headers.source_none")}
                  </Text>
                  <Feather name='chevron-right' size={18} color={ACCENT} />
                </View>
              </TouchableOpacity>
            </View>

            {/* A server picked from a list connects with its own saved
                headers — passing the ones typed above would overwrite them. */}
            <PreviousServersList
              onServerSelect={async (s) => {
                await handleConnect(s.address);
              }}
              onQuickLogin={handleQuickLoginWithSavedCredential}
              onPasswordLogin={handlePasswordLogin}
              onAddAccount={handleAddAccount}
            />

            <JellyfinServerDiscovery
              onServerSelect={async (server) => {
                setServerURL(server.address);
                if (server.serverName) {
                  setServerName(server.serverName);
                }
                await handleConnect(server.address);
              }}
            />
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      {/* Dismissing only hides the code — polling continues so the login still
          completes if the code is authorized from another device afterwards. */}
      <QuickConnectCodeModal
        code={quickConnectCode}
        onClose={() => setQuickConnectCode(null)}
      />
    </SafeAreaView>
  );
};

/** A field row on the stage: 12 `mid` label, the field, a 1pt `line` rule. */
const fieldRow = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  paddingHorizontal: Sizes.gutter,
  paddingVertical: 8,
  borderBottomWidth: 1,
  borderBottomColor: NeonBoard.line,
};
