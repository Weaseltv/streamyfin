type OwnedRequest = { ownerKey: string | null };

export function admitItemAction<T extends OwnedRequest>(
  current: T | null,
  next: T,
  ownerKey: string | null,
) {
  return current?.ownerKey === ownerKey ? current : next;
}

export function canExecuteItemAction<T extends OwnedRequest>(
  request: T,
  current: T | null,
  ownerKey: string | null,
  executed: T | null,
) {
  return (
    request === current && request.ownerKey === ownerKey && executed !== request
  );
}

export function clearItemAction<T>(current: T | null, closing: T) {
  return current === closing ? null : current;
}
