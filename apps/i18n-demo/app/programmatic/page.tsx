import { DemoPanel } from "../_components/demo-panel";
import { LocaleSwitcher } from "../_components/locale-switcher";
import { PROGRAMMATIC_DEFAULT_LOCALE, PROGRAMMATIC_LOCALES } from "../_lib/demo-locales";
import { resolveLocale } from "../_lib/resolve-locale";
import { createI18n } from "../../programmatic/i18n";
import { ProgrammaticClientDemo } from "./client-demo";
import { I18nRoot } from "../../programmatic/i18n/generated/react-bindings.generated";

type ProgrammaticPageProps = {
  searchParams: Promise<{ locale?: string | string[] }>;
};

export default async function ProgrammaticPage({ searchParams }: ProgrammaticPageProps) {
  const params = await searchParams;
  const locale = resolveLocale(params.locale, PROGRAMMATIC_LOCALES, PROGRAMMATIC_DEFAULT_LOCALE);

  const i18n = createI18n();
  const { t } = await i18n.load({
    namespaces: ["default", "cms"],
    locale,
  });
  const serializedState = i18n.serialize();

  return (
    <main>
      <h1>Programmatic — config from TypeScript</h1>
      <p className="lead">
        <code>i18n.codegen.json</code> is written from TypeScript (<code>buildCodegenConfig</code>),
        then codegen produces split-by-locale loaders.
      </p>
      <LocaleSwitcher locales={PROGRAMMATIC_LOCALES} current={locale} />

      <div className="demo-grid">
        <DemoPanel kind="server" title="Server component">
          <p>{t("default", "welcome", { name: "Server" })}</p>
          <p>{t("cms", "footer_note")}</p>
          <code>locale &quot;{locale}&quot; · createI18n().load(…)</code>
        </DemoPanel>

        <DemoPanel kind="client" title="Client component">
          <I18nRoot locale={locale} state={serializedState}>
            <ProgrammaticClientDemo locale={locale} />
          </I18nRoot>
        </DemoPanel>
      </div>
    </main>
  );
}
