---
"@xndrjs/i18n": minor
---

### Breaking Changes (0.7.0)

- **View → Scope rename:** public types are now `I18nScopeSingle`, `I18nScopeMulti`, `I18nScope*ForLocale` (was `I18nView*`). Engine projection is `toScope()` (was `toView()`).
- **`IcuTranslationProviderMulti`:** removed `hasNamespace()` and the internal `loadedNamespaces` set. Namespace availability follows `dictionary` keys; missing namespaces degrade through `onMissing` instead of a dedicated "namespace not loaded" error.
- **Removed public merge/replace APIs:** `setAll`, `setNamespace`, `mergeAll`, and `mergeNamespace` are no longer on the engine or providers. Deep merge is internal to builder `load()`; key-level runtime patches use `scope.set()` on locale-bound scopes.
- **Removed builder hydration:** `withNamespaceData` and `withDictionaryData` are gone. External/CMS payloads: `load()` first (preload gate), then validate and call `scope.set(...)` per key.
- **Removed generated preload helpers:** `ensureNamespacesLoadedForLocale` and `ensureNamespacesLoadedForArea` are no longer emitted — use the fluent builder (`withNamespaces` → `withLocale` / `withDeliveryArea` → `load()`).
- **`scope.set()` on locale-bound scopes:** single-key patches with ICU re-validation and a preload gate (`[i18n] Key not preloaded`, ICU syntax/args errors on patch).
- **Builder load deduplication:** repeated `load()` for the same `(namespace, partition)` on a shared engine is skipped; prior `scope.set()` patches are preserved.
- **Delivery-area locale narrowing:** `withDeliveryArea(area)` narrows `ActiveLocales` from codegen `DELIVERY_ARTIFACTS`; unbound scopes expose `forLocale` only for those locales at compile time.
- **Destructuring-safe scopes:** `t`, `set`, and `forLocale` are arrow-bound — `const { t } = scope` and `const { t, set } = await builder.load()` work without losing `this`.
- **Builder typestate (multi):** `createI18n({})` returns `I18nBuilderMultiInitial` with only `withNamespaces`; `withLocale`, `withDeliveryArea`, and `load()` require a non-empty `withNamespaces([...])` first (`I18nBuilderMultiReady`).
- **Partial external validation:** codegen emits `validateExternalDictionaryPartial`, `validateExternalNamespacePartial`, and `validateExternalKey` (when `dictionarySchemaOutput` is configured) for CMS/webhook deltas.
- **Codegen output:** re-run `xndrjs-i18n-codegen` — generated `createI18n` return types, validation helpers, and `instance.generated.ts` imports are updated (minimal package imports per config).

### Migration (0.6.x → 0.7.0)

| Before (0.6.x)                      | After (0.7.0)                                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `engine.mergeNamespace(ns, data)`   | `await builder.withNamespaces([ns]).withLocale(locale).load()` then `scope.set(ns, key, template)` per key                 |
| `engine.mergeAll(data)`             | successive `load()` for **different** partitions on the same shared engine; same partition is skipped after the first load |
| `engine.setNamespace` / `setAll`    | removed — use `load()` + `scope.set()`                                                                                     |
| `builder.withNamespaceData(...)`    | removed — validate external payload, `load()`, then `scope.set()`                                                          |
| `view.t(...)` / `toView()`          | `scope.t(...)` / `toScope()`                                                                                               |
| `ensureNamespacesLoaded*` + merge   | builder `load()`                                                                                                           |
| `validateExternalNamespace` + merge | `validateExternalKey` or `validateExternalNamespacePartial` + `scope.set()`                                                |

Install: `npm install @xndrjs/i18n@alpha`
