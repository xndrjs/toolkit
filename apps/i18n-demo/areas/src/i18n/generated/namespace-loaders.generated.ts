// Automatically generated code. Do not edit manually.
import type {
  MyProjectLocale,
  MyProjectParams,
  MyProjectSchema,
  LazyNamespace,
  MyProjectDeliveryArea,
} from "./i18n-types.generated";

export const namespaceLoaders: {
  [K in LazyNamespace]: (area: MyProjectDeliveryArea) => Promise<MyProjectSchema[K]>;
} = {
  default: (area) => {
    switch (area) {
      case "amer":
        return import("../../public/translations/default.amer.json").then((m) => m.default);
      case "eu":
        return import("../../public/translations/default.eu.json").then((m) => m.default);
      default:
        throw new Error(
          `[i18n] No translation artifact for namespace "default" and area "${String(area)}".`
        );
    }
  },
  billing: (area) => {
    switch (area) {
      case "amer":
        return import("../../public/translations/billing.amer.json").then((m) => m.default);
      case "eu":
        return import("../../public/translations/billing.eu.json").then((m) => m.default);
      default:
        throw new Error(
          `[i18n] No translation artifact for namespace "billing" and area "${String(area)}".`
        );
    }
  },
};

export const defaultLazyNamespaces = ["billing", "default"] as const;
