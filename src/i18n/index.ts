import i18n from "i18next";
import { initReactI18next } from "react-i18next";

/**
 * Locales are discovered from src/i18n/locales/*.json, so adding a language is a matter
 * of dropping one file in — no code change needed. Each file carries a `_meta` block:
 *
 *   { "_meta": { "label": "Deutsch", "dir": "ltr" }, "nav": { ... } }
 *
 * `label` is what the language switcher shows, `dir` (optional) is applied to <html>.
 */
interface LocaleMeta {
  label?: string;
  dir?: "ltr" | "rtl";
}

type LocaleFile = LocaleMeta & { _meta?: LocaleMeta } & Record<string, unknown>;

const modules = import.meta.glob("./locales/*.json", { eager: true }) as Record<
  string,
  { default: LocaleFile }
>;

export interface Language {
  code: string;
  label: string;
  dir: "ltr" | "rtl";
}

const resources: Record<string, { translation: Record<string, unknown> }> = {};
const languages: Language[] = [];

for (const [path, mod] of Object.entries(modules)) {
  const code = path.replace("./locales/", "").replace(/\.json$/, "");
  const data = mod.default ?? {};
  const meta = data._meta ?? {};
  const { _meta, ...translation } = data as Record<string, unknown>;
  resources[code] = { translation: translation as Record<string, unknown> };
  languages.push({ code, label: meta.label ?? code, dir: meta.dir ?? "ltr" });
}

// English first (it is the source/fallback language), then alphabetical by label.
languages.sort((a, b) => {
  if (a.code === "en") return -1;
  if (b.code === "b") return 1;
  return a.label.localeCompare(b.label);
});

export const LANGUAGES: Language[] = languages;
export const FALLBACK_LANGUAGE = "en";

const STORAGE_KEY = "incus-ui-language";

const normalise = (raw?: string | null): string => {
  if (!raw) {
    return FALLBACK_LANGUAGE;
  }
  const wanted = raw.toLowerCase().replace("_", "-");
  const exact = LANGUAGES.find((l) => l.code.toLowerCase() === wanted);
  if (exact) {
    return exact.code;
  }
  // "zh-CN" -> "zh-Hans", "fr-CA" -> "fr", "en-GB" -> "en"
  const sameLanguage = LANGUAGES.find(
    (l) => l.code.toLowerCase().split("-")[0] === wanted.split("-")[0],
  );
  return sameLanguage?.code ?? FALLBACK_LANGUAGE;
};

const initialLanguage = normalise(
  localStorage.getItem(STORAGE_KEY) ?? navigator.language,
);

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: FALLBACK_LANGUAGE,
  supportedLngs: LANGUAGES.map((l) => l.code),
  interpolation: { escapeValue: false },
});

const applyDocumentLanguage = (code: string) => {
  const language = LANGUAGES.find((l) => l.code === code);
  document.documentElement.lang = code;
  document.documentElement.dir = language?.dir ?? "ltr";
};

applyDocumentLanguage(initialLanguage);

export const setLanguage = (code: string) => {
  const next = normalise(code);
  localStorage.setItem(STORAGE_KEY, next);
  applyDocumentLanguage(next);
  return i18n.changeLanguage(next);
};

export const currentLanguage = (): string => normalise(i18n.language);

export default i18n;
