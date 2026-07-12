// Automatically generated code. Do not edit manually.
import { IcuTranslationProviderMulti } from "@xndrjs/i18n";
import {
  LOCALE_FALLBACK,
  type MyProjectLocale,
  type MyProjectParams,
  type MyProjectSchema,
  type LazyNamespace,
} from "./i18n-types.generated";

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

type I18nMultiInstance = IcuTranslationProviderMulti<
  MyProjectSchema,
  MyProjectParams,
  MyProjectLocale,
  typeof LOCALE_FALLBACK
>;

export async function ensureNamespacesLoadedForLocale(
  i18n: I18nMultiInstance,
  locale: MyProjectLocale,
  namespaces: readonly LazyNamespace[] = ["billing", "default", "user"] as const
): Promise<void> {
  await Promise.all(
    namespaces.map(async (namespace) => {
      if (i18n.hasNamespace(namespace)) {
        return;
      }
      i18n.setNamespace(namespace, await namespaceLoaders[namespace](locale));
    })
  );
}
