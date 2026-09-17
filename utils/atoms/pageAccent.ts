import { useIsFocused } from "expo-router";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { NeonBoard } from "@/constants/Colors";

/**
 * The accent of the page on screen. The tab bar's active tab, the header's
 * loading line and any primitive that is not handed an accent follow it:
 * each tab's own neon on its root, the library's colour inside a library,
 * the type colour on an item.
 */
export const pageAccentAtom = atom<string>(NeonBoard.volt);

export const usePageAccent = () => useAtomValue(pageAccentAtom);

/** An explicit accent, or the accent of the page on screen. */
export const useAccent = (accent?: string | null) => {
  const pageAccent = usePageAccent();
  return accent ?? pageAccent;
};

/**
 * Claims the page accent whenever the calling screen has focus. Screens under
 * it in the stack stay mounted, so they claim it back when they regain focus.
 */
export const useSetPageAccent = (accent: string | undefined, active = true) => {
  const set = useSetAtom(pageAccentAtom);
  const focused = useIsFocused();
  useEffect(() => {
    if (!active || !accent || !focused) return;
    set(accent);
  }, [accent, active, focused, set]);
};

/** The accent of the item playing in the OSD (the item's type colour). */
export const playerAccentAtom = atom<string>(NeonBoard.volt);
export const usePlayerAccent = () => useAtomValue(playerAccentAtom);
export const useSetPlayerAccent = (accent: string | undefined) => {
  const set = useSetAtom(playerAccentAtom);
  useEffect(() => {
    if (accent) set(accent);
  }, [accent, set]);
};
