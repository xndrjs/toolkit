import { createI18n } from "./generated/instance.generated";
import { ensureNamespacesLoadedForLocale } from "./generated/namespace-loaders.generated";
import type { LazyNamespace, MyProjectLocale } from "./generated/i18n-types.generated";

export * from "./generated/instance.generated";
export * from "./generated/i18n-types.generated";
export * from "./generated/namespace-loaders.generated";
export * from "./generated/dictionary-schema.generated";

/** App-owned singleton — start empty; load namespaces before rendering. */
export const i18n = createI18n({});

/** Fresh instance with the requested namespaces for one locale (e.g. per-request SSR). */
export async function createI18nForLocale(
  locale: MyProjectLocale,
  namespaces?: readonly LazyNamespace[]
) {
  const instance = createI18n({});
  await ensureNamespacesLoadedForLocale(instance, locale, namespaces);
  return instance;
}
