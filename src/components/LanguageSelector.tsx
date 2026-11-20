import { type FC } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES, currentLanguage, setLanguage } from "i18n";

interface Props {
  className?: string;
  /** inline, small variant for low-key placements */
  compact?: boolean;
}

const LanguageSelector: FC<Props> = ({ className, compact = false }) => {
  const { t } = useTranslation();
  return (
    <select
      className={className}
      aria-label={t("language.label")}
      title={t("language.label")}
      value={currentLanguage()}
      onChange={(e) => {
        void setLanguage(e.target.value).then(() => {
          // some labels come from cached queries; a reload keeps things simple
          window.location.reload();
        });
      }}
      style={
        compact
          ? {
              width: "auto",
              padding: "2px 4px",
              background: "transparent",
              color: "inherit",
              border: "1px solid #ccc",
              borderRadius: "3px",
              fontSize: "13px",
            }
          : {
              width: "100%",
              padding: "4px 6px",
              background: "transparent",
              color: "inherit",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: "3px",
              fontSize: "13px",
            }
      }
    >
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code} style={{ color: "#111" }}>
          {l.label}
        </option>
      ))}
    </select>
  );
};

export default LanguageSelector;
