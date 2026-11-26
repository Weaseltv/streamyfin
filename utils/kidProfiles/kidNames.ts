/**
 * The website's kid display-name rule (contract section 2), applied by the form so it can say what's
 * wrong before sending. The website's sanitized value stays authoritative. Port of the TV's
 * `kids/KidNames.kt`.
 */
export const KID_NAME_MAX_LENGTH = 20;

const DISALLOWED = /[^\p{L}\p{N}_ \-'.@+]/gu;
const WHITESPACE = /\s+/g;

export function sanitizeKidName(input: string): string {
  return input
    .normalize("NFC")
    .replace(DISALLOWED, "")
    .replace(WHITESPACE, " ")
    .trim();
}

/** The sanitized name when it is 1–20 characters, otherwise null. */
export function validKidNameOrNull(input: string): string | null {
  const name = sanitizeKidName(input);
  return name.length >= 1 && name.length <= KID_NAME_MAX_LENGTH ? name : null;
}
