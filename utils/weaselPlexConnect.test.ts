import { describe, expect, test } from "bun:test";
import {
  isWeaselPlexConnectReturn,
  WEASELPLEX_CONNECT_RETURN_URL,
  weaselPlexConnectDevice,
  weaselPlexConnectUrl,
} from "./weaselPlexConnect";

describe("weaselPlexConnectUrl", () => {
  test("opens the website approve page with the code, device and return link", () => {
    expect(weaselPlexConnectUrl("123456", "iphone")).toBe(
      "https://theweasel.tv/weaselplex/connect?code=123456&device=iphone&return=weaselfin%3A%2F%2Fconnected",
    );
  });

  test("encodes a code it did not expect instead of breaking the query", () => {
    expect(weaselPlexConnectUrl("12&34", "android")).toContain("code=12%2634&");
  });

  test("the return link is the one the website allow-lists", () => {
    expect(WEASELPLEX_CONNECT_RETURN_URL).toBe("weaselfin://connected");
  });
});

describe("weaselPlexConnectDevice", () => {
  test("names the phone the way the approve page expects", () => {
    expect(weaselPlexConnectDevice("android", false)).toBe("android");
    expect(weaselPlexConnectDevice("ios", false)).toBe("iphone");
    expect(weaselPlexConnectDevice("ios", true)).toBe("ipad");
    expect(weaselPlexConnectDevice("web", false)).toBe("phone");
  });
});

describe("isWeaselPlexConnectReturn", () => {
  test("recognises the return link in every form the router hands over", () => {
    expect(isWeaselPlexConnectReturn("weaselfin://connected")).toBe(true);
    expect(isWeaselPlexConnectReturn("weaselfin://connected?x=1")).toBe(true);
    expect(isWeaselPlexConnectReturn("/connected")).toBe(true);
    expect(isWeaselPlexConnectReturn("connected/")).toBe(true);
  });

  test("leaves every other link alone", () => {
    expect(isWeaselPlexConnectReturn("/login")).toBe(false);
    expect(isWeaselPlexConnectReturn("weaselfin://login?apiUrl=x")).toBe(false);
    expect(isWeaselPlexConnectReturn("https://theweasel.tv/connected")).toBe(
      false,
    );
    expect(isWeaselPlexConnectReturn("")).toBe(false);
  });
});
