// Automatically generated code. Do not edit manually.
import type { MyProjectSchema, LazyNamespace, MyProjectDeliveryArea } from "./i18n-types.generated";

export const namespaceLoaders: {
  [K in LazyNamespace]: (area: MyProjectDeliveryArea) => Promise<MyProjectSchema[K]>;
} = {
  billing: (area) => {
    switch (area) {
      case "amer":
        return import("../../public/translations/billing.amer.json").then((m) => m.default);
      case "eu":
        return import("../../public/translations/billing.eu.json").then((m) => m.default);
    }
  },
};
