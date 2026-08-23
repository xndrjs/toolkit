import Link from "next/link";
import { notFound } from "next/navigation";

import { ClearCacheButton } from "../components/clear-cache-button";
import { CopyButton } from "../components/copy-button";
import { CONTENTFUL_LOCALE_CODES } from "../../src/infrastructure/cms/generated/contentful.schemas";
import { parseDemoLocaleParam } from "../../src/infrastructure/demo-execution-context";
import type { IslandCacheSnapshotEntry } from "../../src/infrastructure/cache/index";
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
            <ClearCacheButton />
            <CopyButton value={cacheReportJson} label="Copy report" />
            <CopyButton value={cacheSnapshotJson} label="Copy cache" />
          </div>
        </div>
        <div className="cache-layout">
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
                <dt>Dependency manifest</dt>
                <dd>
                  <StatusBadge status={cacheReport.dependencyManifest} />
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
              Cache entries ({cacheSnapshot.size}/{cacheSnapshot.maxSize})
            </h3>
            {cacheSnapshot.entries.length > 0 ? (
              <div className="cache-entry-list">
                {cacheSnapshot.entries.map((entry) => (
                  <CacheEntryCard key={`${entry.kind}:${entry.islandId}`} entry={entry} />
                ))}
              </div>
            ) : (
              <p className="cache-empty">Cache empty.</p>
            )}
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>Aggregated page</h2>
          <CopyButton value={pageJson} />
        </div>
        <pre>
          <code>{pageJson}</code>
        </pre>
      </section>
    </main>
  );
}

function CacheEntryCard({ entry }: { entry: IslandCacheSnapshotEntry }) {
  const payload = entry.kind === "island" ? entry.island : entry.manifest;
  const summary =
    entry.kind === "island"
      ? `${Object.keys(entry.island.resources).length} resources · ${entry.island.dependencies.length} deps`
      : `${entry.manifest.dependencies.length} deps`;

  return (
    <details className="cache-entry-card">
      <summary className="cache-entry-summary">
        <code className="cache-island-id">{entry.islandId}</code>
        <span className="cache-entry-badges">
          <span className={`cache-tier cache-tier-${entry.tier}`}>{entry.tier}</span>
          <span className={`cache-kind cache-kind-${entry.kind}`}>{entry.kind}</span>
        </span>
        <span className="cache-entry-meta">
          {summary} · {formatExpiresAt(entry.expiresAt)} · {entry.hitCount} hits
        </span>
      </summary>
      <pre className="cache-entry-payload">
        <code>{JSON.stringify(payload, null, 2)}</code>
      </pre>
    </details>
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
  if (seconds >= 3600) {
    const minutes = Math.ceil(seconds / 60);
    return `${minutes}m · ${new Date(expiresAt).toLocaleTimeString()}`;
  }
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
