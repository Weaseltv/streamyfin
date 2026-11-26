import { Ionicons } from "@expo/vector-icons";
import { type Api, Jellyfin } from "@jellyfin/sdk";
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";
import * as Crypto from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Button } from "@/components/Button";
import { Input } from "@/components/common/Input";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { KID_AVATAR_IDS } from "@/utils/avatars/avatarIds";
import { saveProfilePicture } from "@/utils/avatars/profilePicture";
import { createApiWithCustomHeaders } from "@/utils/jellyfin/createApi";
import {
  AddKidController,
  type AddKidError,
  type AddKidStep,
  formatPairingCode,
} from "@/utils/kidProfiles/addKidController";
import { KID_NAME_MAX_LENGTH } from "@/utils/kidProfiles/kidNames";
import {
  createKidProfilesClient,
  KID_LEVELS,
  type KidLevel,
  WEASELPLEX_WEBSITE_URL,
} from "@/utils/kidProfiles/kidProfilesApi";
import { createKidQuickConnect } from "@/utils/kidProfiles/kidQuickConnect";
import { APP_VERSION } from "@/utils/version";
import { AvatarGrid } from "./AvatarGrid";
import { ProfileFlowScaffold } from "./ProfileFlowScaffold";

/** The website's Kids profiles page, where a kid's page pairs it to a device (contract 12.3). */
const PROFILES_URL = `${WEASELPLEX_WEBSITE_URL}/weaselplex/profiles`;
const PAIR_KID_URL = `${PROFILES_URL}/kids`;
const PROFILES_SITE = PROFILES_URL.replace(/^https?:\/\//, "");

export interface AddKidFlowProps {
  /** The verified grown-up's own authenticated session. */
  api: Api;
  /** The kid's sign-in, handed over to be saved and opened. A rejection keeps the flow open. */
  onKid: (profile: {
    accessToken: string;
    user: UserDto;
    displayName?: string;
  }) => Promise<void>;
  onClose: () => void;
  /** Jellyfin user ids already saved on this phone; their kids aren't offered again. */
  savedUserIds?: readonly string[];
}

/**
 * "Add kid profile" (port of the TV's `AddKidFlowUi.kt` from "How do you want to add a kid?" on):
 * create a new kid, sign in one of the account's own kids, or pair another family's kid with a code
 * approved on the website. Who is adding, their PIN and the other grown-ups' PINs come before it.
 */
export function AddKidFlow({
  api,
  onKid,
  onClose,
  savedUserIds,
}: AddKidFlowProps) {
  const { t } = useTranslation();
  const onKidRef = useRef(onKid);
  onKidRef.current = onKid;
  const savedRef = useRef(savedUserIds);
  savedRef.current = savedUserIds;

  const [controller, setController] = useState<AddKidController | null>(null);
  const [step, setStep] = useState<AddKidStep>({ kind: "chooseHow" });
  useEffect(() => {
    const jellyfin = new Jellyfin({
      clientInfo: api.clientInfo,
      deviceInfo: api.deviceInfo,
    });
    const next = new AddKidController({
      parentToken: api.accessToken,
      kids: createKidProfilesClient({
        fetch,
        clientHeader: `${Platform.OS}-phone/${APP_VERSION}`,
        newRequestId: () => Crypto.randomUUID(),
      }),
      quickConnect: createKidQuickConnect(api),
      onKid: (profile) => onKidRef.current(profile),
      savePicture: async (kid, avatarId) => {
        if (!kid.user.Id) return;
        await saveProfilePicture(
          createApiWithCustomHeaders(jellyfin, api.basePath, kid.accessToken),
          kid.user.Id,
          avatarId,
        );
      },
      hasAvatars: KID_AVATAR_IDS.length > 0,
      savedUserIds: () => savedRef.current ?? [],
      newKey: () => Crypto.randomUUID(),
    });
    setController(next);
    setStep(next.getStep());
    const unsubscribe = next.subscribe(setStep);
    return () => {
      unsubscribe();
      next.cancel();
    };
  }, [api]);

  const close = () => {
    controller?.cancel();
    onClose();
  };
  const back = () => {
    if (step.kind === "working" || step.kind === "done") return;
    if (!controller?.back()) close();
  };
  const backRef = useRef(back);
  backRef.current = back;
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      backRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);

  const title = t("profiles.add_kid.title");
  const leading =
    step.kind === "working" || step.kind === "done"
      ? undefined
      : step.kind === "chooseHow" || step.kind === "failed"
        ? ("close" as const)
        : ("back" as const);
  const onLeading = leading === "close" ? close : back;

  if (!controller)
    return <ProfileFlowScaffold title={title}>{null}</ProfileFlowScaffold>;

  switch (step.kind) {
    case "chooseHow":
      return (
        <ProfileFlowScaffold
          title={title}
          subtitle={t("profiles.add_kid.how_subtitle")}
          leading={leading}
          onLeading={onLeading}
        >
          <View style={{ gap: 12 }}>
            <ChoiceRow
              icon='person-add-outline'
              label={t("profiles.add_kid.create_new_kid_profile")}
              onPress={() => controller.createNew()}
            />
            <ChoiceRow
              icon='link-outline'
              label={t("profiles.add_kid.add_existing_kid_profile")}
              onPress={() => void controller.addExisting()}
            />
          </View>
        </ProfileFlowScaffold>
      );

    case "pairing":
      return (
        <ProfileFlowScaffold
          title={t("profiles.add_kid.add_existing_kid_profile")}
          leading={leading}
          onLeading={onLeading}
        >
          <View style={{ alignItems: "flex-start", gap: 12 }}>
            {step.code ? (
              <Text
                variant='display'
                accessibilityLabel={step.code.split("").join(" ")}
                style={{ color: NeonBoard.volt, fontSize: 44, lineHeight: 52 }}
                selectable
              >
                {formatPairingCode(step.code)}
              </Text>
            ) : (
              <ActivityIndicator
                color={NeonBoard.text}
                style={{ height: 52 }}
              />
            )}
            {step.code ? (
              <View
                accessible={false}
                style={{
                  padding: 10,
                  backgroundColor: "white",
                  borderRadius: 8,
                }}
              >
                <QRCode value={PAIR_KID_URL} size={108} />
              </View>
            ) : null}
            <Text>
              {t("profiles.add_kid.pair_code_instructions", {
                site: PROFILES_SITE,
              })}
            </Text>
            <Pressable
              onPress={() => void Linking.openURL(PAIR_KID_URL)}
              accessibilityRole='link'
              hitSlop={8}
            >
              <Text style={{ color: NeonBoard.volt }}>{PROFILES_SITE}</Text>
            </Pressable>
            {step.trouble ? (
              <Text style={{ color: NeonBoard.red }}>
                {t("profiles.add_kid.pair_trouble")}
              </Text>
            ) : null}
          </View>
          {step.kids.length > 0 ? (
            <View
              style={{
                marginTop: 24,
                paddingTop: 16,
                borderTopWidth: 1,
                borderTopColor: NeonBoard.line,
                gap: 12,
              }}
            >
              <Text variant='section'>
                {t("profiles.add_kid.pair_your_kids")}
              </Text>
              {step.kids.map((kid) => (
                <ChoiceRow
                  key={kid.id}
                  icon='person-outline'
                  label={t("profiles.add_kid.sign_in_kid", {
                    name: kid.displayName,
                  })}
                  onPress={() => void controller.signInExisting(kid)}
                />
              ))}
            </View>
          ) : null}
        </ProfileFlowScaffold>
      );

    case "pairingRefused":
      return (
        <ProfileFlowScaffold
          title={title}
          subtitle={t("profiles.add_kid.pair_refused")}
          leading={leading}
          onLeading={onLeading}
        >
          <View style={{ gap: 12 }}>
            <Button onPress={() => void controller.addExisting()}>
              {t("profiles.add_kid.pair_new_code")}
            </Button>
            <Button variant='border' onPress={close}>
              {t("common.cancel")}
            </Button>
          </View>
        </ProfileFlowScaffold>
      );

    case "form":
      return (
        <ProfileFlowScaffold
          title={t("profiles.add_kid.create_new_kid_profile")}
          leading={leading}
          onLeading={onLeading}
          footer={
            <Button onPress={() => void controller.submitForm()}>
              {t("common.continue")}
            </Button>
          }
        >
          <Text variant='overline' muted style={{ marginBottom: 8 }}>
            {t("profiles.add_kid.kid_name")}
          </Text>
          <Input
            value={step.name}
            onChangeText={(name) => controller.updateForm({ name })}
            placeholder={t("profiles.add_kid.kid_name_placeholder")}
            autoCapitalize='words'
            autoCorrect={false}
            maxLength={KID_NAME_MAX_LENGTH + 10}
            returnKeyType='done'
          />
          {step.nameError ? (
            <Text style={{ color: NeonBoard.red, marginTop: 8 }}>
              {step.nameError === "taken"
                ? t("profiles.add_kid.kid_name_taken")
                : t("profiles.add_kid.kid_name_invalid")}
            </Text>
          ) : null}
          <Text
            variant='overline'
            muted
            style={{ marginTop: 24, marginBottom: 8 }}
          >
            {t("profiles.add_kid.kid_level")}
          </Text>
          <View style={{ gap: 10 }}>
            {KID_LEVELS.map(({ wireId }) => (
              <LevelCard
                key={wireId}
                level={wireId}
                selected={step.level === wireId}
                onPress={() => controller.updateForm({ level: wireId })}
              />
            ))}
          </View>
          {step.error ? (
            <Text style={{ color: NeonBoard.red, marginTop: 12 }}>
              {errorText(t, step.error)}
            </Text>
          ) : null}
        </ProfileFlowScaffold>
      );

    case "pickPicture":
      return (
        <ProfileFlowScaffold
          title={t("profiles.picture.pick_a_picture_for", { name: step.name })}
          leading={leading}
          onLeading={onLeading}
          footer={
            <Button
              variant='border'
              onPress={() => void controller.pickPicture(null)}
            >
              {t("profiles.add_kid.skip_for_now")}
            </Button>
          }
        >
          <AvatarGrid
            ids={KID_AVATAR_IDS}
            selected={step.selected}
            onPick={(id) => void controller.pickPicture(id)}
          />
        </ProfileFlowScaffold>
      );

    case "working":
      return (
        <ProfileFlowScaffold title={title}>
          <View style={{ alignItems: "center", gap: 16, marginTop: 24 }}>
            <ActivityIndicator size='large' color={NeonBoard.volt} />
            <Text variant='rowTitle' style={{ textAlign: "center" }}>
              {step.work === "creating"
                ? t("profiles.add_kid.creating_kid", { name: step.kidName })
                : t("profiles.add_kid.adding_kid", { name: step.kidName })}
            </Text>
            <Text muted style={{ textAlign: "center" }}>
              {t("profiles.add_kid.takes_a_moment")}
            </Text>
          </View>
        </ProfileFlowScaffold>
      );

    case "failed":
      return (
        <ProfileFlowScaffold
          title={title}
          subtitle={errorText(t, step.error)}
          leading={leading}
          onLeading={onLeading}
        >
          <View style={{ gap: 12 }}>
            {step.retry.kind !== "none" ? (
              <Button onPress={() => void controller.retry()}>
                {t("profiles.add_kid.retry")}
              </Button>
            ) : null}
            <Button variant='border' onPress={close}>
              {t("common.cancel")}
            </Button>
          </View>
        </ProfileFlowScaffold>
      );

    case "done":
      return (
        <ProfileFlowScaffold title={title}>
          <ActivityIndicator
            size='large'
            color={NeonBoard.volt}
            style={{ marginTop: 24 }}
          />
        </ProfileFlowScaffold>
      );
  }
}

type T = ReturnType<typeof useTranslation>["t"];

function errorText(t: T, error: AddKidError): string {
  switch (error.kind) {
    case "notAvailable":
      return t("profiles.add_kid.errors.unavailable");
    case "limitReached":
      return t("profiles.add_kid.errors.limit");
    case "nameTaken":
      return t("profiles.add_kid.kid_name_taken");
    case "pickLevel":
      return t("profiles.add_kid.kid_pick_level");
    case "accessInactive":
      return t("profiles.add_kid.errors.access");
    case "signInAgain":
      return t("profiles.add_kid.errors.sign_in_again");
    case "kidNotActive":
      return t("profiles.add_kid.errors.kid_not_active");
    case "rateLimited":
      return error.minutes != null
        ? t("profiles.add_kid.errors.rate_limited", {
            minutes: error.minutes,
          })
        : t("profiles.add_kid.errors.rate_limited_unknown");
    case "network":
      return t("profiles.add_kid.errors.network");
    case "generic":
      return t("profiles.add_kid.errors.generic");
  }
}

function ChoiceRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole='button'
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        minHeight: 56,
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: NeonBoard.line2,
        backgroundColor: NeonBoard.card,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Ionicons name={icon} size={22} color={NeonBoard.volt} />
      <Text variant='rowTitle' style={{ flex: 1 }}>
        {label}
      </Text>
      <Ionicons name='chevron-forward' size={20} color={NeonBoard.mid} />
    </Pressable>
  );
}

function LevelCard({
  level,
  selected,
  onPress,
}: {
  level: KidLevel;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const label =
    level === "kids"
      ? t("profiles.add_kid.levels.kids")
      : level === "older_kids"
        ? t("profiles.add_kid.levels.older_kids")
        : t("profiles.add_kid.levels.teens");
  const description =
    level === "kids"
      ? t("profiles.add_kid.levels.kids_description")
      : level === "older_kids"
        ? t("profiles.add_kid.levels.older_kids_description")
        : t("profiles.add_kid.levels.teens_description");
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole='radio'
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderRadius: 12,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? NeonBoard.volt : NeonBoard.line2,
        backgroundColor: NeonBoard.card,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Ionicons
        name={selected ? "radio-button-on" : "radio-button-off"}
        size={22}
        color={selected ? NeonBoard.volt : NeonBoard.mid}
      />
      <View style={{ flex: 1 }}>
        <Text variant='rowTitle'>{label}</Text>
        <Text muted>{description}</Text>
      </View>
    </Pressable>
  );
}
