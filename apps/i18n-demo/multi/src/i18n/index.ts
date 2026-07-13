import { createI18n } from "./generated/instance.generated";
import { defaultLazyNamespaces } from "./generated/namespace-loaders.generated";
import type { LazyNamespace, MyProjectLocale } from "./generated/i18n-types.generated";

export * from "./generated/instance.generated";
export * from "./generated/i18n-types.generated";
export * from "./generated/namespace-loaders.generated";
export * from "./generated/dictionary-schema.generated";

/** Creates a ready view for one locale (e.g. per-request SSR). */
export async function createI18nForLocale(
  locale: MyProjectLocale,
  namespaces?: readonly LazyNamespace[]
) {
  return await createI18n({})
    .withNamespaces((namespaces ?? defaultLazyNamespaces) as readonly LazyNamespace[])
    .withLocale(locale)
    .load();
}
