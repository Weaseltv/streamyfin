import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./translations/en.json";
import { bundledLocaleBackend, initialLocale } from "./utils/bundledLocales";
import { storage } from "./utils/mmkv";

const _APP_LANGUAGES = [
  { label: "Catalan", value: "ca" },
  { label: "Čeština", value: "cs" },
  { label: "العربية", value: "ar" },
  { label: "Dansk", value: "da" },
  { label: "Deutsch", value: "de" },
  { label: "Ελληνικά", value: "el" },
  { label: "English", value: "en" },
  { label: "Español", value: "es" },
  { label: "Esperanto", value: "eo" },
  { label: "Français", value: "fr" },
  { label: "עברית", value: "he" },
  { label: "Italiano", value: "it" },
  { label: "日本語", value: "ja" },
  { label: "한국어", value: "ko" },
  { label: "Klingon", value: "tlh" },
  { label: "Türkçe", value: "tr" },
  { label: "ไทย", value: "th" },
  { label: "Magyar", value: "hu" },
  { label: "Nederlands", value: "nl" },
  { label: "Polski", value: "pl" },
  { label: "Português (Portugal)", value: "pt" },
  { label: "Português (Brasil)", value: "pt-BR" },
  { label: "Română", value: "ro" },
  { label: "Svenska", value: "sv" },
  { label: "Norsk Bokmål", value: "nb" },
  { label: "Norsk Nynorsk", value: "nn" },
  { label: "Suomi", value: "fi" },
  { label: "Shqip", value: "sq" },
  { label: "Русский", value: "ru" },
  { label: "Українська", value: "uk" },
  { label: "简体中文", value: "zh-CN" },
  { label: "繁體中文", value: "zh-TW" },
  { label: "Tiếng Việt", value: "vi" },
].sort((a, b) => a.label.localeCompare(b.label));

export const APP_LANGUAGES = _APP_LANGUAGES;

i18n
  .use(bundledLocaleBackend)
  .use(initReactI18next)
  .init({
    compatibilityJSON: "v4",
    resources: { en: { translation: en } },
    partialBundledLanguages: true,
    initAsync: false,
    lng: initialLocale(
      storage.getString("settings"),
      getLocales()[0].languageCode,
    ),
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
