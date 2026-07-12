// Automatically generated code. Do not edit manually.
import { IcuTranslationProviderMulti } from "@xndrjs/i18n";
import {
  LOCALE_FALLBACK,
  type MyProjectLocale,
  type MyProjectParams,
  type MyProjectSchema,
  type LazyNamespace,
  type MyProjectDeliveryArea,
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
    }
  },
  billing: (area) => {
    switch (area) {
      case "amer":
        return import("../../public/translations/billing.amer.json").then((m) => m.default);
      case "eu":
        return import("../../public/translations/billing.eu.json").then((m) => m.default);
    }
  },
};

type I18nMultiInstance = IcuTranslationProviderMulti<
  MyProjectSchema,
  MyProjectParams,
  MyProjectLocale,
  typeof LOCALE_FALLBACK
>;

export async function ensureNamespacesLoadedForArea(
  i18n: I18nMultiInstance,
  area: MyProjectDeliveryArea,
  namespaces: readonly LazyNamespace[] = ["billing", "default"] as const
): Promise<void> {
  await Promise.all(
    namespaces.map(async (namespace) => {
      if (i18n.hasNamespace(namespace)) {
        return;
      }
      i18n.setNamespace(namespace, await namespaceLoaders[namespace](area));
    })
  );
}
