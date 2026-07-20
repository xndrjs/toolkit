import { DemoPanel } from "../_components/demo-panel";
import { LocaleSwitcher } from "../_components/locale-switcher";
import { AREAS_DEFAULT_LOCALE, AREAS_LOCALES } from "../_lib/demo-locales";
import { resolveLocale } from "../_lib/resolve-locale";
import { areasFetchArtifact as areasFetchArtifactServer, createI18n } from "../../areas/i18n";
import { areasFetchArtifact } from "../../areas/i18n/fetch-artifact.client";
import { LOCALE_DELIVERY_AREA } from "../../areas/i18n/generated/i18n-types.generated";
import { I18nRoot } from "../../areas/i18n/generated/react-bindings.generated";
import { AreasClientDemo } from "./client-demo";

type AreasPageProps = {
  searchParams: Promise<{ locale?: string | string[] }>;
};

export default async function AreasPage({ searchParams }: AreasPageProps) {
  const params = await searchParams;
  const locale = resolveLocale(params.locale, AREAS_LOCALES, AREAS_DEFAULT_LOCALE);
  const area = LOCALE_DELIVERY_AREA[locale];

  const i18n = createI18n({ fetchImpl: areasFetchArtifactServer });
  const { t } = await i18n.load({
    namespaces: ["default", "billing"],
    locale,
  });
  const serializedState = i18n.serialize();

  return (
    <main>
      <h1>Areas — custom delivery (fetch + DI)</h1>
      <p className="lead">
        Locale selects the delivery area ({area}) via <code>partitionForLocale</code>. Artifacts
        live under Next <code>public/i18n/translations</code> and load through an injected{" "}
        <code>fetchImpl</code> (disk on RSC, HTTP on the client).
      </p>
      <LocaleSwitcher locales={AREAS_LOCALES} current={locale} />

      <div className="demo-grid">
        <DemoPanel kind="server" title="Server component">
          <p>{t("default", "welcome", { name: "Server" })}</p>
          <p>{t("billing", "invoice_summary", { count: 2 })}</p>
          <code>
            createI18n(&#123; fetchImpl: areasFetchArtifact &#125;).load(&#123; namespaces:
            [&quot;default&quot;, &quot;billing&quot;], locale: &quot;{locale}&quot; &#125;) → area
            &quot;{area}&quot;
          </code>
        </DemoPanel>

        <DemoPanel kind="client" title="Client component">
          <I18nRoot locale={locale} state={serializedState} fetchImpl={areasFetchArtifact}>
            <AreasClientDemo locale={locale} />
          </I18nRoot>
        </DemoPanel>
      </div>
    </main>
  );
}
