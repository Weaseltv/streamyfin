import { describe, expect, test } from "bun:test";
import type { Api, Jellyfin } from "@jellyfin/sdk";
import { isEquivalentSessionApi } from "./apiIdentity";

const sdk = {
  clientInfo: { name: "WeaselPlex", version: "1.13" },
  deviceInfo: { id: "phone-a", name: "Moto" },
} as Jellyfin;
const session = {
  ...sdk,
  basePath: "https://server.example/jellyfin",
  accessToken: "session-a",
} as Api;

describe("equivalent session APIs", () => {
  test("equivalent SDK instances and trailing slashes reuse the current API", () => {
    expect(
      isEquivalentSessionApi(
        session,
        { ...sdk } as Jellyfin,
        "https://server.example/jellyfin/",
        "session-a",
      ),
    ).toBe(true);
  });
  test("different credentials, servers and base paths never share a session", () => {
    for (const [url, token] of [
      [session.basePath, "session-b"],
      [session.basePath, ""],
      ["https://other.example/jellyfin", "session-a"],
      ["https://server.example/other", "session-a"],
    ])
      expect(isEquivalentSessionApi(session, sdk, url, token)).toBe(false);
    expect(
      isEquivalentSessionApi(null, sdk, session.basePath, "session-a"),
    ).toBe(false);
  });
  test("a changed client or device identity creates a fresh API", () => {
    for (const next of [
      { ...sdk, clientInfo: { ...sdk.clientInfo, name: "Other" } },
      { ...sdk, clientInfo: { ...sdk.clientInfo, version: "1.14" } },
      { ...sdk, deviceInfo: { ...sdk.deviceInfo, id: "phone-b" } },
      { ...sdk, deviceInfo: { ...sdk.deviceInfo, name: "Renamed" } },
    ])
      expect(
        isEquivalentSessionApi(
          session,
          next as Jellyfin,
          session.basePath,
          "session-a",
        ),
      ).toBe(false);
  });
});
