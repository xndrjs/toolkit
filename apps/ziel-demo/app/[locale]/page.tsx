import Link from "next/link";
import { notFound } from "next/navigation";

import {
  MediaDescriptor,
  RichDocument,
  type PageDetail_Entry,
  type PageDetail_Entry_Hero,
} from "../../src/generated";
import type { MediaDescriptorWire } from "../../src/infrastructure/cms/schemas/media-descriptor";
import type { RichDocumentWire } from "../../src/infrastructure/cms/schemas/rich-document";
import {
  DEMO_ROUTE_LOCALES,
  parseDemoLocaleParam,
  resolvePage,
} from "../../src/orchestration/resolve-page";
import { MediaDescriptorDetails } from "../../src/presentation/MediaDescriptorDetails";
import { RichDocumentBody } from "../../src/presentation/RichDocumentBody";
import { jsonForDisplay } from "../../src/presentation/serialize-for-display";

/** Re-run resolve on every navigation (in-memory fixtures; no cache). */
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return DEMO_ROUTE_LOCALES.map((locale) => ({ locale }));
}

function isHero(entry: PageDetail_Entry | null | undefined): entry is PageDetail_Entry_Hero {
  return entry != null && entry.kind === "Hero" && "body" in entry;
}

/** Collect Hero strips (including nested Tab → strips) for opaque UI. */
function collectHeroes(entries: readonly (PageDetail_Entry | null)[]): PageDetail_Entry_Hero[] {
  const heroes: PageDetail_Entry_Hero[] = [];
  for (const entry of entries) {
    if (isHero(entry)) {
      heroes.push(entry);
      continue;
    }
    if (entry?.kind === "Tabs" && "tabs" in entry) {
      for (const tab of entry.tabs) {
        if (tab?.kind === "Tab" && "strips" in tab) {
          for (const strip of tab.strips) {
            if (isHero(strip)) heroes.push(strip);
          }
        }
      }
    }
  }
  return heroes;
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

  const heroOpaques = collectHeroes(pageDetail.strips).map((hero) => ({
    id: hero.id,
    title: hero.title,
    body: RichDocument.unwrap<RichDocumentWire>(hero.body),
    descriptor: hero.image
      ? MediaDescriptor.unwrap<MediaDescriptorWire>(hero.image.descriptor)
      : null,
  }));

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
      <h3 className="lead">
        Opaque unwrap (<code>RichDocument</code> + <code>MediaDescriptor</code>)
      </h3>
      <section className="panel">
        {heroOpaques.map((hero) => (
          <article key={hero.id} style={{ marginBottom: "1.25rem" }}>
            <h4 style={{ margin: "0 0 0.5rem" }}>
              {hero.title} <span style={{ color: "var(--muted)" }}>({hero.id})</span>
            </h4>
            <RichDocumentBody doc={hero.body} />
            {hero.descriptor ? <MediaDescriptorDetails descriptor={hero.descriptor} /> : null}
          </article>
        ))}
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
