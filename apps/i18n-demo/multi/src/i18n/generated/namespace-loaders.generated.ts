// Automatically generated code. Do not edit manually.
import type { MyProjectSchema, LazyNamespace, MyProjectLocale } from "./i18n-types.generated";

export const namespaceLoaders: {
  [K in LazyNamespace]: (locale: MyProjectLocale) => Promise<MyProjectSchema[K]>;
} = {
  user: (locale) => {
    switch (locale) {
      case "de-CH":
        return import("./translations/user.de-CH.json").then((m) => m.default);
      case "de-DE":
        return import("./translations/user.de-DE.json").then((m) => m.default);
      case "en":
        return import("./translations/user.en.json").then((m) => m.default);
      case "it":
        return import("./translations/user.it.json").then((m) => m.default);
    }
  },
  billing: (locale) => {
    switch (locale) {
      case "de-CH":
        return import("./translations/billing.de-CH.json").then((m) => m.default);
      case "de-DE":
        return import("./translations/billing.de-DE.json").then((m) => m.default);
      case "en":
        return import("./translations/billing.en.json").then((m) => m.default);
      case "it":
        return import("./translations/billing.it.json").then((m) => m.default);
    }
  },
};
