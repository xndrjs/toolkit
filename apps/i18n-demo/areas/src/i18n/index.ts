import { createI18n } from "./generated/instance.generated";
import { ensureNamespacesLoadedForArea } from "./generated/namespace-loaders.generated";
import type { LazyNamespace, MyProjectDeliveryArea } from "./generated/i18n-types.generated";

export * from "./generated/instance.generated";
export * from "./generated/i18n-types.generated";
export * from "./generated/namespace-loaders.generated";
export * from "./generated/dictionary-schema.generated";

/** Fresh instance with the requested namespaces for one delivery area. */
export async function createI18nForArea(
  area: MyProjectDeliveryArea,
  namespaces?: readonly LazyNamespace[]
) {
  const instance = createI18n({});
  await ensureNamespacesLoadedForArea(instance, area, namespaces);
  return instance;
}
