/**
 * Saving a profile picture (contract 11.1): the chosen bundled avatar, converted to PNG, becomes the
 * profile's Jellyfin user image, uploaded with that profile's own token. Port of the TV's
 * `services/ProfilePictureService.kt` and `services/AccountAvatars.kt`.
 */
import type { Api } from "@jellyfin/sdk";
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getImageApi, getUserApi } from "@jellyfin/sdk/lib/utils/api";
import { Asset } from "expo-asset";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { storage } from "@/utils/mmkv";
import type { RememberedAvatar } from "./avatarCatalog";
import { ADULT_AVATAR_IDS } from "./avatarIds";
import { AVATAR_SOURCES } from "./avatarSources";

const REMEMBERED_PREFIX = "profilePicture.avatar.";
const ASSIGNED_PREFIX = "profilePicture.assigned.";

/** The bundled avatar as base64 PNG: PNG reads everywhere; the bundled WebP keeps the app small. */
export async function avatarPngBase64(avatarId: string): Promise<string> {
  const source = AVATAR_SOURCES[avatarId];
  if (source == null) throw new Error(`Unknown avatar ${avatarId}`);
  const asset = Asset.fromModule(source as number);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  const rendered = await ImageManipulator.manipulate(uri).renderAsync();
  const result = await rendered.saveAsync({
    format: SaveFormat.PNG,
    base64: true,
  });
  if (!result.base64) throw new Error(`Could not read avatar ${avatarId}`);
  return result.base64;
}

/** What this phone remembers about `userId`'s last picture saved here (only to mark it current). */
export function rememberedAvatar(userId: string): RememberedAvatar | null {
  try {
    const raw = storage.getString(REMEMBERED_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.avatarId === "string"
      ? { avatarId: parsed.avatarId, imageTag: parsed.imageTag ?? null }
      : null;
  } catch {
    return null;
  }
}

function remember(userId: string, value: RememberedAvatar | null) {
  try {
    if (value) storage.set(REMEMBERED_PREFIX + userId, JSON.stringify(value));
    else storage.remove(REMEMBERED_PREFIX + userId);
  } catch {
    // Only the picker's "current" mark depends on it.
  }
}

/** The profile as the server has it now, with `api`'s own token. */
async function currentUser(api: Api, userId: string): Promise<UserDto> {
  const { data } = await getUserApi(api).getCurrentUser();
  if (data.Id && data.Id.replace(/-/g, "") !== userId.replace(/-/g, ""))
    throw new Error("The session isn't this profile's");
  return data;
}

/**
 * Uploads `avatarId` as `userId`'s picture with `api` (that profile's own session) and returns the
 * profile as the server has it afterwards (its new picture tag included).
 */
export async function saveProfilePicture(
  api: Api,
  userId: string,
  avatarId: string,
): Promise<UserDto> {
  const png = await avatarPngBase64(avatarId);
  // Jellyfin reads the user image body as base64 text, as jellyfin-web sends it.
  await getImageApi(api).postUserImage(
    { userId, body: png as unknown as File },
    { headers: { "Content-Type": "image/png" } },
  );
  remember(userId, { avatarId, imageTag: null });
  const user = await currentUser(api, userId);
  remember(userId, { avatarId, imageTag: user.PrimaryImageTag ?? null });
  return user;
}

/** Removes `userId`'s picture with `api` (that profile's own session); returns the profile after. */
export async function removeProfilePicture(
  api: Api,
  userId: string,
): Promise<UserDto> {
  await getImageApi(api).deleteUserImage({ userId });
  remember(userId, null);
  return currentUser(api, userId);
}

/**
 * Gives a grown-up saved on this phone without a picture a random adult avatar, once per user per
 * phone (contract 11.1). The check counts as done once the server has answered, even if the upload
 * then fails, so it never retries forever; a server that can't be reached is asked again next time.
 * An existing picture is never replaced. Returns the updated profile when a picture was saved.
 */
export async function assignMissingAvatar(
  api: Api,
  userId: string,
): Promise<UserDto | null> {
  const key = `${ASSIGNED_PREFIX}${api.basePath}/${userId}`;
  if (storage.getBoolean(key)) return null;
  let user: UserDto;
  try {
    user = await currentUser(api, userId);
  } catch {
    return null;
  }
  // Only grown-ups, and only without a picture.
  if (!user.Policy || user.Policy.MaxParentalRating != null) {
    storage.set(key, true);
    return null;
  }
  if (user.PrimaryImageTag?.trim()) {
    storage.set(key, true);
    return null;
  }
  storage.set(key, true);
  const avatarId =
    ADULT_AVATAR_IDS[Math.floor(Math.random() * ADULT_AVATAR_IDS.length)];
  try {
    return await saveProfilePicture(api, userId, avatarId);
  } catch {
    console.warn("Couldn't give the profile a picture");
    return null;
  }
}
