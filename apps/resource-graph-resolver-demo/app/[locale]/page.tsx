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
  const cacheReportJson = JSON.stringify(result.cacheReport, null, 2);
  const cacheSnapshotJson = JSON.stringify(result.cacheSnapshot, null, 2);
  const { cacheReport, cacheSnapshot } = result;

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
      <section className="panel cache-panel">
        <div className="panel-header">
          <h2>Island cache</h2>
          <div className="panel-actions">
            <CopyButton value={cacheReportJson} label="Copy report" />
            <CopyButton value={cacheSnapshotJson} label="Copy snapshot" />
          </div>
        </div>
        <div className="cache-grid">
          <div>
            <h3 className="cache-subtitle">Request report</h3>
            <dl className="cache-stats">
              <div>
                <dt>Page island</dt>
                <dd>
                  <StatusBadge status={cacheReport.pageIsland} />
                </dd>
              </div>
              <div>
                <dt>Backing resources</dt>
                <dd>{cacheReport.backingResourceCount}</dd>
              </div>
              <div>
                <dt>Promoted</dt>
                <dd>{cacheReport.promotedResourceCount ?? 0}</dd>
              </div>
            </dl>
            {cacheReport.islands.length > 0 ? (
              <ul className="cache-island-list">
                {cacheReport.islands.map(({ islandId, status }) => (
                  <li key={islandId}>
                    <code className="cache-island-id">{islandId}</code>
                    <StatusBadge status={status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cache-empty">No dependency islands looked up.</p>
            )}
          </div>
          <div>
            <h3 className="cache-subtitle">
              LRU snapshot ({cacheSnapshot.size}/{cacheSnapshot.maxSize})
            </h3>
            {cacheSnapshot.entries.length > 0 ? (
              <table className="cache-table">
                <thead>
                  <tr>
                    <th>Island</th>
                    <th>Expires</th>
                    <th>Hits</th>
                  </tr>
                </thead>
                <tbody>
                  {cacheSnapshot.entries.map((entry) => (
                    <tr key={entry.islandId}>
                      <td>
                        <code className="cache-island-id">{entry.islandId}</code>
                      </td>
                      <td>{formatExpiresAt(entry.expiresAt)}</td>
                      <td>{entry.hitCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="cache-empty">Cache empty.</p>
            )}
          </div>
        </div>
      </section>
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

function StatusBadge({ status }: { status: "hit" | "miss" | "incomplete" }) {
  return <span className={`cache-status cache-status-${status}`}>{status}</span>;
}

function formatExpiresAt(expiresAt: number): string {
  const remainingMs = expiresAt - Date.now();
  if (remainingMs <= 0) {
    return "expired";
  }
  const seconds = Math.ceil(remainingMs / 1000);
  return `${seconds}s · ${new Date(expiresAt).toLocaleTimeString()}`;
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
