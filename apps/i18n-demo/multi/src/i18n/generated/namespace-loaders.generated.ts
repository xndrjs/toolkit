// Automatically generated code. Do not edit manually.
import { ensureNamespacesLoadedImpl } from "@xndrjs/i18n";
import { validateExternalNamespace } from "./dictionary-schema.generated";
import type { MyProjectSchema, LazyNamespace } from "./i18n-types.generated";
import type { createI18n } from "./instance.generated";

export const namespaceLoaders: Record<
  LazyNamespace,
  () => Promise<MyProjectSchema[LazyNamespace]>
> = {
  user: () => import("../translations/user.json").then((m) => m.default),
  billing: () => import("./translations/billing.json").then((m) => m.default),
};

export async function ensureNamespacesLoaded(
  i18n: ReturnType<typeof createI18n>,
  namespaces: LazyNamespace[]
): Promise<void> {
  return ensureNamespacesLoadedImpl<MyProjectSchema, LazyNamespace>(
    {
      provider: i18n,
      resolveLoader: (namespace) => namespaceLoaders[namespace],
      validate: (namespace, raw) => validateExternalNamespace(namespace, raw),
    },
    namespaces
  );
}
