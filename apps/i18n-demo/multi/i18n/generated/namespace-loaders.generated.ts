// Automatically generated code. Do not edit manually.
import type { MyProjectSchema, LazyNamespace, MyProjectLocale } from "./i18n-types.generated";

export const namespaceLoaders: {
  [K in LazyNamespace]: (locale: MyProjectLocale) => Promise<MyProjectSchema[K]>;
} = {
  default: (locale) => {
    switch (locale) {
      case "de-CH":
        return import("./translations/default.de-CH.json").then((m) => m.default);
      case "de-DE":
        return import("./translations/default.de-DE.json").then((m) => m.default);
      case "en":
        return import("./translations/default.en.json").then((m) => m.default);
      case "it":
        return import("./translations/default.it.json").then((m) => m.default);
      default:
        throw new Error(
          `[i18n] No translation artifact for namespace "default" and locale "${String(locale)}".`
        );
    }
  },
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
      default:
        throw new Error(
          `[i18n] No translation artifact for namespace "user" and locale "${String(locale)}".`
        );
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
      default:
        throw new Error(
          `[i18n] No translation artifact for namespace "billing" and locale "${String(locale)}".`
        );
    }
  },
};

export const defaultLazyNamespaces = ["billing", "default", "user"] as const;
