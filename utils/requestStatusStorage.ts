import { eventBus } from "@/utils/eventBus";
import { storage } from "@/utils/mmkv";
import {
  claimPresentation,
  decodeRequestJournal,
  type OwnRequest,
  type RequestJournal,
} from "@/utils/requestStatus";

const key = (scope: string) => `request-status-v1:${scope}`;
export function readRequestJournal(scope: string): RequestJournal {
  try {
    return decodeRequestJournal(
      JSON.parse(storage.getString(key(scope)) ?? "null"),
    );
  } catch {
    return decodeRequestJournal(null);
  }
}
export function updateRequestJournal(
  scope: string,
  change: (j: RequestJournal) => RequestJournal,
): void {
  const before = JSON.stringify(readRequestJournal(scope));
  const after = JSON.stringify(change(JSON.parse(before)));
  if (before !== after) storage.set(key(scope), after);
}
export function seedOwnRequest(scope: string, request: OwnRequest): void {
  updateRequestJournal(scope, (j) => ({
    ...j,
    seeded: [...new Set([...j.seeded, request.id])],
    known: [...new Set([...j.known, request.id])],
    awaitingBaseline: j.awaitingBaseline.filter((id) => id !== request.id),
  }));
  eventBus.emit("requestStatusSubmitted", { scope, request });
}
export function forgetOwnRequest(scope: string, id: number): void {
  updateRequestJournal(scope, (j) => ({
    ...j,
    known: j.known.filter((n) => n !== id),
    seeded: j.seeded.filter((n) => n !== id),
    awaitingBaseline: j.awaitingBaseline.filter((n) => n !== id),
    pending: j.pending.filter((k) => Number(k.split("|")[1]) !== id),
    presented: j.presented.filter((k) => Number(k.split("|")[1]) !== id),
  }));
}
export function claimRequestPresentation(
  scope: string,
  eventKey: string,
): boolean {
  let claimed = false;
  updateRequestJournal(scope, (j) => {
    const result = claimPresentation(j, eventKey);
    claimed = result.claimed;
    return result.journal;
  });
  return claimed;
}
export const requestNotificationsEnabled = (scope: string) =>
  storage.getBoolean(`${key(scope)}:disabled`) !== true;
export function setRequestNotificationsEnabled(
  scope: string,
  enabled: boolean,
): void {
  storage.set(`${key(scope)}:disabled`, !enabled);
  if (!enabled)
    updateRequestJournal(scope, (j) => ({
      ...j,
      presented: [...new Set([...j.presented, ...j.pending])],
      pending: [],
    }));
}
