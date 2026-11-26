import axios from "axios";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, BackHandler, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { Login } from "@/components/login/Login";
import { NeonBoard } from "@/constants/Colors";
import {
  getServerUrlFromStorage,
  pendingPhoneProfileAtom,
  useJellyfin,
} from "@/providers/JellyfinProvider";
import {
  disableKidProtection,
  grantIsCurrent,
  isKidProtected,
  type KidSignIn,
  lockProfile,
  type PhoneProfile,
  type PreparedProfile,
  profilesFor,
  requiresParent,
  writePhonePin,
} from "@/utils/profiles/phoneProfiles";
import { addAccountToServer } from "@/utils/secureCredentials";
import { AddKidFlow } from "./AddKidFlow";
import { ProfileAvatar } from "./ProfileAvatar";
import { ProfilePicturePicker } from "./ProfilePicturePicker";
import { ProfilePin } from "./ProfilePin";

type PinScreen = {
  kind: "pin";
  profile: PreparedProfile;
  mode: "verify" | "create" | "change";
  proceed: () => void | Promise<void>;
};

type Screen =
  | { kind: "chooser" }
  | { kind: "signIn" }
  | {
      kind: "parent";
      proceed: (parent: PreparedProfile) => void | Promise<void>;
    }
  | { kind: "pinless"; profile: PreparedProfile }
  | { kind: "expired"; account: PhoneProfile }
  | {
      kind: "setupAdults";
      parent: PreparedProfile;
      other: PhoneProfile;
      prepared?: PreparedProfile;
      proceed: (parent: PreparedProfile) => void | Promise<void>;
    }
  | { kind: "manage" }
  | { kind: "actions"; profile: PreparedProfile }
  | { kind: "addKid"; parent: PreparedProfile }
  | { kind: "picture"; profile: PreparedProfile; required?: boolean }
  | PinScreen;

export function ProfileChooser() {
  const { t } = useTranslation();
  const {
    addPhoneKid,
    cancelPendingProfile,
    enterPhoneProfile,
    prepareSavedProfile,
    removeSavedCredential,
  } = useJellyfin();
  const pending = useAtomValue(pendingPhoneProfileAtom);
  const [profiles, setProfiles] = useState(() =>
    profilesFor(getServerUrlFromStorage()),
  );
  const [screen, setScreen] = useState<Screen>({ kind: "chooser" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const working = useRef(false);
  const savedPictures = useRef(new WeakSet<PreparedProfile>());
  const currentScreen = useRef<Screen>(screen);
  currentScreen.current = screen;

  const refreshRows = () => setProfiles(profilesFor(getServerUrlFromStorage()));

  // Cancel late PIN/session work when the chooser leaves the navigation stack.
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );

  const renewScreen = (next: Screen) => {
    currentScreen.current = next;
    setError("");
    setScreen(next);
  };

  const restart = () => {
    sequence.current++;
    working.current = false;
    setBusy(false);
    cancelPendingProfile();
    refreshRows();
    renewScreen({ kind: "chooser" });
  };

  const run = async (action: (isCurrent: () => boolean) => Promise<void>) => {
    if (working.current) return;
    const revision = sequence.current;
    const isCurrent = () => revision === sequence.current;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      await action(isCurrent);
    } catch {
      if (isCurrent()) {
        refreshRows();
        setError(t("profiles.could_not_open"));
      }
    } finally {
      if (isCurrent()) {
        working.current = false;
        setBusy(false);
      }
    }
  };

  const askPin = (
    profile: PreparedProfile,
    then: PinScreen["proceed"],
    mode: PinScreen["mode"] = "verify",
  ) => renewScreen({ kind: "pin", profile, mode, proceed: then });

  const enter = (profile: PreparedProfile, parent?: PreparedProfile) =>
    run((isCurrent) => enterPhoneProfile(profile, isCurrent, parent));

  const pick = async (profile: PreparedProfile, isCurrent: () => boolean) => {
    if (!isCurrent()) return;
    const ceiling = profile.account.ceiling;
    if (
      profile.fresh &&
      ceiling === null &&
      !profile.user.PrimaryImageTag &&
      !savedPictures.current.has(profile)
    ) {
      renewScreen({ kind: "picture", profile, required: true });
      return;
    }
    if (ceiling === null && profile.pinLength) {
      askPin(profile, () => enter(profile));
    } else if (ceiling === null && isKidProtected()) {
      if (profile.fresh) askPin(profile, () => enter(profile), "create");
      else renewScreen({ kind: "pinless", profile });
    } else if (
      profile.fresh &&
      ceiling != null &&
      profilesFor().some(
        (account) =>
          account.userId !== profile.user.Id && account.ceiling == null,
      )
    ) {
      chooseParent((parent) =>
        withAllAdultPins(parent, (proved) =>
          enterPhoneProfile(profile, isCurrent, proved),
        ),
      );
    } else if (ceiling != null && requiresParent(ceiling)) {
      renewScreen({
        kind: "parent",
        proceed: (parent) => enter(profile, parent),
      });
    } else {
      await enterPhoneProfile(profile, isCurrent);
    }
  };

  const prepare = (account: PhoneProfile) =>
    void run(async (isCurrent) => {
      try {
        const profile = await prepareSavedProfile(account);
        await pick(profile, isCurrent);
      } catch (error) {
        if (isCurrent() && account.ceiling == null && isExpired(error)) {
          renewScreen({ kind: "expired", account });
        } else {
          throw error;
        }
      }
    });

  useEffect(() => {
    if (pending) void run((isCurrent) => pick(pending, isCurrent));
  }, [pending]);

  // A kid removed by the parent on the website disappears from the chooser.
  // Refresh pictures at the same time, using each profile's own credential.
  useEffect(() => {
    if (screen.kind !== "chooser" || !profiles.length) return;
    let alive = true;
    const serverUrl = getServerUrlFromStorage();
    const rows = profilesFor(serverUrl);
    void Promise.all(
      rows.map(async (account) => {
        const profile = await prepareSavedProfile(account).catch(() => null);
        if (!profile || !alive) return;
        const { serverUrl: address, ...summary } = profile.account;
        addAccountToServer(address, "", summary);
      }),
    ).then(() => {
      if (alive) setProfiles(profilesFor(serverUrl));
    });
    return () => {
      alive = false;
    };
  }, [screen.kind, prepareSavedProfile, profiles.length]);

  const confirmRemove = (account: PhoneProfile, onRemove: () => void) => {
    Alert.alert(
      t("profiles.confirm_remove_phone", { name: account.username }),
      undefined,
      [
        { text: t("profiles.cancel"), style: "cancel" },
        {
          text: t("profiles.remove_phone"),
          style: "destructive",
          onPress: onRemove,
        },
      ],
    );
  };

  const remove = (account: PhoneProfile) =>
    confirmRemove(
      account,
      () =>
        void run(async (isCurrent) => {
          await removeSavedCredential(account.serverUrl, account.userId);
          if (isCurrent()) {
            refreshRows();
            renewScreen({ kind: "chooser" });
          }
        }),
    );

  const chooseParent = (
    then: (parent: PreparedProfile) => void | Promise<void>,
  ) => renewScreen({ kind: "parent", proceed: then });

  const verifyParent = (
    account: PhoneProfile,
    then: (parent: PreparedProfile) => void | Promise<void>,
  ) =>
    void run(async (isCurrent) => {
      const parent = await prepareSavedProfile(account);
      if (!isCurrent()) return;
      if (parent.account.ceiling !== null) throw new Error();
      if (parent.pinLength) askPin(parent, () => then(parent));
      else if (!isKidProtected()) askPin(parent, () => then(parent), "create");
      else renewScreen({ kind: "pinless", profile: parent });
    });

  const withAllAdultPins = (
    parent: PreparedProfile,
    proceed: (parent: PreparedProfile) => void | Promise<void>,
  ) =>
    run(async (isCurrent) => {
      if (!grantIsCurrent(parent)) throw new Error();
      for (const account of profilesFor()) {
        if (account.userId === parent.user.Id || account.ceiling != null)
          continue;
        let other: PreparedProfile;
        try {
          other = await prepareSavedProfile(account);
        } catch (error) {
          if (!isExpired(error)) throw error;
          if (isCurrent())
            renewScreen({
              kind: "setupAdults",
              parent,
              other: account,
              proceed,
            });
          return;
        }
        if (!isCurrent()) return;
        if (other.account.ceiling === null && !other.pinLength) {
          renewScreen({
            kind: "setupAdults",
            parent,
            other: other.account,
            prepared: other,
            proceed,
          });
          return;
        }
      }
      if (isCurrent() && grantIsCurrent(parent)) await proceed(parent);
    });

  const finishKidSignIn = async (
    owner: PreparedProfile,
    kid: KidSignIn,
    isCurrent: () => boolean,
  ) => {
    if (!isCurrent()) return;
    if (grantIsCurrent(owner)) {
      try {
        await addPhoneKid(owner, kid, isCurrent);
        return;
      } catch (error) {
        if (grantIsCurrent(owner)) throw error;
      }
    }
    if (!isCurrent()) return;
    const parent = await prepareSavedProfile(owner.account);
    if (!isCurrent()) return;
    if (!parent.pinLength) throw new Error(t("profiles.could_not_unlock"));
    askPin(parent, () => run((current) => addPhoneKid(parent, kid, current)));
  };

  const manage = (account: PhoneProfile) =>
    void run(async (isCurrent) => {
      const profile = await prepareSavedProfile(account);
      if (!isCurrent()) return;
      if (profile.account.ceiling !== null && isKidProtected()) {
        chooseParent(() => renewScreen({ kind: "actions", profile }));
      } else if (profile.pinLength) {
        askPin(profile, () => renewScreen({ kind: "actions", profile }));
      } else if (isKidProtected()) {
        renewScreen({ kind: "pinless", profile });
      } else {
        renewScreen({ kind: "actions", profile });
      }
    });

  const rows = (
    accounts: PhoneProfile[],
    onPick: (account: PhoneProfile) => void,
  ) => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
      {accounts.map((profile) => (
        <Pressable
          key={`${profile.serverUrl}:${profile.userId}`}
          accessibilityRole='button'
          accessibilityLabel={profile.username}
          disabled={busy}
          onPress={() => onPick(profile)}
          style={({ pressed }) => ({
            width: 98,
            gap: 6,
            alignItems: "center",
            opacity: pressed || busy ? 0.6 : 1,
          })}
        >
          <ProfileAvatar profile={profile} />
          <Text
            variant='body'
            numberOfLines={2}
            style={{ textAlign: "center" }}
          >
            {profile.username}
          </Text>
          {profile.ceiling != null ? (
            <Text variant='meta' muted>
              {t("profiles.kids")}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );

  useEffect(() => {
    if (screen.kind === "chooser") return;
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      restart();
      return true;
    });
    return () => back.remove();
  }, [screen.kind]);

  if (
    screen.kind === "signIn" ||
    (!profiles.length && screen.kind === "chooser" && !pending)
  ) {
    return <Login onBack={profiles.length ? restart : undefined} />;
  }

  if (screen.kind === "addKid") {
    const { parent } = screen;
    return (
      <AddKidFlow
        api={parent.api}
        onKid={(kid) =>
          finishKidSignIn(parent, kid, () => currentScreen.current === screen)
        }
        onClose={() => {
          lockProfile(parent);
          restart();
        }}
      />
    );
  }

  if (screen.kind === "picture") {
    const { profile, required } = screen;
    return (
      <ProfilePicturePicker
        api={profile.api}
        user={profile.user}
        onSaved={(user) => {
          if (currentScreen.current !== screen || user.Id !== profile.user.Id)
            return;
          if (required) {
            savedPictures.current.add(profile);
            profile.user = {
              ...profile.user,
              PrimaryImageTag: user.PrimaryImageTag,
            };
            profile.account.primaryImageTag = user.PrimaryImageTag ?? undefined;
            void run((isCurrent) => pick(profile, isCurrent));
          } else {
            const { serverUrl, ...account } = profile.account;
            addAccountToServer(serverUrl, "", {
              ...account,
              primaryImageTag: user.PrimaryImageTag ?? undefined,
            });
            restart();
          }
        }}
        onClose={restart}
      />
    );
  }

  const back = (
    <Button variant='border' onPress={restart}>
      {t("profiles.back")}
    </Button>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: NeonBoard.stage }}>
      <ScrollView
        contentContainerStyle={{
          padding: 24,
          gap: 18,
          flexGrow: 1,
          justifyContent: "center",
        }}
      >
        {error ? (
          <Text accessibilityLiveRegion='polite' accent={NeonBoard.red}>
            {error}
          </Text>
        ) : null}
        {screen.kind === "pin" ? (
          <ProfilePin
            key={`${screen.profile.user.Id}:${screen.mode}`}
            profile={screen.profile}
            mode={screen.mode}
            onSuccess={screen.proceed}
            onBack={restart}
          />
        ) : null}
        {screen.kind === "chooser" ? (
          <>
            <Text variant='display'>{t("profiles.whos_watching")}</Text>
            {rows(profiles, prepare)}
            <Button
              variant='border'
              disabled={busy}
              onPress={() => renewScreen({ kind: "signIn" })}
            >
              {t("profiles.add_grown_up")}
            </Button>
            {profiles.some((account) => account.ceiling == null) ? (
              <Button
                variant='border'
                disabled={busy}
                onPress={() =>
                  chooseParent((parent) =>
                    withAllAdultPins(parent, (proved) =>
                      renewScreen({ kind: "addKid", parent: proved }),
                    ),
                  )
                }
              >
                {t("profiles.add_kid")}
              </Button>
            ) : null}
            <Button
              variant='border'
              disabled={busy}
              onPress={() => renewScreen({ kind: "manage" })}
            >
              {t("profiles.manage")}
            </Button>
          </>
        ) : null}
        {screen.kind === "parent" ? (
          <>
            <Text variant='display'>{t("profiles.choose_grown_up")}</Text>
            {rows(
              profiles.filter((p) => p.ceiling == null),
              (account) => verifyParent(account, screen.proceed),
            )}
            {back}
          </>
        ) : null}
        {screen.kind === "pinless" ? (
          <>
            <Text variant='display'>
              {t("profiles.needs_pin", {
                name: screen.profile.account.username,
              })}
            </Text>
            <Text muted>{t("profiles.every_adult_needs_pin")}</Text>
            <Button onPress={() => renewScreen({ kind: "signIn" })}>
              {t("profiles.create_pin")}
            </Button>
            <Button
              variant='border'
              disabled={busy}
              onPress={() => void remove(screen.profile.account)}
            >
              {t("profiles.remove_phone")}
            </Button>
            {back}
          </>
        ) : null}
        {screen.kind === "expired" ? (
          <>
            <Text variant='display'>
              {t("profiles.sign_in_again", { name: screen.account.username })}
            </Text>
            <Button onPress={() => renewScreen({ kind: "signIn" })}>
              {t("profiles.sign_in")}
            </Button>
            <Button
              variant='border'
              disabled={busy}
              onPress={() => void remove(screen.account)}
            >
              {t("profiles.remove_phone")}
            </Button>
            {back}
          </>
        ) : null}
        {screen.kind === "setupAdults" ? (
          <>
            <Text variant='display'>{t("profiles.every_adult_needs_pin")}</Text>
            <Text muted>{screen.other.username}</Text>
            {screen.prepared ? (
              <Button
                disabled={busy}
                onPress={() => {
                  const other = screen.prepared;
                  if (!other) return;
                  askPin(
                    other,
                    () => {
                      lockProfile(other);
                      return withAllAdultPins(screen.parent, screen.proceed);
                    },
                    "create",
                  );
                }}
              >
                {t("profiles.create_pin")}
              </Button>
            ) : null}
            <Button
              variant='border'
              disabled={busy}
              onPress={() =>
                confirmRemove(screen.other, () => {
                  void removeSavedCredential(
                    screen.other.serverUrl,
                    screen.other.userId,
                  )
                    .then(() => withAllAdultPins(screen.parent, screen.proceed))
                    .catch(() => setError(t("profiles.could_not_open")));
                })
              }
            >
              {t("profiles.remove_phone")}
            </Button>
            {back}
          </>
        ) : null}
        {screen.kind === "manage" ? (
          <>
            <Text variant='display'>{t("profiles.manage")}</Text>
            {rows(profiles, manage)}
            {isKidProtected() &&
            profiles.every((account) => account.ceiling === null) ? (
              <Button
                variant='border'
                disabled={busy}
                onPress={() =>
                  chooseParent((parent) => {
                    disableKidProtection(parent);
                    restart();
                  })
                }
              >
                {t("profiles.turn_off_protection")}
              </Button>
            ) : null}
            {back}
          </>
        ) : null}
        {screen.kind === "actions" ? (
          <>
            <Text variant='display'>{screen.profile.account.username}</Text>
            {screen.profile.account.ceiling === null ? (
              <>
                <Button
                  variant='border'
                  onPress={() =>
                    renewScreen({ kind: "picture", profile: screen.profile })
                  }
                >
                  {t("profiles.change_picture")}
                </Button>
                <Button
                  variant='border'
                  disabled={busy}
                  onPress={() =>
                    askPin(
                      screen.profile,
                      restart,
                      screen.profile.pinLength ? "change" : "create",
                    )
                  }
                >
                  {t(
                    screen.profile.pinLength
                      ? "profiles.change_pin"
                      : "profiles.create_pin",
                  )}
                </Button>
                {screen.profile.pinLength &&
                profilesFor().every((account) => account.ceiling === null) ? (
                  <Button
                    variant='border'
                    disabled={busy}
                    onPress={() =>
                      void run(async (isCurrent) => {
                        await writePhonePin(screen.profile, null, isCurrent);
                        if (isCurrent()) restart();
                      })
                    }
                  >
                    {t("profiles.remove_pin")}
                  </Button>
                ) : null}
              </>
            ) : null}
            <Button
              variant='border'
              color='red'
              disabled={busy}
              onPress={() => void remove(screen.profile.account)}
            >
              {t("profiles.remove_phone")}
            </Button>
            {back}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function isExpired(error: unknown): boolean {
  return (
    axios.isAxiosError(error) &&
    (error.response?.status === 401 || error.response?.status === 403)
  );
}
