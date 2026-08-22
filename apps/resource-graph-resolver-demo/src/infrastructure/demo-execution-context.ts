import {
  CONTENTFUL_DEFAULT_LOCALE,
  type ContentfulLocaleCode,
} from "./cms/generated/contentful.schemas.js";

/** Request-scoped input passed to `ResolveContentGraphEngine.execute`. */
export type DemoExecutionContext = {
  locale: ContentfulLocaleCode;
};

export function createDefaultDemoExecutionContext(
  locale: ContentfulLocaleCode = CONTENTFUL_DEFAULT_LOCALE
): DemoExecutionContext {
  return { locale };
}
