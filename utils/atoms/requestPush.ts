/**
 * Phone notification inputs (plan 5.10): the Expo push token this app minted, and whether the
 * phone allows notifications for the app. Written by the root layout's existing registration.
 */
import { atom } from "jotai";

export const expoPushTokenAtom = atom<string | null>(null);

/** null until checked. */
export const notificationPermissionAtom = atom<boolean | null>(null);
