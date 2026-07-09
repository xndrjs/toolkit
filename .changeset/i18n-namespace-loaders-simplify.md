---
"@xndrjs/i18n": minor
---

Remove `ensureNamespacesLoaded` / `ensureNamespacesLoadedImpl`. Lazy namespaces are registered via generated `namespaceLoaders` and `setNamespace()` — no runtime validation on trusted codegen JSON imports. `dictionarySchemaOutput` is optional for lazy loading; use it only for external CMS/API hydration. Breaking: re-run codegen and replace `ensureNamespacesLoaded(i18n, …)` with `namespaceLoaders` + `setNamespace()` (optionally `projectNamespaceLocales` before register).
