import type { Api } from "@jellyfin/sdk";
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  getDisplayPreferencesApi,
  getUserApi,
} from "@jellyfin/sdk/lib/utils/api";
import type * as LocalAuthenticationModule from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { Linking, Platform } from "react-native";
import { storage } from "@/utils/mmkv";
import {
  credentialKey,
  getPreviousServers,
  type SavedServerAccount,
  saveAccountCredential,
} from "@/utils/secureCredentials";
import {
  emptyBackoff,
  isNewPin,
  PIN_LENGTH,
  type PinBackoff,
  wrongPin,
} from "./pinRules";

const protectionKey = "weaselplex.phone.kidProtection";
const backoffKey = "weaselplex.phone.pinBackoff";
const preferenceId = "weaselplex-profile";
const preferenceClient = "weaselplex";
const proofDuration = 5 * 60_000;

export const phoneProfilesEnabled = !Platform.isTV && Platform.OS !== "web";

export interface PhoneProfile extends SavedServerAccount {
  serverUrl: string;
}

export interface PreparedProfile {
  api: Api;
  user: UserDto & { Id: string };
  account: PhoneProfile;
  pinLength: number;
  biometric: boolean;
  fresh?: boolean;
}

export interface KidSignIn {
  accessToken: string;
  user: UserDto;
  displayName?: string;
}

const profileGrants = new WeakMap<
  PreparedProfile,
  {
    until: number;
    revision?: string;
  }
>();

function grantProfile(profile: PreparedProfile, revision?: string) {
  profileGrants.set(profile, { until: Date.now() + proofDuration, revision });
}

export function profilesFor(serverUrl?: string | null): PhoneProfile[] {
  const servers = getPreviousServers();
  return servers
    .filter((server) => !serverUrl || server.address === serverUrl)
    .flatMap((server) =>
      server.accounts.map((account) => ({
        ...account,
        serverUrl: server.address,
      })),
    );
}

export function isPhoneKid(user?: UserDto | null): boolean {
  return phoneProfilesEnabled && user?.Policy?.MaxParentalRating != null;
}

export function isKidProtected(): boolean {
  return phoneProfilesEnabled && storage.contains(protectionKey);
}

export function requiresParent(ceiling: number): boolean {
  if (!isKidProtected()) return false;
  return ceiling > (storage.getNumber(protectionKey) ?? 0);
}

export function recordCeiling(ceiling: number | null): void {
  if (ceiling !== null || isKidProtected()) {
    storage.set(protectionKey, ceiling ?? Number.MAX_SAFE_INTEGER);
  }
}

export function grantIsCurrent(profile?: PreparedProfile): boolean {
  return !!profile && (profileGrants.get(profile)?.until ?? 0) > Date.now();
}

export function lockProfile(profile: PreparedProfile): void {
  profileGrants.delete(profile);
}

export function disableKidProtection(profile: PreparedProfile): void {
  if (
    !grantIsCurrent(profile) ||
    profilesFor().some((account) => account.ceiling !== null)
  ) {
    throw new Error("Remove the kid profiles and enter a grown-up PIN first.");
  }
  storage.remove(protectionKey);
  lockProfile(profile);
}

function preferences(profile: { api: Api; user: { Id: string } }) {
  return {
    client: preferenceClient,
    displayPreferencesId: preferenceId,
    userId: profile.user.Id,
  };
}

async function readPreferences(profile: Parameters<typeof preferences>[0]) {
  return (
    await getDisplayPreferencesApi(profile.api).getDisplayPreferences(
      preferences(profile),
      { timeout: 3_000 },
    )
  ).data;
}

function biometricKey(profile: Pick<PreparedProfile, "account">) {
  return `biometric_${credentialKey(profile.account.serverUrl, profile.account.userId)}`;
}

async function hasBiometricFor(
  profile: Pick<PreparedProfile, "account">,
  revision?: string | null,
): Promise<boolean> {
  if (!revision) return false;
  return SecureStore.getItemAsync(biometricKey(profile)).then(
    (enrolled) => enrolled === revision,
    () => false,
  );
}

export async function forgetProfileBiometric(
  serverUrl: string,
  userId: string,
) {
  await SecureStore.deleteItemAsync(
    `biometric_${credentialKey(serverUrl, userId)}`,
  ).catch(() => {});
}

export async function preparePhoneProfile(
  api: Api,
  account: PhoneProfile,
  fresh = false,
): Promise<PreparedProfile> {
  const { data: user } = await getUserApi(api).getCurrentUser({
    timeout: 5_000,
  });
  if (!user.Policy || user.Id !== account.userId || user.Policy.IsDisabled) {
    throw new Error("Sign this profile in again.");
  }
  const ceiling = user.Policy.MaxParentalRating ?? null;
  const details = { api, user: { ...user, Id: account.userId } };
  const prefs =
    ceiling === null ? (await readPreferences(details)).CustomPrefs : null;
  const pinLength = prefs?.pin?.length ?? 0;
  const biometric =
    pinLength > 0 && (await hasBiometricFor({ account }, prefs?.pinUpdatedAt));

  return {
    ...details,
    account: {
      ...account,
      ceiling,
      hasAccountPin: pinLength > 0,
      primaryImageTag: user.PrimaryImageTag ?? undefined,
    },
    pinLength,
    biometric,
    fresh,
  };
}

export async function savePhoneProfile(
  profile: PreparedProfile,
): Promise<void> {
  if (!profile.api.accessToken) throw new Error("Sign this profile in again.");
  await saveAccountCredential({
    ...profile.account,
    serverName: "",
    securityType: "none",
    token: profile.api.accessToken,
  });
}

export function pinBackoff(): PinBackoff {
  const value = storage.getString(backoffKey);
  return value ? (JSON.parse(value) as PinBackoff) : emptyBackoff;
}

let pinAttempt: Promise<boolean> | undefined;

export function verifyPhonePin(
  profile: PreparedProfile,
  pin: string,
  isCurrent: () => boolean,
): Promise<boolean> {
  if (pinAttempt || profile.account.ceiling !== null)
    return Promise.resolve(false);
  pinAttempt = (async () => {
    const previous = pinBackoff();
    const now = Date.now();
    if (previous.until > now) return false;
    const { CustomPrefs } = await readPreferences(profile);
    const stored = CustomPrefs?.pin;
    profile.pinLength = stored?.length ?? 0;
    if (!stored || !/^[UDLR]+$/.test(pin) || pin !== stored) {
      storage.set(backoffKey, JSON.stringify(wrongPin(previous, now)));
      return false;
    }
    storage.remove(backoffKey);
    if (!isCurrent()) return false;
    const revision = CustomPrefs?.pinUpdatedAt ?? undefined;
    profile.biometric = await hasBiometricFor(profile, revision);
    if (!isCurrent()) return false;
    grantProfile(profile, revision);
    return true;
  })().finally(() => {
    pinAttempt = undefined;
  });
  return pinAttempt;
}

export async function writePhonePin(
  profile: PreparedProfile,
  pin: string | null,
  isCurrent: () => boolean,
): Promise<void> {
  if (profile.account.ceiling !== null || (pin !== null && !isNewPin(pin))) {
    throw new Error("Enter four arrows.");
  }
  const data = await readPreferences(profile);
  if (!isCurrent()) return;
  const hadPin = Boolean(data.CustomPrefs?.pin);
  if (
    (hadPin || pin === null) &&
    (!grantIsCurrent(profile) ||
      profileGrants.get(profile)?.revision !==
        (data.CustomPrefs?.pinUpdatedAt ?? undefined))
  ) {
    throw new Error("Enter the current PIN first.");
  }
  if (
    pin === null &&
    profilesFor().some((account) => account.ceiling !== null)
  ) {
    throw new Error(
      "Every grown-up needs a PIN when there are kid profiles on this phone.",
    );
  }

  const revision = new Date().toISOString();
  await getDisplayPreferencesApi(profile.api).updateDisplayPreferences(
    {
      ...preferences(profile),
      displayPreferencesDto: {
        ...data,
        CustomPrefs: {
          ...data.CustomPrefs,
          pin: pin ?? "",
          pinUpdatedAt: revision,
        },
      },
    },
    { timeout: 10_000 },
  );
  profile.pinLength = pin ? PIN_LENGTH : 0;
  profile.account.hasAccountPin = pin !== null;
  await forgetProfileBiometric(profile.account.serverUrl, profile.user.Id);
  profile.biometric = false;
  if (!isCurrent()) return;
  if (pin) grantProfile(profile, revision);
  else storage.remove(protectionKey);
}

function localAuthentication(): typeof LocalAuthenticationModule {
  // Expo doesn't supply the native module on tvOS.
  return require("expo-local-authentication");
}

export async function availableBiometrics(): Promise<string | null> {
  if (!phoneProfilesEnabled) return null;
  const LocalAuthentication = localAuthentication();
  const [enrolled, types] = await Promise.all([
    LocalAuthentication.getEnrolledLevelAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  if (enrolled < LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG)
    return null;
  if (
    types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
  ) {
    return Platform.OS === "ios" ? "Face ID" : "Face unlock";
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return Platform.OS === "ios" ? "Touch ID" : "Fingerprint";
  }
  return null;
}

async function authenticateLocally() {
  const result = await localAuthentication().authenticateAsync({
    promptMessage: "Unlock your WeaselPlex profile",
    disableDeviceFallback: true,
    biometricsSecurityLevel: "strong",
  });
  return result.success;
}

export async function enrollProfileBiometric(
  profile: PreparedProfile,
  isCurrent: () => boolean,
): Promise<boolean> {
  if (!grantIsCurrent(profile)) return false;
  const { CustomPrefs } = await readPreferences(profile);
  const revision = CustomPrefs?.pinUpdatedAt;
  if (
    !CustomPrefs?.pin ||
    !revision ||
    revision !== profileGrants.get(profile)?.revision ||
    !isCurrent() ||
    !(await authenticateLocally()) ||
    !isCurrent()
  )
    return false;
  // Store only the PIN revision, scoped to this profile and this device.
  await SecureStore.setItemAsync(biometricKey(profile), revision, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  profile.biometric = true;
  return true;
}

export async function unlockProfileBiometric(
  profile: PreparedProfile,
  isCurrent: () => boolean,
): Promise<boolean> {
  if (pinBackoff().until > Date.now() || !profile.biometric) return false;
  const revision = await SecureStore.getItemAsync(biometricKey(profile));
  if (
    !revision ||
    !isCurrent() ||
    !(await authenticateLocally()) ||
    !isCurrent()
  )
    return false;
  const { CustomPrefs } = await readPreferences(profile);
  if (
    !isCurrent() ||
    !CustomPrefs?.pin ||
    revision !== CustomPrefs.pinUpdatedAt
  )
    return false;
  storage.remove(backoffKey);
  grantProfile(profile, revision);
  return true;
}

export function openForgotPin() {
  return Linking.openURL("https://theweasel.tv/weaselplex/profiles");
}
