"use client";

import { useState } from "react";
import { I18n, withI18n } from "../../multi/i18n/generated/react-bindings.generated";
import type { MyProjectLocale } from "../../multi/i18n/generated/i18n-types.generated";

/**
 * Hooks live inside the withI18n render fn. With no hydrated `state` on I18nRoot,
 * the gate starts pending then becomes ready — render must stay hook-safe across
 * that transition (see withI18n / load-gate).
 */
const DefaultPanel = withI18n(
  {
    namespaces: ["default"],
    fallback: <p className="loading">Loading…</p>,
  },
  function DefaultPanel(_props, { t }) {
    const [clicks, setClicks] = useState(0);
    return (
      <>
        <p>{t("default", "welcome", { name: "Client" })}</p>
        <p>
          <button type="button" onClick={() => setClicks((n) => n + 1)}>
            clicks: {clicks}
          </button>
        </p>
      </>
    );
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
      <code>
        withI18n (hooks in render) · no hydrated state · locale &quot;{locale}&quot; ·
        split-by-locale
      </code>
    </>
  );
}
