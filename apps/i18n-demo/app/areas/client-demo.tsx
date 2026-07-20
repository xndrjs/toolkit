"use client";

import { I18n } from "../../areas/i18n/generated/react-bindings.generated";
import type { MyProjectLocale } from "../../areas/i18n/generated/i18n-types.generated";
import { LOCALE_DELIVERY_AREA } from "../../areas/i18n/generated/i18n-types.generated";

export function AreasClientDemo({ locale }: { locale: MyProjectLocale }) {
  return (
    <>
      <I18n
        namespaces={["default", "billing"]}
        fallback={<p className="loading">Loading delivery area…</p>}
      >
        {({ t }) => (
          <>
            <p>{t("default", "welcome", { name: "Client" })}</p>
            <p>{t("billing", "invoice_summary", { count: 2 })}</p>
          </>
        )}
      </I18n>
      <code>
        I18nRoot fetchImpl · locale &quot;{locale}&quot; · area &quot;
        {LOCALE_DELIVERY_AREA[locale]}&quot; · GET /i18n/translations/*
      </code>
    </>
  );
}
