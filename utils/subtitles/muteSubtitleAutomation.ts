import type { MediaStream } from "@jellyfin/sdk/lib/generated-client/models";
import {
  isBurnedInSubtitle,
  isImageBasedSubtitle,
} from "@/utils/jellyfin/subtitleUtils";

export function muteSubtitleCandidate(
  streams: MediaStream[],
  preferred?: string,
) {
  const eligible = streams.filter(
    (stream) =>
      stream.Type === "Subtitle" &&
      stream.Index != null &&
      !stream.IsForced &&
      !isImageBasedSubtitle(stream) &&
      (stream.IsTextSubtitleStream === true ||
        /^(srt|subrip|ass|ssa|webvtt|vtt|mov_text|text)$/i.test(
          stream.Codec ?? "",
        )) &&
      !isBurnedInSubtitle(stream),
  );
  return (
    (preferred &&
      eligible.find(
        (s) => s.Language?.toLowerCase() === preferred.toLowerCase(),
      )) ||
    eligible.find((s) => s.IsDefault) ||
    eligible[0]
  );
}

export type MuteSelection = { index: number; version: number };
/** Ownership is revoked even when the user deliberately reselects the same track. */
export class MuteSubtitleAutomation {
  private muted: boolean | undefined;
  private version = 0;
  private owned: number | undefined;
  owns(index: number) {
    return this.owned === index;
  }
  preference(index: number) {
    return this.owns(index) ? -1 : index;
  }
  stopOwnedSelection(selected: number): MuteSelection | undefined {
    const restore =
      this.owned !== undefined && (selected === this.owned || selected === -1);
    this.revoke();
    if (restore) return { index: -1, version: this.version };
  }
  reset() {
    this.muted = undefined;
    this.revoke();
  }
  revoke() {
    this.version++;
    this.owned = undefined;
  }
  selectionChanged(index: number) {
    if (this.owned !== undefined && index !== this.owned && index !== -1)
      this.revoke();
  }
  isCurrent(selection: MuteSelection) {
    return selection.version === this.version;
  }
  failed(selection: MuteSelection) {
    if (this.isCurrent(selection)) this.revoke();
  }
  volume(
    volume: number,
    initial: boolean,
    state: {
      enabled: boolean;
      selected: number;
      transcoding: boolean;
      candidate?: number;
    },
  ): MuteSelection | undefined {
    const muted = volume === 0;
    const previous = this.muted;
    this.muted = muted;
    if (!state.enabled) {
      if (this.owned !== undefined) this.revoke();
      return;
    }
    if (initial || previous === undefined || previous === muted) return;
    if (muted) {
      if (
        state.selected !== -1 ||
        state.transcoding ||
        state.candidate === undefined
      )
        return;
      this.owned = state.candidate;
      return { index: state.candidate, version: ++this.version };
    }
    return this.stopOwnedSelection(state.selected);
  }
}
