import { afterEach, expect, test } from "bun:test";
import type { ConfigContext } from "expo/config";
import configure from "../app.config";

const savedGoogleServices = process.env.GOOGLE_SERVICES_JSON;
afterEach(() => {
  if (savedGoogleServices === undefined)
    delete process.env.GOOGLE_SERVICES_JSON;
  else process.env.GOOGLE_SERVICES_JSON = savedGoogleServices;
});

const context = (): ConfigContext =>
  ({
    config: {
      name: "WeaselPlex",
      slug: "weaselplex",
      plugins: [],
      android: {
        package: "tv.theweasel.weaselplex.phone",
        versionCode: 15,
      },
    },
  }) as ConfigContext;

test("an explicit Firebase file survives config merging without dropping Android identity", () => {
  process.env.GOOGLE_SERVICES_JSON =
    "/tmp/weaselplex-test-google-services.json";
  expect(configure(context()).android).toEqual({
    package: "tv.theweasel.weaselplex.phone",
    versionCode: 15,
    googleServicesFile: "/tmp/weaselplex-test-google-services.json",
  });
});

test("an unconfigured build preserves its existing Android settings", () => {
  delete process.env.GOOGLE_SERVICES_JSON;
  const input = context();
  input.config.android!.googleServicesFile = "./google-services.json";
  expect(configure(input).android).toEqual(input.config.android);
});
