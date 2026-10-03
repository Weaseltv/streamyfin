import { useAtomValue, useSetAtom } from "jotai";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Platform, TouchableOpacity, View } from "react-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { glowRule, Scrims } from "@/constants/neon";
import useRouter from "@/hooks/useAppRouter";
import { useHaptic } from "@/hooks/useHaptic";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useAccent } from "@/utils/atoms/pageAccent";
import { quickConnectCodeEntryRequestAtom } from "@/utils/atoms/quickConnect";
import {
  authorizeQuickConnectCode,
  extractQuickConnectCode,
} from "@/utils/quickConnect/code";

type ScreenState =
  | "scanning"
  | "no-permission"
  | "authorizing"
  | "success"
  | "error";

type ExpoCameraModule = typeof import("expo-camera");

const ExpoCamera: ExpoCameraModule | null = Platform.isTV
  ? null
  : require("expo-camera");

/**
 * Full-screen camera that reads the Quick Connect QR code a TV shows on its
 * sign-in screen and authorizes it with the signed-in account. The
 * six-digit entry stays in the Quick Connect sheet as the fallback.
 */
export const QuickConnectScanScreen: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const accent = useAccent();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const successHaptic = useHaptic("success");
  const errorHaptic = useHaptic("error");
  const requestCodeEntry = useSetAtom(quickConnectCodeEntryRequestAtom);

  const [screenState, setScreenState] = useState<ScreenState>("scanning");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // The camera keeps firing while a frame is in view; only the first read
  // goes through.
  const busyRef = useRef(false);

  useEffect(() => {
    if (!ExpoCamera) return;
    ExpoCamera.Camera.getCameraPermissionsAsync().then((response) => {
      if (response.granted) return;
      ExpoCamera.Camera.requestCameraPermissionsAsync().then((result) => {
        if (!result.granted) setScreenState("no-permission");
      });
    });
  }, []);

  const fail = useCallback(
    (message: string) => {
      errorHaptic();
      setErrorMessage(message);
      setScreenState("error");
    },
    [errorHaptic],
  );

  const handleBarCodeScanned = useCallback(
    async ({ data }: { data: string }) => {
      if (busyRef.current) return;
      busyRef.current = true;

      const code = extractQuickConnectCode(data);
      if (!code) {
        fail(t("home.settings.quick_connect.invalid_qr"));
        return;
      }
      if (!api) {
        fail(t("home.settings.quick_connect.invalid_code"));
        return;
      }

      setScreenState("authorizing");
      const ok = await authorizeQuickConnectCode(api, user?.Id, code);
      if (ok) {
        successHaptic();
        setScreenState("success");
      } else {
        fail(t("home.settings.quick_connect.code_rejected"));
      }
    },
    [api, user?.Id, fail, successHaptic, t],
  );

  const handleScanAgain = useCallback(() => {
    setErrorMessage(null);
    busyRef.current = false;
    setScreenState("scanning");
  }, []);

  const handleDone = useCallback(() => {
    router.back();
  }, [router]);

  // Back to settings, where the Quick Connect sheet reopens on the code step.
  const handleTypeCodeInstead = useCallback(() => {
    requestCodeEntry(true);
    router.back();
  }, [requestCodeEntry, router]);

  if (screenState === "no-permission") {
    return (
      <View className='flex-1 bg-stage'>
        <View className='flex-1 items-center justify-center p-8'>
          <Text variant='pageTitle' className='mb-3 text-center'>
            {t("companion_login.error_permission_denied")}
          </Text>

          <View className='mt-4 self-stretch'>
            <Button onPress={() => Linking.openSettings()} accent={accent}>
              {t("companion_login.open_settings")}
            </Button>
          </View>

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
            {t("home.settings.quick_connect.quick_connect_authorized")}
          </Text>

          <Text variant='body' muted className='mb-8 text-center'>
            {t("home.settings.quick_connect.tv_signed_in")}
          </Text>

          <View className='self-stretch'>
            <Button onPress={handleDone} accent={accent}>
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
            {t("home.settings.quick_connect.error")}
          </Text>

          <Text variant='body' muted className='mb-8 text-center'>
            {errorMessage}
          </Text>

          <View className='mt-4 flex-row gap-3 self-stretch'>
            <View className='flex-1'>
              <Button onPress={handleScanAgain} accent={accent}>
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

  if (screenState === "authorizing") {
    return (
      <View className='flex-1 bg-stage'>
        <View className='flex-1 items-center justify-center p-8'>
          <Text variant='section' style={{ color: NeonBoard.warn }}>
            {t("home.settings.quick_connect.authorizing")}
          </Text>
        </View>
      </View>
    );
  }

  const CameraView = ExpoCamera?.CameraView;

  if (!CameraView) {
    // Builds without the camera module: nothing to scan with.
    return (
      <View className='flex-1 bg-stage items-center justify-center p-8'>
        <Text variant='body' muted className='mb-6 text-center'>
          {t("home.settings.quick_connect.camera_unavailable")}
        </Text>
        <View className='self-stretch'>
          <Button onPress={handleDone} color='white' variant='border'>
            {t("companion_login.done")}
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View className='flex-1 bg-video items-center justify-center'>
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

      {/* Center scan area: a square accent frame with a glow */}
      <View className='items-center px-8'>
        <View
          style={[
            {
              height: 250,
              width: 250,
              borderWidth: 2,
              borderColor: accent,
            },
            glowRule(accent),
          ]}
        />

        <Text variant='body' className='mt-6 text-center'>
          {t("companion_login.align_qr")}
        </Text>

        <Text variant='meta' muted className='mt-2 text-center'>
          {t("home.settings.quick_connect.scan_hint")}
        </Text>

        <TouchableOpacity
          onPress={handleTypeCodeInstead}
          className='mt-4 px-5 py-2'
        >
          <Text variant='chip' accent={accent}>
            {t("home.settings.quick_connect.type_code_instead")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
