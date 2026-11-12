import type { Api } from "@jellyfin/sdk";
import { getQuickConnectApi } from "@jellyfin/sdk/lib/utils/api";

export const QUICK_CONNECT_CODE_LENGTH = 6;

const CODE_RE = /^\d{6}$/;

/**
 * Pulls a Quick Connect code out of whatever a TV put in its QR code: the
 * bare six digits, JSON with a `code` field, or a URL with a `code` query
 * param. Anything else returns null.
 */
export function extractQuickConnectCode(data: string): string | null {
  const trimmed = data.trim();
  if (!trimmed) return null;
  if (CODE_RE.test(trimmed)) return trimmed;

  try {
    const parsed = JSON.parse(trimmed);
    const code =
      parsed && typeof parsed.code === "string" ? parsed.code.trim() : "";
    if (CODE_RE.test(code)) return code;
  } catch {
    // Not JSON, keep going.
  }

  const param = trimmed.match(/[?&#](?:code|quickConnectCode)=(\d{6})(?!\d)/i);
  if (param) return param[1];

  return null;
}

/**
 * Authorizes a Quick Connect code against the signed-in account. Resolves
 * true on success, false when the server rejects the code or is unreachable.
 */
export async function authorizeQuickConnectCode(
  api: Api,
  userId: string | undefined,
  code: string,
): Promise<boolean> {
  try {
    const res = await getQuickConnectApi(api).authorizeQuickConnect({
      code,
      userId,
    });
    return res.status === 200 && res.data !== false;
  } catch {
    return false;
  }
}
