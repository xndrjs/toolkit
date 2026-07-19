// Automatically generated code. Do not edit manually.
import type { FetchArtifact } from "@xndrjs/i18n";
import type { MyProjectSchema, LazyNamespace, MyProjectDeliveryArea } from "./i18n-types.generated";

export type NamespaceLoaders = {
  [K in LazyNamespace]: (
    area: MyProjectDeliveryArea,
    context: { locale: string }
  ) => Promise<MyProjectSchema[K]>;
};

/** Build loaders that resolve artifacts via the injected {@link FetchArtifact} (resource id only). */
export function createNamespaceLoaders(fetchImpl: FetchArtifact): NamespaceLoaders {
  return {
    default: (area, { locale }) =>
      fetchImpl({ locale, namespace: "default", area }) as Promise<MyProjectSchema["default"]>,
    billing: (area, { locale }) =>
      fetchImpl({ locale, namespace: "billing", area }) as Promise<MyProjectSchema["billing"]>,
  };
}

export const defaultLazyNamespaces = ["billing", "default"] as const;
