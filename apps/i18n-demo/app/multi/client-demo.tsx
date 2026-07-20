"use client";

import { I18n, withI18n } from "../../multi/i18n/generated/react-bindings.generated";
import type { MyProjectLocale } from "../../multi/i18n/generated/i18n-types.generated";

const DefaultPanel = withI18n(
  {
    namespaces: ["default"],
    fallback: <p className="loading">Loading…</p>,
  },
  function DefaultPanel(_props, { t }) {
    return <p>{t("default", "welcome", { name: "Client" })}</p>;
  }
);

export function MultiClientDemo({ locale }: { locale: MyProjectLocale }) {
  return (
    <>
      <DefaultPanel />
      <I18n
        namespaces={["user", "billing"]}
        fallback={<p className="loading">Loading translations…</p>}
      >
        {({ t }) => (
          <>
            <p>{t("user", "greeting", { name: "Lena" })}</p>
            <p>{t("billing", "invoice_summary", { count: 3 })}</p>
          </>
        )}
      </I18n>
      <code>withI18n / I18n · hydrated state · locale &quot;{locale}&quot; · split-by-locale</code>
    </>
  );
}
