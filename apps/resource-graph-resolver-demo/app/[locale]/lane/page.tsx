import { notFound } from "next/navigation";

import { DemoResolveView } from "../../components/demo-resolve-view";
import { CONTENTFUL_LOCALE_CODES } from "../../../src/infrastructure/cms/generated/contentful.schemas";
import { parseDemoLocaleParam } from "../../../src/infrastructure/demo-execution-context";
import { resolveLaneDemoPage } from "../../../src/orchestration/resolve-lane-demo-page";

/** Re-run resolve on every navigation so the shared LRU cache report stays live. */
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return CONTENTFUL_LOCALE_CODES.map((locale) => ({ locale }));
}

export default async function LaneDemoPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = parseDemoLocaleParam(localeParam);

  if (!locale) {
    notFound();
  }

  const result = await resolveLaneDemoPage(locale);
  return <DemoResolveView locale={locale} strategy="lane" result={result} />;
}
