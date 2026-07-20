import { DemoPanel } from "../_components/demo-panel";
import { LocaleSwitcher } from "../_components/locale-switcher";
import { MULTI_DEFAULT_LOCALE, MULTI_LOCALES } from "../_lib/demo-locales";
import { resolveLocale } from "../_lib/resolve-locale";
import { createI18n } from "../../multi/i18n";
import { MultiClientDemo } from "./client-demo";
import { I18nRoot } from "../../multi/i18n/generated/react-bindings.generated";

type MultiPageProps = {
  searchParams: Promise<{ locale?: string | string[] }>;
};

export default async function MultiPage({ searchParams }: MultiPageProps) {
  const params = await searchParams;
  const locale = resolveLocale(params.locale, MULTI_LOCALES, MULTI_DEFAULT_LOCALE);

  const i18n = createI18n();
  const { t } = await i18n.load({
    namespaces: ["default", "user", "billing"],
    locale,
  });
  const serializedState = i18n.serialize();

  return (
    <main>
      <h1>Multi — split-by-locale (lazy)</h1>
      <p className="lead">
        Namespaces loaded on demand per locale via generated namespace loaders. Client hydrates from{" "}
        <code>serialize()</code>.
      </p>
      <LocaleSwitcher locales={MULTI_LOCALES} current={locale} />

      <div className="demo-grid">
        <DemoPanel kind="server" title="Server component">
          <p>{t("default", "welcome", { name: "Server" })}</p>
          <p>{t("user", "greeting", { name: "Ada" })}</p>
          <p>{t("billing", "invoice_summary", { count: 1 })}</p>
          <code>
            await createI18n().load(&#123; namespaces: [&quot;default&quot;, &quot;user&quot;,
            &quot;billing&quot;], locale: &quot;{locale}&quot; &#125;)
          </code>
        </DemoPanel>

        <DemoPanel kind="client" title="Client component">
          <I18nRoot locale={locale} state={serializedState}>
            <MultiClientDemo locale={locale} />
          </I18nRoot>
        </DemoPanel>
      </div>
    </main>
  );
}
