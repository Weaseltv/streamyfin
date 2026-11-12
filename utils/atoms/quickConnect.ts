import { atom } from "jotai";

/**
 * Set by the Quick Connect scan screen when the user picks "type the code
 * instead": the settings sheet behind it reopens on the six-digit entry and
 * clears the flag.
 */
export const quickConnectCodeEntryRequestAtom = atom(false);
