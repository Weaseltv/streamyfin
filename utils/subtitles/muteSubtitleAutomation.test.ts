import { expect, test } from "bun:test";
import { applyMpvSubtitleSelection } from "../jellyfin/subtitleUtils";
import { MediaVolumeSession } from "./mediaVolumeSession";
import {
  MuteSubtitleAutomation,
  muteSubtitleCandidate,
} from "./muteSubtitleAutomation";

const state = { enabled: true, selected: -1, transcoding: false, candidate: 3 };
test("seed at zero does not automate; actual mute selects and owned unmute restores off", () => {
  const automation = new MuteSubtitleAutomation();
  expect(automation.volume(0, true, state)).toBeUndefined();
  expect(automation.volume(0.5, false, state)).toBeUndefined();
  const pick = automation.volume(0, false, state)!;
  expect(pick.index).toBe(3);

  expect(automation.volume(0.2, false, { ...state, selected: 3 })?.index).toBe(
    -1,
  );
});
test("manual same-track pick, settings disable and session reset revoke ownership", () => {
  for (const revoke of [
    (a: MuteSubtitleAutomation) => a.revoke(),
    (a: MuteSubtitleAutomation) => a.reset(),
    (a: MuteSubtitleAutomation) =>
      a.volume(0, false, { ...state, enabled: false }),
  ]) {
    const a = new MuteSubtitleAutomation();
    a.volume(0.5, true, state);
    const pick = a.volume(0, false, state)!;

    revoke(a);
    expect(a.isCurrent(pick)).toBe(false);
    expect(a.volume(0.5, false, { ...state, selected: 3 })).toBeUndefined();
  }
});
test("existing and local subtitles, transcodes and no eligible track are preserved", () => {
  for (const blocked of [
    { ...state, selected: 2 },
    { ...state, selected: -200 },
    { ...state, transcoding: true },
    { ...state, candidate: undefined },
  ]) {
    const a = new MuteSubtitleAutomation();
    a.volume(1, true, blocked);
    expect(a.volume(0, false, blocked)).toBeUndefined();
  }
  const streams = [
    {
      Type: "Subtitle" as const,
      Index: 1,
      IsForced: true,
      IsTextSubtitleStream: true,
    },
    { Type: "Subtitle" as const, Index: 2, IsTextSubtitleStream: false },
    {
      Type: "Subtitle" as const,
      Index: 3,
      Language: "eng",
      IsTextSubtitleStream: true,
      IsDefault: true,
    },
    {
      Type: "Subtitle" as const,
      Index: 4,
      Language: "fra",
      IsTextSubtitleStream: true,
    },
    { Type: "Subtitle" as const, Index: 5, DeliveryMethod: "Encode" as const },
  ];
  expect(muteSubtitleCandidate(streams, "FRA")?.Index).toBe(4);
  expect(muteSubtitleCandidate(streams, "spa")?.Index).toBe(3);
  expect(muteSubtitleCandidate(streams.slice(0, 2))).toBeUndefined();
});
test("unmute and manual override cancel an in-flight native subtitle lookup", async () => {
  const a = new MuteSubtitleAutomation();
  a.volume(1, true, state);
  const pick = a.volume(0, false, state)!;
  let finish!: (tracks: []) => void;
  const calls: number[] = [];
  const task = applyMpvSubtitleSelection(
    {
      getSubtitleTracks: () =>
        new Promise((r) => {
          finish = r;
        }),
      setSubtitleTrack: (id) => calls.push(id),
      disableSubtitles: () => calls.push(-1),
    },
    {
      subtitleStreams: [],
      jellyfinSubtitleIndex: 3,
      canCommit: () => a.isCurrent(pick),
    },
  );
  expect(a.volume(0.5, false, state)?.index).toBe(-1);
  finish([]);
  expect((await task).kind).toBe("superseded");
  expect(calls).toEqual([]);
});
test("one native subscription serves hidden/shown chrome; stale seed and close are ignored", async () => {
  const session = new MediaVolumeSession();
  let events!: (event: { volume: number; type?: string }) => void;
  let seed!: (event: { volume: number }) => void;
  let attached = 0,
    removed = 0;
  const received: [number, boolean][] = [];
  session.subscribe((v, initial) => received.push([v, initial]));
  const close = session.start({
    addVolumeListener: (listener) => {
      attached++;
      events = listener;
      return {
        remove: () => {
          removed++;
        },
      };
    },
    getVolume: () =>
      new Promise((r) => {
        seed = r;
      }),
  });
  const hideChrome = session.subscribe(() => {});
  events({ volume: 0.4, type: "music" });
  hideChrome();
  session.subscribe(() => {});
  events({ volume: 0.8, type: "ring" });
  events({ volume: 0 });
  seed({ volume: 1 });
  await Promise.resolve();
  expect(received).toEqual([
    [0.4, true],
    [0, false],
  ]);
  expect(attached).toBe(1);
  close();
  events({ volume: 1 });
  expect(removed).toBe(1);
  expect(received).toHaveLength(2);
});

test("automatic subtitles never become the remembered next-episode or replacement preference", () => {
  const a = new MuteSubtitleAutomation();
  a.volume(1, true, state);
  a.volume(0, false, state);

  expect(a.preference(3)).toBe(-1);
  a.revoke(); // Deliberately choosing even the same track changes its ownership.
  expect(a.preference(3)).toBe(3);
});
test("unmute supersedes a selection waiting for native setSubtitleTrack acknowledgement", async () => {
  const a = new MuteSubtitleAutomation();
  a.volume(1, true, state);
  const pick = a.volume(0, false, state)!;
  let acknowledge!: () => void;
  const calls: number[] = [];
  const player = {
    getSubtitleTracks: async () => [{ id: 8, lang: "eng" }],
    setSubtitleTrack: (index: number) => {
      calls.push(index);
      return new Promise<void>((resolve) => {
        acknowledge = resolve;
      });
    },
    disableSubtitles: () => {
      calls.push(-1);
    },
  };
  const pending = applyMpvSubtitleSelection(player, {
    subtitleStreams: [{ Type: "Subtitle", Index: 3, Language: "eng" }],
    jellyfinSubtitleIndex: 3,
    canCommit: () => a.isCurrent(pick),
  });
  await Promise.resolve();
  const off = a.volume(0.5, false, state)!;
  await applyMpvSubtitleSelection(player, {
    subtitleStreams: [],
    jellyfinSubtitleIndex: off.index,
    canCommit: () => a.isCurrent(off),
  });
  acknowledge();
  await pending;
  expect(calls).toEqual([8, -1]);
  expect(a.isCurrent(pick)).toBe(false);
});

test("disabling clears pending and visible automatic tracks while preserving deliberate selections", () => {
  for (const selected of [-1, 3]) {
    const a = new MuteSubtitleAutomation();
    a.volume(1, true, state);
    const pick = a.volume(0, false, state)!;
    const off = a.stopOwnedSelection(selected)!;
    expect(off.index).toBe(-1);
    expect(a.isCurrent(pick)).toBe(false);
    a.volume(0.2, false, { ...state, enabled: false, selected });
    expect(a.isCurrent(off)).toBe(true);
  }
  const manual = new MuteSubtitleAutomation();
  manual.volume(1, true, state);
  manual.volume(0, false, state);
  manual.revoke();
  expect(manual.stopOwnedSelection(3)).toBeUndefined();
});
