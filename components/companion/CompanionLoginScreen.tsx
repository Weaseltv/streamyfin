import { useAtom } from "jotai";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { Button } from "@/components/Button";
import { Input } from "@/components/common/Input";
import { ServerUrlStatusText } from "@/components/common/ServerUrlStatusText";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { glowRule, Scrims, Sizes } from "@/constants/neon";
import useRouter from "@/hooks/useAppRouter";
import { useServerUrlResolver } from "@/hooks/useServerUrlResolver";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { sendCredentialsToTV } from "@/utils/pairingService";
import { jellyfinProbe } from "@/utils/serverUrl/probes/jellyfin";

type ScreenState =
  | "scanning"
  | "no-permission"
  | "confirm"
  | "form"
  | "sending"
  | "success"
  | "error";

interface ParsedPairingCode {
  code: string;
}

type ExpoCameraModule = typeof import("expo-camera");

const ExpoCamera: ExpoCameraModule | null = Platform.isTV
  ? null
  : require("expo-camera");

export const CompanionLoginScreen: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const [screenState, setScreenState] = useState<ScreenState>(
    Platform.isTV ? "form" : "scanning",
  );
  const [pairingCode, setPairingCode] = useState<string>("");
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const serverResolver = useServerUrlResolver(jellyfinProbe);

  // Pre-fill server URL and username from current session
  useEffect(() => {
    if (api?.basePath) {
      setServerUrl(api.basePath);
    }

    if (user?.Name) {
      setUsername(user.Name);
    }
  }, [api?.basePath, user?.Name]);

  // Request camera permission
  useEffect(() => {
    if (!ExpoCamera) return;

    ExpoCamera.Camera.getCameraPermissionsAsync().then((response) => {
      if (!response.granted) {
        ExpoCamera.Camera.requestCameraPermissionsAsync().then((result) => {
          if (!result.granted) {
            setScreenState("no-permission");
          }
        });
      }
    });
  }, []);

  const validateAndParseQR = useCallback(
    (data: string): ParsedPairingCode | null => {
      try {
        const parsed = JSON.parse(data);

        if (
          parsed.action === "streamyfin-pair" &&
          typeof parsed.code === "string" &&
          parsed.code.length > 0
        ) {
          return { code: parsed.code };
        }

        return null;
      } catch {
        return null;
      }
    },
    [],
  );

  const handleBarCodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (screenState !== "scanning") return;

      const parsed = validateAndParseQR(data);

      if (!parsed) {
        setErrorMessage(t("companion_login.error_invalid_qr"));
        setScreenState("error");
        return;
      }

      setPairingCode(parsed.code);

      // If user is logged in, show confirmation screen (still needs password)
      // Otherwise, go straight to the full form
      if (user?.Name && api?.basePath) {
        setScreenState("confirm");
      } else {
        setScreenState("form");
      }
    },
    [screenState, validateAndParseQR, t, user?.Name, api?.basePath],
  );

  const handleSendCredentials = useCallback(async () => {
    if (
      !serverUrl.trim() ||
      !username.trim() ||
      !password.trim() ||
      !pairingCode
    ) {
      return;
    }

    setScreenState("sending");

    try {
      // Send the canonical URL when the server resolves from here; fall back
      // to the raw input so pairing still works when it doesn't (the TV may
      // reach the server even if this phone currently can't).
      let urlToSend = serverUrl.trim();
      const resolved = await serverResolver.resolve(urlToSend);
      if (resolved.ok) urlToSend = resolved.url;

      await sendCredentialsToTV(
        pairingCode,
        urlToSend,
        username.trim(),
        password,
      );

      setScreenState("success");
    } catch {
      setErrorMessage(t("companion_login.error_generic"));
      setScreenState("error");
    }
  }, [pairingCode, serverUrl, username, password, t, serverResolver.resolve]);

  const handleScanAgain = useCallback(() => {
    setPairingCode("");
    setErrorMessage(null);
    setPassword("");
    setScreenState("scanning");
  }, []);

  const handleDone = useCallback(() => {
    router.back();
  }, [router]);

  const handleUseDifferentUser = useCallback(() => {
    setUsername("");
    setPassword("");
    setScreenState("form");
  }, []);

  const handleEnterCodeManually = useCallback(() => {
    setScreenState("form");
  }, []);

  if (screenState === "no-permission") {
    return (
      <View className='flex-1 bg-stage'>
        <View className='flex-1 items-center justify-center p-8'>
          <Text variant='pageTitle' className='mb-3 text-center'>
            {t("companion_login.error_permission_denied")}
          </Text>

          {Platform.OS === "ios" && (
            <View className='mt-4 self-stretch'>
              <Button onPress={() => Linking.openSettings()}>
                {t("companion_login.open_settings")}
              </Button>
            </View>
          )}

          <View className='mt-3 self-stretch'>
            <Button onPress={handleDone} color='white' variant='border'>
              {t("companion_login.done")}
            </Button>
          </View>
        </View>
      </View>
    );
  }

  if (screenState === "success") {
    return (
      <View className='flex-1 bg-stage'>
        <View className='flex-1 items-center justify-center p-8'>
          <Text variant='pageTitle' className='mb-3 text-center'>
            {t("companion_login.success_title")}
          </Text>

          <Text variant='body' muted className='mb-8 text-center'>
            {t("companion_login.pairing_tv_connecting")}
          </Text>

          <View className='self-stretch'>
            <Button onPress={handleDone} color='primary'>
              {t("companion_login.done")}
            </Button>
          </View>
        </View>
      </View>
    );
  }

  if (screenState === "error") {
    return (
      <View className='flex-1 bg-stage'>
        <View className='flex-1 items-center justify-center p-8'>
          <Text
            variant='pageTitle'
            className='mb-3 text-center'
            style={{ color: NeonBoard.red }}
          >
            {t("companion_login.error_title")}
          </Text>

          <Text variant='body' muted className='mb-8 text-center'>
            {errorMessage}
          </Text>

          <View className='mt-4 flex-row gap-3 self-stretch'>
            <View className='flex-1'>
              <Button onPress={handleScanAgain} color='primary'>
                {t("companion_login.scan_again")}
              </Button>
            </View>

            <View className='flex-1'>
              <Button onPress={handleDone} color='white' variant='border'>
                {t("companion_login.done")}
              </Button>
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (screenState === "sending") {
    return (
      <View className='flex-1 bg-stage'>
        <View className='flex-1 items-center justify-center p-8'>
          <Text variant='section' style={{ color: NeonBoard.warn }}>
            {t("companion_login.authorizing")}
          </Text>
        </View>
      </View>
    );
  }

  if (screenState === "confirm") {
    return (
      <KeyboardAvoidingView
        className='flex-1 bg-stage'
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            padding: 24,
          }}
          keyboardShouldPersistTaps='handled'
        >
          <Text variant='pageTitle' className='mb-2 text-center'>
            {t("companion_login.login_as", { username })}
          </Text>

          <Text variant='body' muted className='mb-8 text-center'>
            {t("companion_login.on_server", {
              server: serverUrl.replace(/^https?:\/\//, ""),
            })}
          </Text>

          <View className='mb-6 items-center'>
            <Text variant='eyebrow' accent={NeonBoard.volt} className='mb-1'>
              {t("companion_login.pairing_code_label")}
            </Text>

            <Text
              variant='display'
              className='mb-8 text-center'
              style={{ letterSpacing: 6 }}
            >
              {pairingCode}
            </Text>
          </View>

          <View className='mb-5'>
            <Text variant='meta' muted className='mb-2'>
              {t("login.password_placeholder")}
            </Text>

            <Input
              value={password}
              onChangeText={setPassword}
              placeholder={t("login.password_placeholder")}
              autoCapitalize='none'
              autoCorrect={false}
              secureTextEntry
              returnKeyType='done'
              onSubmitEditing={handleSendCredentials}
              autoFocus
            />
          </View>

          <View className='mt-2'>
            <Button
              onPress={handleSendCredentials}
              disabled={!password.trim()}
              color='primary'
            >
              {t("companion_login.authorize_button")}
            </Button>
          </View>

          <View className='mt-6 items-center'>
            <TouchableOpacity onPress={handleUseDifferentUser} className='py-2'>
              <Text variant='chip' accent={NeonBoard.volt}>
                {t("companion_login.use_different_user")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleScanAgain} className='py-2'>
              <Text variant='chip' muted>
                {t("companion_login.scan_again")}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (screenState === "form") {
    return (
      <KeyboardAvoidingView
        className='flex-1 bg-stage'
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            padding: Sizes.gutter,
          }}
          keyboardShouldPersistTaps='handled'
        >
          <Text variant='pageTitle' className='mb-4'>
            {t("companion_login.pairing_enter_credentials")}
          </Text>

          <View className='mb-5'>
            <Text variant='meta' muted className='mb-2'>
              {t("companion_login.pairing_code_label")}
            </Text>

            <Input
              value={pairingCode}
              onChangeText={setPairingCode}
              placeholder={t("companion_login.pairing_code_label")}
              autoCapitalize='characters'
              autoCorrect={false}
              returnKeyType='next'
              style={{ textAlign: "center", fontSize: 22, letterSpacing: 6 }}
            />
          </View>

          <View className='mb-5'>
            <Text variant='meta' muted className='mb-2'>
              {t("companion_login.server")}
            </Text>

            <Input
              value={serverUrl}
              onChangeText={(text) => {
                setServerUrl(text);
                // Editing invalidates the previous resolution status.
                serverResolver.reset();
              }}
              placeholder={t("server.server_url_placeholder")}
              autoCapitalize='none'
              autoCorrect={false}
              keyboardType='url'
              returnKeyType='next'
              onBlur={() => {
                const candidate = serverUrl.trim();
                if (candidate) {
                  serverResolver.resolve(candidate).then((r) => {
                    if (r.ok) setServerUrl(r.url);
                  });
                }
              }}
            />
            <ServerUrlStatusText state={serverResolver} className='mt-2' />
          </View>

          <View className='mb-5'>
            <Text variant='meta' muted className='mb-2'>
              {t("login.username_placeholder")}
            </Text>

            <Input
              value={username}
              onChangeText={setUsername}
              placeholder={t("login.username_placeholder")}
              autoCapitalize='none'
              autoCorrect={false}
              returnKeyType='next'
            />
          </View>

          <View className='mb-5'>
            <Text variant='meta' muted className='mb-2'>
              {t("login.password_placeholder")}
            </Text>

            <Input
              value={password}
              onChangeText={setPassword}
              placeholder={t("login.password_placeholder")}
              autoCapitalize='none'
              autoCorrect={false}
              secureTextEntry
              returnKeyType='done'
              onSubmitEditing={handleSendCredentials}
            />
          </View>

          <View className='flex-row gap-3'>
            <View className='flex-1'>
              <Button onPress={handleScanAgain} color='white' variant='border'>
                {t("companion_login.scan_again")}
              </Button>
            </View>

            <View className='flex-1'>
              <Button
                onPress={handleSendCredentials}
                disabled={
                  !serverUrl.trim() ||
                  !username.trim() ||
                  !password.trim() ||
                  !pairingCode.trim()
                }
                color='primary'
              >
                {t("companion_login.authorize_button")}
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const CameraView = ExpoCamera?.CameraView;

  if (!CameraView) {
    return (
      <View className='flex-1 bg-stage items-center justify-center p-8'>
        <View className='self-stretch'>
          <Button onPress={handleEnterCodeManually} color='primary'>
            {t("companion_login.enter_code_manually")}
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View className='flex-1 bg-video items-center justify-center'>
      {/* Camera full screen */}
      <CameraView
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
        onBarcodeScanned={handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
      />

      {/* Flat stage scrim over the camera */}
      <View
        className='absolute inset-0'
        style={{ backgroundColor: Scrims.modal }}
      />

      {/* Center scan area: a square volt frame with a glow */}
      <View className='items-center'>
        <View
          style={[
            {
              height: 250,
              width: 250,
              borderWidth: 2,
              borderColor: NeonBoard.volt,
            },
            glowRule(NeonBoard.volt),
          ]}
        />

        <Text variant='body' className='mt-6 text-center'>
          {t("companion_login.align_qr")}
        </Text>

        <TouchableOpacity
          onPress={handleEnterCodeManually}
          className='mt-4 px-5 py-2'
        >
          <Text variant='chip' accent={NeonBoard.volt}>
            {t("companion_login.enter_code_manually")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
