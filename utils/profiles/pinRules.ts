export const PIN_LENGTH = 4;

export function isNewPin(pin: string): boolean {
  return /^[UDLR]{4}$/.test(pin);
}

export function offersForgotPin(wrongEntries: number): boolean {
  return wrongEntries > 3;
}

export interface PinBackoff {
  failures: number;
  lockouts: number;
  until: number;
}

export const emptyBackoff: PinBackoff = { failures: 0, lockouts: 0, until: 0 };

export function wrongPin(previous: PinBackoff, now: number): PinBackoff {
  const failures = previous.failures + 1;
  if (failures < 5) return { ...previous, failures };
  const lockouts = previous.lockouts + 1;
  const duration = Math.min(
    30_000 * 2 ** Math.min(lockouts - 1, 20),
    3_600_000,
  );
  return { failures: 0, lockouts, until: now + duration };
}
