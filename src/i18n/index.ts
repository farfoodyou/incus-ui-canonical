import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import zhHans from "./locales/zh-Hans.json";

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "zh-Hans", label: "简体中文" },
  { code: "fr", label: "Français" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

const STORAGE_KEY = "incus-ui-language";

const normalise = (raw?: string | null): LanguageCode => {
  if (!raw) {
    return "en";
  }
  const lower = raw.toLowerCase();
  if (lower.startsWith("zh")) {
    return "zh-Hans";
  }
  if (lower.startsWith("fr")) {
    return "fr";
  }
  return "en";
};

const initialLanguage = normalise(
  localStorage.getItem(STORAGE_KEY) ?? navigator.language,
);

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    "zh-Hans": { translation: zhHans },
    fr: { translation: fr },
  },
  lng: initialLanguage,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

document.documentElement.lang = initialLanguage;

export const setLanguage = (code: string) => {
  const next = normalise(code);
  localStorage.setItem(STORAGE_KEY, next);
  document.documentElement.lang = next;
  return i18n.changeLanguage(next);
};

export const currentLanguage = (): LanguageCode => normalise(i18n.language);

export default i18n;
