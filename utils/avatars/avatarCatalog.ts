/**
 * Profile pictures (contract 11.1): which set a profile picks from, and which avatar the picker
 * marks as current. Port of the pure parts of the TV's `services/ProfilePictureService.kt` and
 * `services/AccountAvatars.kt`. Pure, so it runs under `bun test`.
 */
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";
import { ADULT_AVATAR_IDS, KID_AVATAR_IDS } from "./avatarIds";

export type AvatarGroup = "kids" | "adults";

/** A kid profile (and one whose kind isn't known yet) picks from the kids set. */
export function avatarIdsFor(isKid: boolean): readonly string[] {
  return isKid ? KID_AVATAR_IDS : ADULT_AVATAR_IDS;
}

/** Section 1 kid signal: a kid's policy has a MaxParentalRating. */
export function isKidProfile(user: UserDto | null | undefined): boolean {
  return user?.Policy?.MaxParentalRating != null;
}

/**
 * The picker's set for `user`: kids from the kids set, grown-ups from the adults set, and a profile
 * whose policy isn't known yet from the kids set (as on the TV).
 */
export function avatarIdsForUser(
  user: UserDto | null | undefined,
): readonly string[] {
  return avatarIdsFor(!user?.Policy || isKidProfile(user));
}

/**
 * A fresh sign-in of `user` (not a profile switch) asks for a picture first: a grown-up (the
 * server policy says so) with no picture.
 */
export function needsFirstAvatar(user: UserDto | null | undefined): boolean {
  const policy = user?.Policy;
  if (!policy) return false;
  return (
    policy.MaxParentalRating == null &&
    !user?.PrimaryImageTag?.trim() &&
    ADULT_AVATAR_IDS.length > 0
  );
}

/** What this phone remembers about a picture it saved: the avatar and the tag the upload produced. */
export interface RememberedAvatar {
  avatarId: string;
  imageTag: string | null;
}

/**
 * The avatar to mark as current: the one this phone saved, while the profile's picture is still the
 * one that save produced. A picture changed elsewhere (website, another device) marks nothing.
 */
export function currentAvatarId(
  remembered: RememberedAvatar | null,
  user: UserDto | null | undefined,
  ids: readonly string[],
): string | null {
  if (!remembered || !ids.includes(remembered.avatarId)) return null;
  const tag = user?.PrimaryImageTag ?? null;
  if (!tag || remembered.imageTag !== tag) return null;
  return remembered.avatarId;
}
