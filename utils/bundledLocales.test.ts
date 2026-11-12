import { expect, test } from "bun:test";
import { createInstance } from "i18next";
import en from "../translations/en.json";
import { bundledLocaleBackend, initialLocale } from "./bundledLocales";

test("initial locale honors saved choice, region aliases and corrupted storage", () => {
  expect(initialLocale('{"preferedLanguage":"pt-BR"}', "en")).toBe("pt-BR");
  expect(initialLocale(undefined, "fr-FR")).toBe("fr");
  expect(initialLocale("broken", "zh-TW")).toBe("zh-TW");
  expect(initialLocale('{"preferedLanguage":123}', "missing")).toBe("en");
});
test("only requested locales and English fallback are registered, with offline switching", async () => {
  const instance = createInstance();
  await instance.use(bundledLocaleBackend).init({
    resources: { en: { translation: en } },
    partialBundledLanguages: true,
    initAsync: false,
    lng: "fr",
    fallbackLng: "en",
  });
  expect(Object.keys(instance.store.data).sort()).toEqual(["en", "fr"]);
  expect(instance.t("tabs.home")).not.toBe("tabs.home");
  await instance.changeLanguage("zh-TW");
  expect(instance.t("tabs.home")).not.toBe("tabs.home");
  await instance.changeLanguage("nb");
  expect(instance.t("tabs.home")).not.toBe("tabs.home");
  await instance.changeLanguage("en");
  expect(instance.t("tabs.home")).toBe(en.tabs.home);
  expect(instance.hasResourceBundle("de", "translation")).toBe(false);
});
