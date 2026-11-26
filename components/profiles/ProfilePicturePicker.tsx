import type { Api } from "@jellyfin/sdk";
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";
import { toast } from "sonner-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import {
  avatarIdsForUser,
  currentAvatarId,
} from "@/utils/avatars/avatarCatalog";
import {
  rememberedAvatar,
  removeProfilePicture,
  saveProfilePicture,
} from "@/utils/avatars/profilePicture";
import { AvatarGrid } from "./AvatarGrid";
import { ProfileFlowScaffold } from "./ProfileFlowScaffold";

export interface ProfilePicturePickerProps {
  /** `user`'s own session: the picture is saved with that profile's own token. */
  api: Api;
  user: UserDto;
  /** The picture was saved or removed; `user` is the profile as the server has it now. */
  onSaved: (user: UserDto) => void;
  /**
   * Closed without a change. With `firstSignIn`, "Continue without a picture" after a failed save.
   */
  onClose: () => void;
  /**
   * A grown-up's first sign-in without a picture (contract 11.1): "Welcome, <name>", no Remove and
   * no close button; a failed save offers "Try again" and "Continue without a picture".
   */
  firstSignIn?: boolean;
}

type Status = "idle" | "saving" | "failed";

/**
 * One profile's picture (port of the TV's `ProfilePictureScreens.kt` and `ProfilePictureViewModel`):
 * the profile's avatar set (kids or grown-ups), the current one marked, and "Remove picture". A save
 * or remove reports the updated profile through `onSaved`.
 */
export function ProfilePicturePicker({
  api,
  user,
  onSaved,
  onClose,
  firstSignIn = false,
}: ProfilePicturePickerProps) {
  const { t } = useTranslation();
  const ids = avatarIdsForUser(user);
  const userId = user.Id ?? "";
  const [current, setCurrent] = useState<string | null>(() =>
    currentAvatarId(rememberedAvatar(userId), user, ids),
  );
  const [status, setStatus] = useState<Status>("idle");
  const [lastPick, setLastPick] = useState<string | null>(null);
  const [hasPicture, setHasPicture] = useState(!!user.PrimaryImageTag);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = async (
    action: () => Promise<UserDto>,
    avatarId: string | null,
  ) => {
    if (status === "saving" || !userId) return;
    setStatus("saving");
    try {
      const updated = await action();
      if (!mounted.current) return;
      setCurrent(avatarId);
      setHasPicture(!!updated.PrimaryImageTag || avatarId !== null);
      setStatus("idle");
      toast.success(t("profiles.picture.saved"));
      onSaved(updated);
    } catch (error) {
      console.warn("Profile picture save failed", error);
      if (mounted.current) setStatus("failed");
    }
  };

  const pick = (avatarId: string) => {
    setLastPick(avatarId);
    void run(() => saveProfilePicture(api, userId, avatarId), avatarId);
  };

  const remove = () => {
    void run(() => removeProfilePicture(api, userId), null);
  };

  const name = user.Name?.trim() ?? "";
  const saving = status === "saving";
  const canRemove = !firstSignIn && (hasPicture || current !== null);

  if (firstSignIn && status === "failed") {
    return (
      <ProfileFlowScaffold
        title={
          name
            ? t("profiles.picture.first_avatar_title", { name })
            : t("profiles.picture.pick_a_picture")
        }
        subtitle={t("profiles.picture.first_avatar_failed")}
      >
        <View style={{ gap: 12 }}>
          <Button
            onPress={() => {
              if (lastPick) pick(lastPick);
              else setStatus("idle");
            }}
          >
            {t("profiles.picture.try_again")}
          </Button>
          <Button variant='border' onPress={onClose}>
            {t("profiles.picture.continue_without_picture")}
          </Button>
        </View>
      </ProfileFlowScaffold>
    );
  }

  return (
    <ProfileFlowScaffold
      title={
        firstSignIn
          ? name
            ? t("profiles.picture.first_avatar_title", { name })
            : t("profiles.picture.pick_a_picture")
          : t("profiles.picture.change_picture")
      }
      subtitle={
        firstSignIn
          ? t("profiles.picture.first_avatar_subtitle")
          : name
            ? t("profiles.picture.pick_a_picture_for", { name })
            : undefined
      }
      leading={firstSignIn ? undefined : "close"}
      onLeading={onClose}
      footer={
        saving || status === "failed" || canRemove ? (
          <>
            {saving ? (
              <ActivityIndicator color={NeonBoard.text} />
            ) : status === "failed" ? (
              <Text style={{ color: NeonBoard.red, textAlign: "center" }}>
                {t("profiles.picture.save_failed")}
              </Text>
            ) : null}
            {canRemove ? (
              <Button
                variant='border'
                color='red'
                disabled={saving}
                onPress={remove}
              >
                {t("profiles.picture.remove_picture")}
              </Button>
            ) : null}
          </>
        ) : undefined
      }
    >
      <AvatarGrid
        ids={ids}
        selected={saving ? (lastPick ?? current) : current}
        disabled={saving}
        onPick={pick}
      />
    </ProfileFlowScaffold>
  );
}
