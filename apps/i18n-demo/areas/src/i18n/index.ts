import { createI18n } from "./generated/instance.generated";
import { defaultLazyNamespaces } from "./generated/namespace-loaders.generated";
import type { LazyNamespace, MyProjectDeliveryArea } from "./generated/i18n-types.generated";

export * from "./generated/instance.generated";
export * from "./generated/i18n-types.generated";
export * from "./generated/namespace-loaders.generated";
export * from "./generated/dictionary-schema.generated";

/** Creates a ready view for one delivery area. */
export async function createI18nForArea(
  area: MyProjectDeliveryArea,
  namespaces?: readonly LazyNamespace[]
) {
  return await createI18n({})
    .withNamespaces((namespaces ?? defaultLazyNamespaces) as readonly LazyNamespace[])
    .withDeliveryArea(area)
    .load();
}
