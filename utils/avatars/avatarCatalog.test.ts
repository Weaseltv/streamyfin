import { describe, expect, test } from "bun:test";
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  avatarIdsFor,
  avatarIdsForUser,
  currentAvatarId,
  needsFirstAvatar,
} from "./avatarCatalog";
import { ADULT_AVATAR_IDS, KID_AVATAR_IDS } from "./avatarIds";

const adult = (tag?: string): UserDto => ({
  Id: "a",
  Policy: { MaxParentalRating: null } as UserDto["Policy"],
  PrimaryImageTag: tag,
});
const kid: UserDto = {
  Id: "k",
  Policy: { MaxParentalRating: 10 } as UserDto["Policy"],
};

// Port of the TV's ProfilePictureTest and the first-avatar rule (contract 11.1).
describe("profile pictures", () => {
  test("the TV's 108 avatars: 48 for kids and 60 for grown-ups, ids unique", () => {
    expect(KID_AVATAR_IDS).toHaveLength(48);
    expect(ADULT_AVATAR_IDS).toHaveLength(60);
    expect(new Set([...KID_AVATAR_IDS, ...ADULT_AVATAR_IDS]).size).toBe(108);
    for (const id of [...KID_AVATAR_IDS, ...ADULT_AVATAR_IDS])
      expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  test("an adult picks from the adults set, a kid from the kids set", () => {
    expect(avatarIdsForUser(adult())).toBe(ADULT_AVATAR_IDS);
    expect(avatarIdsForUser(kid)).toBe(KID_AVATAR_IDS);
    // Kind not known yet: the kids set.
    expect(avatarIdsForUser({ Id: "x" })).toBe(KID_AVATAR_IDS);
    expect(avatarIdsFor(true)).toBe(KID_AVATAR_IDS);
  });

  test("the current picture is marked only while it is the one this phone saved", () => {
    const ids = ADULT_AVATAR_IDS;
    const saved = { avatarId: "wolf-crimson", imageTag: "t1" };
    expect(currentAvatarId(saved, adult("t1"), ids)).toBe("wolf-crimson");
    // Changed on the website or another device.
    expect(currentAvatarId(saved, adult("t2"), ids)).toBeNull();
    expect(currentAvatarId(saved, adult(), ids)).toBeNull();
    expect(currentAvatarId(null, adult("t1"), ids)).toBeNull();
    // A picture picked from a removed or other set is simply not marked.
    expect(
      currentAvatarId(
        { avatarId: "placeholder-1", imageTag: "t1" },
        adult("t1"),
        ids,
      ),
    ).toBeNull();
  });

  test("a grown-up without a picture chooses one first; kids and pictures don't", () => {
    expect(needsFirstAvatar(adult())).toBe(true);
    expect(needsFirstAvatar(adult("tag"))).toBe(false);
    expect(needsFirstAvatar(kid)).toBe(false);
    expect(needsFirstAvatar({ Id: "x" })).toBe(false);
    expect(needsFirstAvatar(null)).toBe(false);
  });
});
