import Link from "next/link";
import { notFound } from "next/navigation";

import { CopyButton } from "../components/copy-button";
import { CONTENTFUL_LOCALE_CODES } from "../../src/infrastructure/cms/generated/contentful.schemas";
import { parseDemoLocaleParam } from "../../src/infrastructure/demo-execution-context";
import { resolveDemoPage } from "../../src/infrastructure/resolve-demo-page";

type Props = {
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return CONTENTFUL_LOCALE_CODES.map((locale) => ({ locale }));
}

export default async function LocaleDemoPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = parseDemoLocaleParam(localeParam);

  if (!locale) {
    notFound();
  }

  const result = await resolveDemoPage(locale);

  if (!result.ok) {
    return (
      <main>
        <header className="page-header">
          <h1>Resource graph resolver demo</h1>
          <LocaleSwitcher activeLocale={locale} />
        </header>
        <p className="lead error">Resolution failed.</p>
        <pre>
          <code>{JSON.stringify(result.errors, null, 2)}</code>
        </pre>
      </main>
    );
  }

  const pageJson = JSON.stringify(result.page, null, 2);
  const islandsJson = JSON.stringify(result.serializedIslands, null, 2);

  return (
    <main>
      <header className="page-header">
        <h1>Resource graph resolver demo</h1>
        <LocaleSwitcher activeLocale={locale} />
      </header>
      <p className="lead">
        Resolved {result.resolvedCount} resources for <strong>{locale}</strong>. Batch rounds are
        logged in the dev server terminal.
      </p>
      <div className="split">
        <section className="panel">
          <div className="panel-header">
            <h2>Aggregated page</h2>
            <CopyButton value={pageJson} />
          </div>
          <pre>
            <code>{pageJson}</code>
          </pre>
        </section>
        <section className="panel">
          <div className="panel-header">
            <h2>Serialized islands</h2>
            <CopyButton value={islandsJson} />
          </div>
          <pre>
            <code>{islandsJson}</code>
          </pre>
        </section>
      </div>
    </main>
  );
}

function LocaleSwitcher({ activeLocale }: { activeLocale: string }) {
  return (
    <nav className="locale-switcher" aria-label="Locale">
      {CONTENTFUL_LOCALE_CODES.map((locale) => (
        <Link
          key={locale}
          href={`/${locale}`}
          className={locale === activeLocale ? "locale-link active" : "locale-link"}
          aria-current={locale === activeLocale ? "page" : undefined}
        >
          {locale}
        </Link>
      ))}
    </nav>
  );
}
