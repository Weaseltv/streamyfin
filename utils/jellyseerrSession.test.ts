import { describe, expect, test } from "bun:test";
import { seerr403ClearsSession } from "./jellyseerrSession";

describe("seerr403ClearsSession", () => {
  test("clears the session on an auth-endpoint 403", () => {
    expect(seerr403ClearsSession("/api/v1/auth/me")).toBe(true);
    expect(
      seerr403ClearsSession("/api/v1/auth/jellyfin/quickconnect/authenticate"),
    ).toBe(true);
  });

  test("keeps the session on a content/permission 403", () => {
    expect(seerr403ClearsSession("/api/v1/discover/movies")).toBe(false);
    expect(seerr403ClearsSession("/api/v1/request")).toBe(false);
    expect(seerr403ClearsSession("/api/v1/settings/discover")).toBe(false);
  });

  test("keeps the session when the url is unknown", () => {
    expect(seerr403ClearsSession(undefined)).toBe(false);
    expect(seerr403ClearsSession("")).toBe(false);
  });
});
