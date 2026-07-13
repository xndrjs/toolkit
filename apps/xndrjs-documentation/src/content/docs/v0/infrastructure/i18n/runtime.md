---
title: Runtime
description: Engine, scopes, fluent builder, load deduplication, and scope.set() for @xndrjs/i18n 0.7.
---

## Architecture (0.7)

| Layer                                                                       | Role                                                                                  |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Engine** (`IcuTranslationProviderSingle` / `IcuTranslationProviderMulti`) | Mutable dictionary, compiled-message cache, preload registry, `getAll()`, `toScope()` |
| **Scope** (`I18nScopeSingle` / `I18nScopeMulti` and `*ForLocale`)           | Typed read projection over the engine; locale-bound scopes expose `set()`             |
| **Builder** (`I18nBuilderSingle` / `I18nBuilderMulti`)                      | Fluent async loader: `withNamespaces` → `withLocale` or `withDeliveryArea` → `load()` |

Codegen `createI18n(dictionary)` constructs an engine and returns either a scope (eager canonical single) or a builder (lazy multi split/custom).

### Builder `load()`

1. Requires `withNamespaces([...])` (multi) before `load()`.
2. Partition key = `withLocale(locale)` or `withDeliveryArea(area)` (mutually exclusive on one chain).
3. For each namespace, if `(namespace, partition)` was already loaded on this engine, **skip** (no loader call, no merge).
4. Otherwise invoke `namespaceLoaders[ns](partition)` (or `dictionaryLoader(partition)` in single mode), deep-merge into the engine, mark the resource loaded.
5. Return a scope — locale-bound when `withLocale` was used; unbound multi scope when `withDeliveryArea` was used (`forLocale` afterward).

Different partitions on the same shared engine accumulate translations. Same partition reload preserves runtime `scope.set()` patches.

### `scope.set()`

- Only on locale-bound scopes (`I18nScope*ForLocale`).
- Requires the `(key, locale)` or `(namespace, key, locale)` triple to exist in the preload registry (from constructor seed or prior `load()`).
- Re-validates ICU syntax and parameter compatibility against other locales for the same key.
- Invalidates compiled cache for the patched key/locale.

### Delivery-area typing

When codegen configures `delivery: "custom"`, `withDeliveryArea(area)` returns `I18nBuilderMultiPartitioned` with `ActiveLocales` narrowed to `DELIVERY_ARTIFACTS[area]`. Unbound scopes from that chain expose `forLocale` only for those locales at compile time.

### Removed in 0.7

- `I18nView*` → `I18nScope*`, `toView()` → `toScope()`
- Public `setAll`, `mergeAll`, `setNamespace`, `mergeNamespace`
- `hasNamespace()`, `loadedNamespaces`
- Builder `withNamespaceData` / `withDictionaryData`
- Generated `ensureNamespacesLoadedForLocale` / `ensureNamespacesLoadedForArea`

## Usage

Create an engine-backed scope with the generated factory. Pass the dictionary explicitly so `instance.generated.ts` does not import fallback JSON into your bundle:

```ts
import { createI18n } from "./i18n/generated/instance.generated.js";
import { defaultDictionary } from "./i18n/generated/dictionary.generated.js";

export const i18n = createI18n(defaultDictionary); // eager canonical → scope
// lazy split/custom:
export const loadBilling = () => createI18n({}).withNamespaces(["billing"]).withLocale("en").load();
```

Or use the scaffolded singleton in `i18n/index.ts`:

```ts
import { createI18n } from "./generated/instance.generated.js";
import { defaultDictionary } from "./generated/dictionary.generated.js";

export * from "./generated/instance.generated.js";
export * from "./generated/dictionary.generated.js";
export * from "./generated/i18n-types.generated.js";

export const i18n = createI18n(defaultDictionary);
```

### `forLocale`

Bind a locale once and omit it on every `t()`:

```ts
const scopeEn = i18n.forLocale("en");

scopeEn.t("login_button"); // single-file
scopeEn.t("welcome", { name: "Ada" });

const scopeIt = i18n.forLocale("it");
scopeIt.t("default", "login_button"); // multi
scopeIt.t("billing", "invoice_summary", { count: 3 });
```

The bound scope shares dictionary, cache, and fallback rules with the engine.

## Scope and engine API

| Surface                   | Behavior                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `scope.t(...)`            | Format a key for a locale; TypeScript enforces required params                                 |
| `scope.forLocale(locale)` | Locale-bound scope with narrower `t()` signature                                               |
| `engine.getAll()`         | Deep-frozen snapshot of the current dictionary (via engine reference when needed)              |
| `scope.set(...)`          | Locale-bound only — patch one preloaded key; re-validates ICU and param compatibility          |
| Builder `load()`          | Invoke lazy loaders once per namespace + partition; skipped if already loaded on shared engine |

Compiled `IntlMessageFormat` instances are cached per locale (and per namespace in multi mode). `scope.set()` invalidates the affected key.

Public merge/replace APIs (`setAll`, `mergeAll`, `setNamespace`, `mergeNamespace`) were removed in 0.7.0. Deep merge is internal to the first `load()` per resource; patches go through `scope.set()`.

### `getAll()` for dynamic access

Codegen types the happy path. For admin tools, diff views, or CMS previews, use `engine.getAll()` on the underlying provider when you hold an engine reference.

Most apps use the **generated** `createI18n(dictionary)` factory rather than constructing providers manually.

See also [Lazy loading](/v0/infrastructure/i18n/lazy-loading/) and [External validation](/v0/infrastructure/i18n/validation/).
