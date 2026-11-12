type DownloadRecord = { itemId: string; activityMetadata?: { itemId: string } };
export function recordForDownloadEvent<T extends DownloadRecord>(
  records: T[],
  eventId: string | undefined,
) {
  if (!eventId) return undefined;
  return records.find(
    (record) => (record.activityMetadata?.itemId ?? record.itemId) === eventId,
  );
}
export function preparationEventIdentity(eventId: string | undefined) {
  const match = eventId?.match(/^([^:]+):(\d{13}-\d+)$/);
  return match ? { itemId: match[1], generation: match[2] } : undefined;
}
