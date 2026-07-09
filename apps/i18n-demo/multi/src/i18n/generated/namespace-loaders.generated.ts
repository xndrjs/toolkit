// Automatically generated code. Do not edit manually.
import type { MyProjectSchema, LazyNamespace } from "./i18n-types.generated";

export const namespaceLoaders: {
  [K in LazyNamespace]: () => Promise<MyProjectSchema[K]>;
} = {
  user: () => import("../translations/user.json").then((m) => m.default),
  billing: () => import("./translations/billing.json").then((m) => m.default),
};
