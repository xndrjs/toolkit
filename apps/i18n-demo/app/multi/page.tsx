import { DemoPanel } from "../_components/demo-panel";
import { LocaleSwitcher } from "../_components/locale-switcher";
import { MULTI_DEFAULT_LOCALE, MULTI_LOCALES } from "../_lib/demo-locales";
import { resolveLocale } from "../_lib/resolve-locale";
import { MultiClientDemo } from "./client-demo";
import { I18nRoot } from "../../multi/i18n/generated/react-bindings.generated";

type MultiPageProps = {
  searchParams: Promise<{ locale?: string | string[] }>;
};

export default async function MultiPage({ searchParams }: MultiPageProps) {
  const params = await searchParams;
  const locale = resolveLocale(params.locale, MULTI_LOCALES, MULTI_DEFAULT_LOCALE);

  return (
    <main>
      <h1>Multi — split-by-locale (lazy)</h1>
      <p className="lead">
        Namespaces loaded on demand per locale via generated namespace loaders. Client{" "}
        <code>I18nRoot</code> has no hydrated <code>state</code> — cold pending → ready, including{" "}
        <code>withI18n</code> with hooks in its render fn.
      </p>
      <LocaleSwitcher locales={MULTI_LOCALES} current={locale} />

      <div className="demo-grid">
        <DemoPanel kind="server" title="Server component">
          <code>
            await createI18n().load(&#123; namespaces: [&quot;default&quot;, &quot;user&quot;,
            &quot;billing&quot;], locale: &quot;{locale}&quot; &#125;)
          </code>
        </DemoPanel>

        <DemoPanel kind="client" title="Client component">
          <I18nRoot locale={locale}>
            <MultiClientDemo locale={locale} />
          </I18nRoot>
        </DemoPanel>
      </div>
    </main>
  );
}
