// Automatically generated code. Do not edit manually.
import type {
  ProgrammaticDemoSchema,
  LazyNamespace,
  ProgrammaticDemoLocale,
} from "./i18n-types.generated";

export const namespaceLoaders: {
  [K in LazyNamespace]: (locale: ProgrammaticDemoLocale) => Promise<ProgrammaticDemoSchema[K]>;
} = {
  default: (locale) => {
    switch (locale) {
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
  cms: (locale) => {
    switch (locale) {
      case "en":
        return import("./translations/cms.en.json").then((m) => m.default);
      case "it":
        return import("./translations/cms.it.json").then((m) => m.default);
      default:
        throw new Error(
          `[i18n] No translation artifact for namespace "cms" and locale "${String(locale)}".`
        );
    }
  },
};

export const defaultLazyNamespaces = ["cms", "default"] as const;
