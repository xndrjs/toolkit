---
title: "@xndrjs/i18n — Engine / Scope / Builder: rigorous specs"
status: draft
last_updated: 2026-07-13 (scope-rename)
---

This document is a **contract-style specification** for `@xndrjs/i18n` runtime + codegen integration.
It defines, rigorously and unambiguously:

- **Data model** (schema shapes)
- **Engine** semantics for loading artifacts, projecting scopes, and runtime updates
- **Scope** semantics (`I18nScope*`)
- **Builder** semantics (`I18nBuilder*`) including `load()` and loader/hydration wiring
- **Delivery modes** as they affect codegen + builder usage
- **Replacement vs merge vs patch semantics** (what accumulates, what overwrites, what invalidates cache)

The spec is written against the current source files under:

- `packages/i18n/src/engine.ts`
- `packages/i18n/src/IcuTranslationProviderSingle.ts`
- `packages/i18n/src/IcuTranslationProviderMulti.ts`
- `packages/i18n/src/scope-single.ts`
- `packages/i18n/src/scope-multi.ts`
- `packages/i18n/src/single-builder.ts`
- `packages/i18n/src/builder-multi.ts`
- `packages/i18n/src/project-locales.ts`

---

## 0. Terms and notation

- **Template**: an ICU MessageFormat string (e.g. `"Welcome {name}!"`).
- **Locale**: a string key such as `"en"`, `"it"`, `"de-CH"`.
- **Namespace**: the top-level key in a multi dictionary (e.g. `"default"`, `"billing"`).
- **Key**: the translation key inside a namespace (or in single mode).
- **Partition key**: a string used by partitioned loaders. In this codebase it means either:
  - `locale` for split-by-locale delivery, or
  - `area` for custom delivery areas.

When we say **“accumulate”**, we mean: add locale entries without removing existing locales/keys/namespaces unless explicitly overwritten.

When we say **“replace”**, we mean: drop previous values for that scope and install the new object as authoritative.

---

## 1. Data model (runtime shapes)

The runtime types are defined in `packages/i18n/src/types.ts`.

### 1.1 Single dictionary shape

`KeyDictionary` is:

```ts
type LocaleDictionary = Record<string, string>;
type KeyDictionary = Record<string, LocaleDictionary>;
```

Concrete shape:

```ts
type SingleSchema = {
  welcome: { en: string; it: string };
  login_button: { en: string; it: string };
};
```

### 1.2 Multi dictionary shape

`MultiDictionary` is:

```ts
type MultiDictionary = Record<string, KeyDictionary>;
```

Concrete shape:

```ts
type MultiSchema = {
  default: {
    welcome: { en: string; it: string };
  };
  billing: {
    invoice_summary: { en: string; it: string };
  };
};
```

### 1.3 Merge input shapes (partial)

`PartialKeyDictionary` and `PartialMultiDictionary` represent **valid artifact payload shapes** used by loaders and internal accumulation:

```ts
// per key: any subset of locales, any subset of keys
type PartialKeyDictionary<T> = { [K in keyof T]?: Partial<Record<Locales, string>> };

// per namespace: any subset of namespaces, each partial
type PartialMultiDictionary<T> = { [NS in keyof T]?: PartialKeyDictionary<T[NS], Locales> };
```

**Invariant (artifact payload)**:

- Artifact payloads **MUST NOT require completeness**: they may omit keys and locales.
- Artifact payloads **MUST be additive**: it must be meaningful to accumulate multiple artifacts over time.

---

## 2. Engine: what it is and what it guarantees

The “engine” is a **mutable internal store** of:

- current dictionary state
- compiled ICU cache
- locale fallback policy
- onMissing policy
- preload metadata (which `(namespace?, key, locale)` triples were loaded via builder `load()`)

The engine is **not** the primary public mutation surface. Apps interact via **builder → load() → view**, and runtime patches go through **`scope.set(...)`** on locale-bound scopes (see §3).

### 2.1 Engine interface contracts (internal)

The engine implementation (`IcuTranslationProviderSingle` / `IcuTranslationProviderMulti`) holds state and powers views. Its **public** surface is intentionally minimal:

```ts
interface I18nEngineSingle<Schema, Params, RequestLocales> {
  getAll(): Schema;
  toScope(): I18nScopeSingle<Schema, Params, RequestLocales>;
  toScope<Locale extends RequestLocales>(options: { locale: Locale }): I18nScopeSingleForLocale<Schema, Params, Locale>;
  // internal: patchKey(key, locale, template), applyLoadMerge(...), preload tracking
}

interface I18nEngineMulti<Schema, Params, RequestLocales> {
  getAll(): Schema;
  toScope<const NsList extends readonly (keyof Schema & string)[]>(options: { namespaces: NsList }): I18nScopeMulti<...>;
  toScope<const NsList extends readonly (keyof Schema & string)[], Locale extends RequestLocales>(
    options: { namespaces: NsList; locale: Locale }
  ): I18nScopeMultiForLocale<...>;
  // internal: patchKey(namespace, key, locale, template), applyLoadMerge(...), preload tracking
}
```

**Removed from public engine API** (not deprecated — deleted):

- `setAll`, `setNamespace` — total replace breaks monotonic guarantees.
- `mergeAll`, `mergeNamespace` — raw merge allows undeclared locale injection.
- `forLocale(...).set(...)` as a separate “editor” type — patches live on locale-bound **views** instead (§3.4).

`getAll()` remains for debugging/inspection only; returns a deep-frozen snapshot, not a live reference.

### 2.2 Preload gates for runtime updates

The system distinguishes:

- **preloaded defaults** (loaded via builder `load()` for a specific partition), and
- **runtime patches** (single-key updates via `scope.set(...)`).

**Target spec**:

- A key can be patched **only if** the corresponding default resource has been loaded first.
  - In single mode: `(key, locale)` must be preloaded.
  - In multi mode: `(namespace, key, locale)` must be preloaded.
- If the gate is not satisfied, `set(...)` MUST throw a descriptive error (do not silently accept).

This ensures patch operations do not invent locale coverage that was never loaded by the delivery policy.

### 2.3 Where accumulation happens

**Target spec** — dictionary state grows only through:

- builder `load()` (deep-merge delivery artifacts into the shared engine), and
- `scope.set(...)` on a locale-bound scope (key-level patch, post-preload, validated).

No public `setAll`, `setNamespace`, `mergeAll`, or `mergeNamespace`.

---

## 3. Scope: what it is and what it guarantees

Scopes are the **public surface** for both reading and patching translations. They are **type-safe** and wrap the shared engine.

There is **no separate read API vs write API** at the app level: the same locale-bound scope returned from `load()` exposes both `t(...)` and `set(...)`.

### 3.1 Scope ↔ engine relationship

**Spec**:

- A scope is a thin wrapper around the engine (same engine reference the builder uses).
- Calling `t(...)` delegates to engine internal `getWithLocale(...)`.
- Calling `set(...)` delegates to engine internal patch logic (with preload gate + ICU re-validation).
- Scopes are not snapshots; they observe whatever the engine holds at call time.
- Multiple scopes (e.g. `enView`, `itView` from successive `load()` calls) share one engine; a patch via `enScope.set(...)` is visible to `itScope.t(...)` only for overlapping keys/locales as expected.

**Implementation**:

- `I18nScope*Impl` holds `engine: IcuTranslationProvider*` and delegates read/write.

### 3.2 `t()` semantics

**Spec**:

- Resolves template for (namespace?, key, locale) via locale fallback chain, then formats with ICU params.
- Missing template resolution is controlled by `onMissing`.
- ICU syntax errors and formatting errors always throw (even if `onMissing` is `"key"`).

### 3.3 Unbound vs locale-bound scopes

| Scope type                                                           | Produced by                                                           | `t(...)`                               | `set(...)`                                          |
| -------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------- |
| Unbound (`I18nScopeMulti`, `I18nScopeSingle`)                        | `load()` without `withLocale`, or eager `createI18n(dict)`            | requires explicit `locale` arg (multi) | **not available** — call `.forLocale(locale)` first |
| Locale-bound (`I18nScopeMultiForLocale`, `I18nScopeSingleForLocale`) | `load()` after `withLocale`, or `.forLocale(locale)` on unbound scope | locale implicit                        | **available** — locale implicit                     |

**Spec for `forLocale(locale)`**:

- returns a locale-bound scope with `readonly locale`
- `t(...)` no longer requires a locale argument
- `set(...)` patches keys for that bound locale
- `forLocale(next)` returns a new bound view for `next` (same engine)

### 3.4 `set()` semantics (locale-bound scopes only)

#### Multi

```ts
interface I18nScopeMultiForLocale<Schema, Params, RequestLocales, Locale> {
  readonly locale: Locale;
  t<NS, K>(namespace: NS, key: K, ...params): string;
  set<
    const NS extends keyof Schema & keyof Params & string,
    const K extends keyof Schema[NS] & keyof Params[NS] & string
  >(namespace: NS, key: K, template: string): void;
  forLocale<Next extends RequestLocales>(locale: Next): I18nScopeMultiForLocale<..., Next>;
}
```

#### Single

```ts
interface I18nScopeSingleForLocale<Schema, Params, Locale> {
  readonly locale: Locale;
  t<K>(key: K, ...params): string;
  set<const K extends keyof Schema & string>(key: K, template: string): void;
  forLocale<Next>(locale: Next): I18nScopeSingleForLocale<..., Next>;
}
```

**Spec**:

- `set(...)` MUST re-validate ICU syntax and params compatibility for the target key.
- `set(...)` MUST enforce the preload gate (§2.2) for `(namespace?, key, view.locale)`.
- `set(...)` MUST invalidate the compiled cache for that exact triple.
- The builder MUST NOT expose `set(...)` — patches happen on the loaded view, not on configuration clones.

---

## 4. Builder: what it is and what it guarantees

Builders exist to:

- declare a set of namespaces (multi)
- bind a partition (locale or delivery area)
- load missing data via loaders
- then produce a scope via `load()`

### 4.1 Builder is immutable (functional API)

**Spec**:

- Each `withX(...)` returns a new builder instance with cloned state.
- The underlying engine is shared (same reference) across clones.

**Implementation**:

- `I18nBuilderMultiImpl.clone()` and new instance creation.
- Same for `I18nBuilderSingleImpl`.

### 4.2 `withNamespaces(...)` semantics (multi)

**Spec**:

- Sets the target namespace list for the subsequent `load()`.
- Replaces previous namespace list (not additive).
- If you call `load()` with empty namespaces list, builder MUST throw.

**Implementation**:

- throws `"[i18n] withNamespaces(...) is required before load()."`

### 4.3 `withLocale(...)` / `withDeliveryArea(...)` semantics (multi + single)

**Spec**:

- Exactly one of `{ locale, deliveryArea }` can be set at a time.
- The chosen one becomes the **partition key** passed to partitioned loaders.
- In multi: `withLocale` returns a `I18nBuilderMultiForLocale` which returns a locale-bound scope.
- In single: `withLocale` returns a locale-bound scope via `toScope().forLocale(...)`.

**Implementation**:

- `withLocale` deletes `deliveryArea` and vice versa.

### 4.4 `load()` semantics (the critical part)

Load is where side effects happen:

**Target spec**:

1. Resolve `partition = locale ?? deliveryArea ?? undefined`.
2. For each namespace in the builder state:
   - if a loader exists:
     - call loader with `partition` (partitioned) or with no args (canonical)
     - **deep-merge per key+locale** into engine’s dictionary state
     - record preload metadata: which (namespace,key,locale) pairs are now considered “preloaded defaults”
3. Return a scope scoped to the namespaces used in this load call:
   - multi: `engine.toScope({ namespaces })` then optionally `.forLocale(locale)`
   - single: `engine.toScope()` then optionally `.forLocale(locale)`

**Current implementation** follows this outline (see `applyMultiBuilderLoad` and `applySingleBuilderLoad`).

### 4.5 Removal of builder hydration APIs

**Target spec**:

- `withNamespaceData` and `withDictionaryData` MUST NOT exist.
- Rationale: hydration-by-passing-data is effectively a public merge surface; it reintroduces the same guarantee problems as `mergeNamespace/mergeAll`.

External ingestion becomes:

- load defaults via builder (preload gate satisfied),
- then patch individual keys via `scope.set(...)` on the locale-bound scope returned from `load()` (or via `.forLocale(locale)` on an unbound scope).

---

## 5. Delivery modes and codegen responsibilities

This repo uses codegen to create `createI18n(...)` that returns either:

- a scope (eager cases), or
- a builder (lazy cases), wired with loaders.

### 5.1 Canonical (eager)

**Spec**:

- `createI18n(defaultDictionary)` returns a scope scoped to all namespaces (multi) / full schema (single).
- No loaders are required for basic translation.

### 5.2 Canonical with lazy namespaces (`loadOnInit`)

**Spec**:

- `createI18n(initialSchema)` may contain only eager namespaces.
- `namespaceLoaders` exist for lazy namespaces.
- builder `load()` should merge missing namespaces into the engine via loaders.

### 5.3 Split-by-locale

**Spec**:

- loaders are partitioned by `locale`.
- builder must pass the requested locale as partition key to loaders.
- repeated loads for different locales on the same engine MUST accumulate locale entries (deep merge) and update preload metadata.

### 5.4 Custom delivery areas

**Spec**:

- loaders are partitioned by `area`.
- builder must pass the requested area as partition key.
- repeated loads for different areas on the same engine MUST accumulate the union of loaded locale entries represented by those areas and update preload metadata.

---

## 6. Cache invalidation: required behavior

### 6.1 Target behavior

Since replace/merge APIs are removed, cache invalidation points are:

- **Builder load / artifact application**:
  - MUST invalidate cache entries for the affected namespace (multi) or affected keys/locales (single) at minimum.
- **Key-level patch `set(...)`**:
  - MUST invalidate cache for that exact (namespace?, key, locale) pair.

---

## 7. Practical recipes (canonical patterns)

### 7.1 “Load and translate” (multi, split-by-locale)

```ts
const builder = createI18n({});
const scope = await builder.withNamespaces(["billing"]).withLocale("it").load();

view.t("billing", "invoice_summary", { count: 2 });
```

### 7.2 “Accumulate two locales on the same engine” (deep merge via load)

```ts
const builder = createI18n({}).withNamespaces(["billing"] as const);
const itScope = await builder.withLocale("it").load();
const enScope = await builder.withLocale("en").load();
// engine now contains both locale entries (deep-merged), and preload metadata includes both locales.
```

### 7.3 “Validate external payload, then patch a key” (post-preload)

No separate engine reference is required. The builder already wraps a shared engine; `load()` returns a locale-bound scope that exposes both `t(...)` and `set(...)`.

```ts
const builder = createI18n({}).withNamespaces(["billing"] as const);

// preload + locale-bound scope in one step
const enScope = await builder.withLocale("en").load();

// read
enScope.t("billing", "invoice_summary", { count: 2 });

// patch — locale "en" is implicit from the chain above
// MUST re-validate ICU + params; MUST refuse if (billing, invoice_summary, en) was not preloaded
enScope.set("billing", "invoice_summary", "You have {count} invoices");
```

**Custom delivery area** (partition is an area, not a locale): `load()` returns an unbound view; bind locale before patching:

```ts
const builder = createI18n({}).withNamespaces(["billing"] as const);
const euScope = await builder.withDeliveryArea("eu").load();
const itScope = euScope.forLocale("it");
itScope.set("billing", "invoice_summary", "Hai {count, plural, one {1 fattura} other {# fatture}}");
```

**Why not `builder.set(...)`?** The builder is immutable configuration (`withX` clones state). Mutation belongs on the loaded view, which carries the namespace scope and (when bound) the locale context established by the chain.

### 7.4 Mode examples (what code should look like)

#### 7.4.1 Canonical (single)

```ts
// createI18n(defaultDictionary) returns a ready scope
const i18n = createI18n(defaultDictionary);
console.log(i18n.t("welcome", "en", { name: "Ada" }));
```

#### 7.4.2 Canonical (multi, eager)

```ts
// createI18n(defaultDictionary) returns a ready scope scoped to all namespaces
const i18n = createI18n(defaultDictionary);
console.log(i18n.t("billing", "invoice_summary", "en", { count: 2 }));
```

#### 7.4.3 Split-by-locale (multi)

```ts
// createI18n({}) returns a builder; load merges artifacts deeply into the engine
const builder = createI18n({});
const viewIt = await builder.withNamespaces(["billing"]).withLocale("it").load();
console.log(viewIt.t("billing", "invoice_summary", { count: 2 }));
```

#### 7.4.4 Custom delivery areas (multi)

```ts
const builder = createI18n({});
const viewEu = await builder.withNamespaces(["billing"]).withDeliveryArea("eu").load();
console.log(viewEu.t("billing", "invoice_summary", "it", { count: 2 }));
```

---

## 8. Non-goals / clarified boundaries

- The builder does not currently enforce “ready-ness” at the type level beyond namespace narrowing.
- Scopes do not freeze dictionary state; they delegate to the shared engine at call time.
- `set(...)` is only on locale-bound scopes — unbound views must call `.forLocale(locale)` first.
- The engine is an implementation detail; apps should not construct or hold engine references directly.
- “Completeness” of a locale (all keys present) is out of scope of merge semantics; it is an audit/validation concern.
