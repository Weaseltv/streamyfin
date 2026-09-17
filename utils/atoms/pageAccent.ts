import { atom, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { NeonBoard } from "@/constants/Colors";

/**
 * The accent of the page on screen. The tab bar's overline and the header's
 * loading line follow it: volt by default, orange inside a movie library or
 * on a movie, yellow on a series, cyan in the guide.
 */
export const pageAccentAtom = atom<string>(NeonBoard.volt);

export const usePageAccent = () => useAtomValue(pageAccentAtom);

/** Sets the page accent while the calling screen is mounted (and focused, when `active`). */
export const useSetPageAccent = (accent: string | undefined, active = true) => {
  const set = useSetAtom(pageAccentAtom);
  useEffect(() => {
    if (!active || !accent) return;
    set(accent);
    return () => set(NeonBoard.volt);
  }, [accent, active, set]);
};
