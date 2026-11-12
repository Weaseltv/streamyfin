import { atom } from "jotai";

export const startupReadySessionAtom = atom<string | null>(null);
export const startupSessionKey = (
  basePath: string | undefined,
  userId: string | undefined,
) =>
  basePath && userId
    ? JSON.stringify([basePath.replace(/\/+$/, ""), userId])
    : null;
