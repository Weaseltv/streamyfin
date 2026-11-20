import { useAtomValue, useStore } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import { Platform } from "react-native";
import type { MpvPlayerViewRef } from "@/modules";
import {
  NEUTRAL_PLAYER_AUDIO_ADJUSTMENTS,
  type PlayerAudioAdjustments,
  playerAudioAdjustmentsAtom,
} from "@/utils/atoms/playerAudioAdjustments";
import { usePlayerContext } from "../contexts/PlayerContext";

const isAndroidPhone = Platform.OS === "android" && !Platform.isTV;

/**
 * Which player screen the atom's values belong to. `owner` is the player
 * screen's ref object: the controls unmount and remount on the same screen
 * (picture-in-picture), and that must neither reset nor re-key the values.
 */
let session: {
  owner: object | null;
  itemId: string | undefined;
  keepForReload: boolean;
} = { owner: null, itemId: undefined, keepForReload: false };

/**
 * Call right before replacing the player screen with the same item (quality
 * change, transcoded audio or subtitle switch): the next screen keeps the
 * offsets, boost and toggles, like the iPhone's same-item stream swap. Every
 * other new player screen starts neutral.
 */
export const keepAudioAdjustmentsForReload = () => {
  session.keepForReload = true;
};

const applyToPlayer = (
  player: MpvPlayerViewRef | null,
  values: PlayerAudioAdjustments,
) => {
  if (!player) return;
  const neutral = NEUTRAL_PLAYER_AUDIO_ADJUSTMENTS;
  // A new player starts with mpv's neutral values, so only changes go out.
  if (values.audioDelay !== neutral.audioDelay)
    void player.setAudioDelay?.(values.audioDelay);
  if (values.subtitleDelay !== neutral.subtitleDelay)
    void player.setSubtitleDelay?.(values.subtitleDelay);
  if (values.volumeBoost !== neutral.volumeBoost)
    void player.setVolumeBoost?.(values.volumeBoost);
  if (values.dialogueBoost) void player.setDialogueBoost?.(true);
  if (values.monoAudio) void player.setMonoAudio?.(true);
};

export interface PlayerAudioAdjustmentControls {
  values: PlayerAudioAdjustments;
  setAudioDelay: (seconds: number) => void;
  setSubtitleDelay: (seconds: number) => void;
  setVolumeBoost: (percent: number) => void;
  toggleDialogueBoost: () => void;
  toggleMonoAudio: () => void;
}

/**
 * The iPhone player's Audio sync, Volume boost, Dialogue boost, Mono audio
 * and Subtitle sync for the Android phone player (iOS PlayerViewModel
 * setAudioDelay … toggleMonoAudio). The values live in a Jotai atom so they
 * survive the controls remounting, and are re-applied when a reloaded
 * player finishes loading.
 */
export const usePlayerAudioAdjustments = (): PlayerAudioAdjustmentControls => {
  const { playerRef, item, isVideoLoaded } = usePlayerContext();
  const store = useStore();
  const values = useAtomValue(playerAudioAdjustmentsAtom);
  const itemId = item.Id ?? undefined;

  // Adopt the values for this screen, or start neutral.
  useEffect(() => {
    if (!isAndroidPhone) return;
    if (session.owner === playerRef && session.itemId === itemId) return;
    const keep =
      session.owner !== playerRef &&
      session.keepForReload &&
      session.itemId === itemId;
    session = { owner: playerRef, itemId, keepForReload: false };
    if (!keep)
      store.set(playerAudioAdjustmentsAtom, NEUTRAL_PLAYER_AUDIO_ADJUSTMENTS);
  }, [playerRef, itemId, store]);

  // Declared after the effect above so it reads the adopted values.
  useEffect(() => {
    if (!isAndroidPhone || !isVideoLoaded) return;
    applyToPlayer(playerRef.current, store.get(playerAudioAdjustmentsAtom));
  }, [isVideoLoaded, playerRef, store]);

  const update = useCallback(
    (patch: Partial<PlayerAudioAdjustments>) => {
      store.set(playerAudioAdjustmentsAtom, (prev) => ({ ...prev, ...patch }));
    },
    [store],
  );

  const setAudioDelay = useCallback(
    (seconds: number) => {
      update({ audioDelay: seconds });
      void playerRef.current?.setAudioDelay?.(seconds);
    },
    [update, playerRef],
  );

  const setSubtitleDelay = useCallback(
    (seconds: number) => {
      update({ subtitleDelay: seconds });
      void playerRef.current?.setSubtitleDelay?.(seconds);
    },
    [update, playerRef],
  );

  const setVolumeBoost = useCallback(
    (percent: number) => {
      update({ volumeBoost: percent });
      void playerRef.current?.setVolumeBoost?.(percent);
    },
    [update, playerRef],
  );

  const toggleDialogueBoost = useCallback(() => {
    const next = !store.get(playerAudioAdjustmentsAtom).dialogueBoost;
    update({ dialogueBoost: next });
    void playerRef.current?.setDialogueBoost?.(next);
  }, [store, update, playerRef]);

  const toggleMonoAudio = useCallback(() => {
    const next = !store.get(playerAudioAdjustmentsAtom).monoAudio;
    update({ monoAudio: next });
    void playerRef.current?.setMonoAudio?.(next);
  }, [store, update, playerRef]);

  return useMemo(
    () => ({
      values,
      setAudioDelay,
      setSubtitleDelay,
      setVolumeBoost,
      toggleDialogueBoost,
      toggleMonoAudio,
    }),
    [
      values,
      setAudioDelay,
      setSubtitleDelay,
      setVolumeBoost,
      toggleDialogueBoost,
      toggleMonoAudio,
    ],
  );
};
