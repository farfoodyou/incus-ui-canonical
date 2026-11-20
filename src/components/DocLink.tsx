import { DOC_BASE_PATH } from "context/DOC_BASE_PATH";
import { useEffect, useState, type FC, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import DsIcon from "components/DsIcon";
import { documentationAvailable } from "util/docs";

interface Props {
  docPath: string;
  children: ReactNode;
  hasExternalIcon?: boolean;
  className?: string;
  title?: string;
}

const DocLink: FC<Props> = ({
  docPath,
  children,
  hasExternalIcon = false,
  className,
  title,
}) => {
  const { t } = useTranslation();
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    void documentationAvailable().then(setAvailable);
  }, []);

  if (available === false) {
    // no docs on this server: keep the label, drop the dead link
    return (
      <span className={className} title={t("docs.unavailable")}>
        {children}
        {hasExternalIcon && (
          <DsIcon
            aria-hidden="true"
            className="external-link-icon"
            focusable="false"
            icon="external-link"
          />
        )}
      </span>
    );
  }

  return (
    <a
      className={className}
      href={`${DOC_BASE_PATH}${docPath}`}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
    >
      {children}
      {hasExternalIcon && (
        <DsIcon
          aria-hidden="true"
          className="external-link-icon"
          focusable="false"
          icon="external-link"
        />
      )}
    </a>
  );
};

export default DocLink;
