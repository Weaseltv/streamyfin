import { useFocusEffect } from "expo-router";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
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
  const source = useMemo(
    () => (accent == null ? pageAccentAtom : atom(accent)),
    [accent],
  );
  return useAtomValue(source);
};

/**
 * Claims the page accent whenever the calling screen has focus. Screens under
 * it in the stack stay mounted, so they claim it back when they regain focus.
 */
export const useSetPageAccent = (accent: string | undefined, active = true) => {
  const set = useSetAtom(pageAccentAtom);
  useFocusEffect(
    useCallback(() => {
      if (active && accent) set(accent);
    }, [accent, active, set]),
  );
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
