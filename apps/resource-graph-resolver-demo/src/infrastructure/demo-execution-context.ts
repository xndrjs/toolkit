import {
  CONTENTFUL_DEFAULT_LOCALE,
  ContentfulLocaleCodeSchema,
  type ContentfulLocaleCode,
} from "./cms/generated/contentful.schemas.js";

/** Request-scoped input passed to `resolver.resolve` and forwarded to sources and policies. */
export type DemoExecutionContext = {
  locale: ContentfulLocaleCode;
};

export function createDefaultDemoExecutionContext(
  locale: ContentfulLocaleCode = CONTENTFUL_DEFAULT_LOCALE
): DemoExecutionContext {
  return { locale };
}

/** Parses a Next.js `[locale]` route segment into a supported Contentful locale. */
export function parseDemoLocaleParam(value: string): ContentfulLocaleCode | null {
  const parsed = ContentfulLocaleCodeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
