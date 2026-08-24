import { notFound } from "next/navigation";

import { DemoResolveView } from "../../components/demo-resolve-view";
import { CONTENTFUL_LOCALE_CODES } from "../../../src/infrastructure/cms/generated/contentful.schemas";
import { parseDemoLocaleParam } from "../../../src/infrastructure/demo-execution-context";
import { resolveDecoupledDemoPage } from "../../../src/orchestration/resolve-decoupled-demo-page";

/** Re-run resolve on every navigation so the shared LRU cache report stays live. */
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return CONTENTFUL_LOCALE_CODES.map((locale) => ({ locale }));
}

export default async function DecoupledDemoPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = parseDemoLocaleParam(localeParam);

  if (!locale) {
    notFound();
  }

  const result = await resolveDecoupledDemoPage(locale);
  return <DemoResolveView locale={locale} strategy="decoupled" result={result} />;
}
