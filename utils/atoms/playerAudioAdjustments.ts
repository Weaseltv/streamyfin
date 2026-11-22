import { atom } from "jotai";

/**
 * The Android phone player's audio and subtitle menu extras, mirroring the
 * iPhone player's session-scoped PlayerViewModel values (subtitleDelay,
 * audioDelay, volumeBoostPercent, dialogueBoostEnabled, monoAudioEnabled).
 * A new item starts neutral; a same-item reload (quality or transcoded track
 * switch) keeps them. See usePlayerAudioAdjustments.
 */
export interface PlayerAudioAdjustments {
  /** Seconds, mpv `audio-delay`. */
  audioDelay: number;
  /** Seconds, mpv `sub-delay`. */
  subtitleDelay: number;
  /** Percent, mpv `volume`; 100 = off. */
  volumeBoost: number;
  dialogueBoost: boolean;
  monoAudio: boolean;
}

export const NEUTRAL_PLAYER_AUDIO_ADJUSTMENTS: PlayerAudioAdjustments = {
  audioDelay: 0,
  subtitleDelay: 0,
  volumeBoost: 100,
  dialogueBoost: false,
  monoAudio: false,
};

export const playerAudioAdjustmentsAtom = atom<PlayerAudioAdjustments>(
  NEUTRAL_PLAYER_AUDIO_ADJUSTMENTS,
);
