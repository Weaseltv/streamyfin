import type { BackendModule } from "i18next";

const loaders: Record<string, () => object> = {
  ca: () => require("../translations/ca-ES.json"),
  ar: () => require("../translations/ar-SA.json"),
  cs: () => require("../translations/cs-CZ.json"),
  da: () => require("../translations/da-DK.json"),
  de: () => require("../translations/de-DE.json"),
  el: () => require("../translations/el-GR.json"),
  en: () => require("../translations/en.json"),
  es: () => require("../translations/es-ES.json"),
  eo: () => require("../translations/eo.json"),
  fr: () => require("../translations/fr-FR.json"),
  he: () => require("../translations/he-IL.json"),
  hu: () => require("../translations/hu-HU.json"),
  it: () => require("../translations/it-IT.json"),
  ja: () => require("../translations/ja-JP.json"),
  ko: () => require("../translations/ko-KR.json"),
  nl: () => require("../translations/nl-NL.json"),
  pl: () => require("../translations/pl-PL.json"),
  pt: () => require("../translations/pt-PT.json"),
  "pt-BR": () => require("../translations/pt-BR.json"),
  ro: () => require("../translations/ro-RO.json"),
  sv: () => require("../translations/sv-SE.json"),
  nb: () => require("../translations/no-NO.json"),
  no: () => require("../translations/no-NO.json"),
  nn: () => require("../translations/nn.json"),
  fi: () => require("../translations/fi-FI.json"),
  sq: () => require("../translations/sq.json"),
  ru: () => require("../translations/ru-RU.json"),
  th: () => require("../translations/th-TH.json"),
  tr: () => require("../translations/tr-TR.json"),
  tlh: () => require("../translations/tlh-AA.json"),
  uk: () => require("../translations/uk-UA.json"),
  vi: () => require("../translations/vi-VN.json"),
  zh: () => require("../translations/zh-CN.json"),
  "zh-CN": () => require("../translations/zh-CN.json"),
  "zh-TW": () => require("../translations/zh-TW.json"),
};
export function initialLocale(
  rawSettings: string | undefined,
  deviceLanguage: string | null | undefined,
): string {
  let selected: unknown;
  try {
    selected = rawSettings
      ? JSON.parse(rawSettings).preferedLanguage
      : undefined;
  } catch {}
  const language =
    typeof selected === "string" && selected
      ? selected
      : (deviceLanguage ?? "en");
  return loaders[language]
    ? language
    : loaders[language.split("-")[0]]
      ? language.split("-")[0]
      : "en";
}
export const bundledLocaleBackend: BackendModule = {
  type: "backend",
  init() {},
  read(language, _namespace, callback) {
    try {
      callback(
        null,
        (loaders[language] ?? loaders[language.split("-")[0]] ?? loaders.en)(),
      );
    } catch (error) {
      callback(error as Error, false);
    }
  },
};
