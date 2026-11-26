import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import {
  availableBiometrics,
  enrollProfileBiometric,
  openForgotPin,
  type PreparedProfile,
  pinBackoff,
  unlockProfileBiometric,
  verifyPhonePin,
  writePhonePin,
} from "@/utils/profiles/phoneProfiles";
import { offersForgotPin, PIN_LENGTH } from "@/utils/profiles/pinRules";

const arrows = [
  { value: "U", icon: "arrow-up" },
  { value: "L", icon: "arrow-left" },
  { value: "D", icon: "arrow-down" },
  { value: "R", icon: "arrow-right" },
] as const;

interface Props {
  profile: PreparedProfile;
  mode?: "verify" | "create" | "change";
  onSuccess: () => void | Promise<void>;
  onBack: () => void;
}

export function ProfilePin({
  profile,
  mode = "verify",
  onSuccess,
  onBack,
}: Props) {
  const { t } = useTranslation();
  const arrowLabels = {
    U: t("profiles.arrow_up"),
    D: t("profiles.arrow_down"),
    L: t("profiles.arrow_left"),
    R: t("profiles.arrow_right"),
  };

  const [entry, setEntry] = useState("");
  const [firstEntry, setFirstEntry] = useState("");
  const [wrong, setWrong] = useState(0);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [offerEnrollment, setOfferEnrollment] = useState(false);
  const [biometric, setBiometric] = useState<string | null>(null);
  const [until, setUntil] = useState(pinBackoff().until);
  const [now, setNow] = useState(Date.now);
  const alive = useRef(true);
  const working = useRef(false);
  const input = useRef("");
  const lockSeconds = Math.max(0, Math.ceil((until - now) / 1000));
  const length =
    mode === "verify" ? profile.pinLength || PIN_LENGTH : PIN_LENGTH;

  useEffect(() => {
    alive.current = true;
    void availableBiometrics()
      .then((value) => {
        if (alive.current) setBiometric(value);
      })
      .catch(() => {});
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!lockSeconds) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [lockSeconds]);

  const run = async (action: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setPending(true);
    setError("");
    try {
      await action();
    } catch {
      if (alive.current) setError(t("profiles.could_not_unlock"));
    } finally {
      working.current = false;
      input.current = "";
      if (alive.current) {
        setPending(false);
        setEntry("");
        setUntil(pinBackoff().until);
        setNow(Date.now());
      }
    }
  };

  const press = (value: string) => {
    if (working.current || (mode === "verify" && lockSeconds)) return;
    input.current += value;
    const pin = input.current;
    setEntry(pin);
    if (pin.length < length) return;
    void run(async () => {
      if (mode === "verify") {
        if (!(await verifyPhonePin(profile, pin, () => alive.current))) {
          if (alive.current) {
            setWrong((value) => value + 1);
            setError(t("profiles.wrong_pin"));
          }
          return;
        }
        if (!alive.current) return;
        if (biometric && !profile.biometric) setOfferEnrollment(true);
        else await onSuccess();
        return;
      }
      if (!firstEntry) {
        setFirstEntry(pin);
        return;
      }
      if (firstEntry !== pin) {
        setError(t("profiles.pin_mismatch"));
        setFirstEntry("");
        return;
      }
      await writePhonePin(profile, pin, () => alive.current);
      if (alive.current) await onSuccess();
    });
  };

  const cancel = () => {
    alive.current = false;
    onBack();
  };

  if (offerEnrollment && biometric) {
    return (
      <View style={{ gap: 16 }}>
        <Text variant='display'>
          {t("profiles.enable_biometrics", { biometric })}
        </Text>
        <Text variant='body' muted>
          {t("profiles.biometric_intro", { name: profile.account.username })}
        </Text>
        {error ? (
          <Text accessibilityLiveRegion='polite' accent={NeonBoard.red}>
            {error}
          </Text>
        ) : null}
        <Button
          disabled={pending}
          loading={pending}
          onPress={() =>
            void run(async () => {
              if (await enrollProfileBiometric(profile, () => alive.current)) {
                if (alive.current) await onSuccess();
              } else if (alive.current) {
                setError(t("profiles.could_not_unlock"));
              }
            })
          }
        >
          {t("profiles.use_biometrics", { biometric })}
        </Button>
        <Button
          variant='border'
          disabled={pending}
          onPress={() => void run(async () => onSuccess())}
        >
          {t("profiles.not_now")}
        </Button>
        <Button variant='border' onPress={cancel}>
          {t("profiles.back")}
        </Button>
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <Text variant='display'>
        {mode === "verify"
          ? t("profiles.enter_pin", { name: profile.account.username })
          : firstEntry
            ? t("profiles.repeat_pin")
            : t("profiles.create_pin_for", { name: profile.account.username })}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {Array.from({ length }, (_, index) => (
          <View
            key={String(index)}
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              borderWidth: 1,
              borderColor: NeonBoard.volt,
              backgroundColor:
                index < entry.length ? NeonBoard.volt : "transparent",
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {arrows.map(({ value, icon }) => (
          <Pressable
            key={value}
            accessibilityRole='button'
            accessibilityLabel={arrowLabels[value]}
            disabled={pending || (mode === "verify" && lockSeconds > 0)}
            onPress={() => press(value)}
            style={({ pressed }) => ({
              padding: 15,
              borderRadius: 12,
              backgroundColor: pressed ? NeonBoard.volt : NeonBoard.line,
            })}
          >
            <Feather name={icon} size={23} color={NeonBoard.text} />
          </Pressable>
        ))}
      </View>
      {mode === "verify" && lockSeconds > 0 ? (
        <Text accessibilityLiveRegion='polite' accent={NeonBoard.red}>
          {t("profiles.try_again_seconds", { seconds: lockSeconds })}
        </Text>
      ) : error ? (
        <Text accessibilityLiveRegion='polite' accent={NeonBoard.red}>
          {error}
        </Text>
      ) : null}
      {mode === "verify" && biometric && profile.biometric && (
        <Button
          disabled={pending || lockSeconds > 0}
          onPress={() =>
            void run(async () => {
              if (await unlockProfileBiometric(profile, () => alive.current)) {
                if (alive.current) await onSuccess();
              } else if (alive.current) {
                setError(t("profiles.biometric_failed"));
              }
            })
          }
        >
          {t("profiles.use_biometrics", { biometric })}
        </Button>
      )}
      {mode === "verify" && offersForgotPin(wrong) && (
        <Button
          variant='border'
          onPress={() => void openForgotPin().catch(() => {})}
        >
          {t("profiles.forgot_pin")}
        </Button>
      )}
      <Button variant='border' onPress={cancel}>
        {t("profiles.back")}
      </Button>
    </View>
  );
}
