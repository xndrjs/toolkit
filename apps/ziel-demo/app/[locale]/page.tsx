import Link from "next/link";
import { notFound } from "next/navigation";

import {
  DEMO_ROUTE_LOCALES,
  parseDemoLocaleParam,
  resolvePage,
} from "../../src/orchestration/resolve-page";

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

  const result = await resolvePage({ locale });

  if (!result.ok) {
    return (
      <main>
        <header>
          <h1>Ziel demo</h1>
          <LocaleSwitcher active={localeParam} />
        </header>
        <p className="lead">
          Resolution failed ({result.meta.schedulingMode}
          {result.meta.resolvedCount !== undefined
            ? `, ${result.meta.resolvedCount} resources loaded`
            : ""}
          ).
        </p>
        <section className="panel">
          <pre>
            <code>{JSON.stringify(result.errors, null, 2)}</code>
          </pre>
        </section>
      </main>
    );
  }

  const { page, meta } = result;

  const islandsJson = Object.fromEntries(
    (meta.islands?.islandIds() ?? []).map((id) => [id, [...(meta.islands!.get(id) ?? [])].sort()])
  );

  return (
    <main>
      <header>
        <h1>Ziel demo</h1>
        <LocaleSwitcher active={localeParam} />
      </header>
      <p className="lead">
        Resolved {meta.resolvedCount} resources for <strong>{meta.locale}</strong> ({meta.pageId})
        with <strong>{meta.schedulingMode}</strong> scheduling — <code>projectPageDetail</code>{" "}
        aggregate below.{" "}
        <Link href="/error-handling/eh-soft-single">Error-handling showcase →</Link>
      </p>
      <section className="panel">
        <pre>
          <code>{JSON.stringify(page, null, 2)}</code>
        </pre>
      </section>
      <br />
      <p className="lead">Islands</p>
      <section className="panel">
        <pre>
          <code>{JSON.stringify(islandsJson, null, 2)}</code>
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
