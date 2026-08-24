import { redirect } from "next/navigation";

import { parseDemoLocaleParam } from "../../src/infrastructure/demo-execution-context";
import { CONTENTFUL_LOCALE_CODES } from "../../src/infrastructure/cms/generated/contentful.schemas";

type Props = {
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return CONTENTFUL_LOCALE_CODES.map((locale) => ({ locale }));
}

/** Default locale entry → barrier strategy page. */
export default async function LocaleIndexPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = parseDemoLocaleParam(localeParam);
  redirect(`/${locale ?? localeParam}/barrier`);
}
