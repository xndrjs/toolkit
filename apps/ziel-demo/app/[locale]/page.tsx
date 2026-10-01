import Link from "next/link";
import { notFound } from "next/navigation";

import {
  DEMO_ROUTE_LOCALES,
  parseDemoLocaleParam,
  resolvePage,
} from "../../src/orchestration/resolve-page";
import { jsonForDisplay } from "../../src/presentation/serialize-for-display";

/** Re-run resolve on every navigation (in-memory fixtures; no cache). */
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return DEMO_ROUTE_LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleDemoPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = parseDemoLocaleParam(localeParam);

  if (!locale) {
    notFound();
  }

  const { pageDetail, contentMap, errors, islands, context } = await resolvePage({ locale });

  const islandsJson = Object.fromEntries(
    (islands?.islandIds() ?? []).map((id) => [id, [...(islands!.get(id) ?? [])].sort()])
  );

  return (
    <main>
      <header>
        <h1>Page detail demo</h1>
        <LocaleSwitcher active={localeParam} />
      </header>
      <p className="lead">
        Resolved {contentMap.size} resources for <strong>{context.locale}</strong> ({context.pageId}
        ) with <strong>{context.schedulingMode}</strong> scheduling — <code>projectPageDetail</code>{" "}
        aggregate below
        {errors.length > 0 ? ` · ${errors.length} soft error(s)` : ""}.
      </p>
      {errors.length > 0 ? (
        <section className="panel">
          <h2>Soft errors</h2>
          <pre>
            <code>{jsonForDisplay(errors)}</code>
          </pre>
        </section>
      ) : null}
      <section className="panel">
        <pre>
          <code>{jsonForDisplay(pageDetail)}</code>
        </pre>
      </section>
      <h3 className="lead">Islands</h3>
      <section className="panel">
        <pre>
          <code>{jsonForDisplay(islandsJson)}</code>
        </pre>
      </section>
    </main>
  );
}

function LocaleSwitcher({ active }: { active: string }) {
  return (
    <nav aria-label="Locale" style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
      {DEMO_ROUTE_LOCALES.map((locale) => (
        <Link
          key={locale}
          href={`/${locale}`}
          style={{
            color: locale === active ? "var(--text)" : "var(--muted)",
            textDecoration: locale === active ? "underline" : "none",
          }}
        >
          {locale}
        </Link>
      ))}
    </nav>
  );
}
