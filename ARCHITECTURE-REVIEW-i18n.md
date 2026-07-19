# Architecture Review — `@xndrjs/i18n` and `@xndrjs/i18n-react`

**Reviewer role:** senior TypeScript library maintainer / framework architect
**Version reviewed:** 0.7.0 (workspace state as of 2026-07-17)
**Scope:** architecture only. Formatting/naming issues are ignored unless they reveal deeper problems.

---

## Post-refactor status (2026-07-17)

A simplification pass landed after this review. Status of the original findings:

| Finding                                              | Status                                                                                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Single mode / canonical delivery / builder typestate | **Removed** — multi-only, `split-by-locale` \| `custom`, `I18nHandle.load({ namespaces, locale })`                               |
| `scope.set()` + React non-reactivity                 | **Removed** — content updates via authoring + `regenerateNamespaces` + optional `loaderStrategy: "fetch"`                        |
| 3.2 / 3.4 Suspense                                   | **Closed by design** — readiness stays gate/HOC; Suspense will not be used                                                       |
| 3.3 ref writes during render                         | **Fixed** — keep-previous / `pendingLocale` live in the load coordinator; gate is a pure `useSyncExternalStore` observer         |
| 3.7 “missing hooks”                                  | **Closed by design** — HOC/gate are intentional; hook comments removed                                                           |
| 3.8 `String(engineRef)` cache key                    | **Fixed** — `WeakMap` numeric ids                                                                                                |
| 3.5 eternal error fallback                           | **Improved** — `coordinator.retry` + `renderError` on gate/HOC                                                                   |
| Context sprawl / eager provider                      | **Fixed** — single `I18nRootProvider` context `{ handle, coordinator, locale }`                                                  |
| Peer range `^0.8.0` vs `0.7.0`                       | **Out of scope** — author-managed before publish                                                                                 |
| Paraglide tree-shaking claim                         | **Corrected below** — Paraglide does not tree-shake locales; locale split arrived late as a build-time plugin (worse build cost) |

The body of this document is the **pre-refactor** critique and is kept for historical context. Prefer the package README for current API docs.

---

## Executive summary

The core idea is sound and genuinely differentiated: **compile ICU JSON into exact TypeScript types, keep messages as data at runtime, and allow validated key-level runtime patching from external sources**. The compile-time/runtime separation is clean, error handling is excellent, and call-site type inference is among the best in the category.

The execution, however, buys that idea at a very high price in concepts. The library exposes a **3×2×2 configuration matrix** (delivery mode × single/multi × eager/lazy) where several cells change the _kind_ of object public functions return. The React integration is the weakest layer: it is **not reactive to the library's own headline feature** (`scope.set()` does not trigger re-renders), performs side effects and ref writes during render, and reimplements Suspense semantics manually across four nested contexts.

Most of the problems here would be solved by **deleting concepts**, not adding them. Roughly half of the public surface (single mode, builder typestate classes, delivery-area typestate, the HOC, two of the four contexts) could be removed with no loss of capability.

---

## 1. API design

### What is good

- **Call-site ergonomics of `t()` are excellent.** `ParamArgs<P> = [P] extends [never] ? [] : [params: P]` means a key without variables _cannot_ receive params and a key with variables _must_ receive exactly the right shape. Namespace/key/param checking is exact, with `const` type parameters preserving literal types.
- The **builder reads well at the call site**: `createI18n().withNamespaces(["billing"]).withLocale("it").load()` is discoverable and self-documenting.
- Config validation is strict (zod `.strict()` + cross-field `superRefine`), so invalid configs fail loudly with good messages.

### What is wrong

**1.1 — `createI18n` is not one function; it is three different functions wearing the same name.**
Depending on `i18n.codegen.json`, the generated `createI18n`:

- eager single → returns an `I18nScopeSingle` (a scope),
- eager multi → returns an `I18nScopeMulti` (a scope),
- lazy multi → returns an `I18nBuilderMultiInitial` (a builder, on which you cannot call `t` at all).

_Why it matters:_ changing `delivery: "canonical"` to `"split-by-locale"` in a JSON file silently changes the fundamental kind of the value your app's central factory returns. Every call site breaks, and the mental model ("what does `createI18n` give me?") is config-dependent. Symmetry between APIs is a stated design goal of good factories; this is the opposite.
_Simpler alternative:_ always return the same object — an engine/handle with `t` available for whatever is loaded, plus an async `load()`. Eager mode is then just "everything is already loaded." This is strictly better: one return type, one mental model, and lazy/eager becomes a data question rather than a type question.

**1.2 — Single mode duplicates the entire stack for no architectural payoff.**
There are two providers, two scope hierarchies, two builders, two sets of patch/preload helpers, and `mode: "single" | "multi"` branches with casts throughout the React layer. Yet single mode _already_ uses a namespace internally (`defaultNamespace: "default"` is in the config schema — the flat API is a facade over a namespaced dictionary).

_Consequence:_ ~40% of the runtime code and a large share of the codegen emitters exist to hide one string argument. Every feature must be implemented and tested twice; the React `ScopedTranslateFn` is an overload union of both shapes bridged with `as` casts.
_Simpler alternative:_ delete single mode. Keep multi as the only runtime, and let codegen emit a flat `t(key, ...)` wrapper (a 5-line curry over `t("default", key, ...)`) when the config uses `dictionary`. This is unambiguously better: the type-level sugar is trivial, the runtime halves, and the React layer loses its `mode` branching entirely.

**1.3 — Builder typestate is heavy machinery for two parameters.**
`I18nBuilderMultiInitial → I18nBuilderMultiReady → I18nBuilderMultiForLocale / I18nBuilderMultiPartitioned` is 4 interfaces + 5 implementation classes, each with 5–7 type parameters, plus deprecated aliases — all to encode "you must provide `namespaces`, and optionally one of `locale` or `deliveryArea`, before calling `load()`."

_Consequence:_ `builder-multi.ts` is ~580 lines whose only runtime behavior is copying three fields between objects. The `withLocale`/`withDeliveryArea` mutual exclusion is implemented by _silently discarding_ the other field in `clone()` — a hidden rule a user cannot see in types or docs ("what happens if I call both?" — last one wins, silently).
_Simpler alternative:_ `engine.load({ namespaces, locale })` (or `{ namespaces, area }` as a union) returning `Promise<Scope>`. One function, one options object, exclusivity expressed as a discriminated union — checked by the compiler _and_ visible to the reader. Strictly better; the fluent chain's only advantage is aesthetics, and it costs ~500 lines of generics.

**1.4 — `t()` arity varies with binding state.**
Unbound: `t(ns, key, locale, params?)`. Locale-bound: `t(ns, key, params?)`. The same conceptual function has the locale argument _in the middle_, present or absent by mode. The React types must union both shapes and the implementation casts between them. Most established libraries avoid this by making locale exclusively an instance/scope property, never a positional argument. The unbound form is rarely needed (server code can call `forLocale(locale)` cheaply — scopes are two-field objects); deleting the positional-locale form would remove an entire axis of API asymmetry.

**1.5 — Cosmetic configurability is accidental complexity.**
`paramsTypeName` / `schemaTypeName` / `localeTypeName` are no longer configurable: set `projectName` and codegen derives `ProjectParams` / `ProjectSchema` / `ProjectLocale`. Output paths collapse to `codegenPath` (TypeScript modules) + optional `artifactsPath` (JSON).

**Verdict:** state-of-the-art at the leaf (`t()` inference), over-built everywhere above the leaf.

---

## 2. Runtime architecture

### What is good

- **The compile-time/runtime split is the strongest architectural decision in the codebase.** The published package is fully generic (`Schema`/`Params` type parameters); all project-specific knowledge lives in generated files owned by the consumer. Codegen emits _data and thin typed wrappers_, not logic. This is exactly right and is what Paraglide/Lingui-class tools get right too.
- **Load deduplication** (`BuilderLoadRegistry`, keyed by namespace × partition) with the explicit rule "repeat `load()` is a no-op so it never clobbers `scope.set()` patches" shows careful thought about the patch feature's lifecycle.
- **SSR serialize/hydrate** (`serialize()` → `I18nCreateInput` → `seedBuilderResources` + `tryLoadSync`) is a real, working design: the demo creates a per-request engine in an RSC, serializes, and the client resolves gates synchronously on first render — no fallback flash, no hydration mismatch. Request-scoped usage is genuinely supported.

### What is wrong

**2.1 — The engine is mutable shared state with no change notification.**
`applyLoadMergeNamespace` and `patchKey*` mutate `this.dictionary` and the compiled cache, but there is no subscriber mechanism — nothing observes an engine. Every downstream consumer must either poll, re-load, or (as the React layer does) invent its own revision counter that only ticks on _loads_, not on _patches_. This is the root cause of the React reactivity gap (§3.1). For a library whose headline is runtime mutation, the mutation is architecturally invisible.
_Fix:_ a ~15-line `subscribe(listener)` + notify-on-merge/patch on the engine. This is the one place where _adding_ something is justified, because it lets you _delete_ the coordinator's snapshot-keeping machinery downstream.

**2.2 — Long-lived singleton + `set()` is a cross-request hazard on servers.**
The README recommends an app-owned module singleton (`export const i18n = createI18n(...)`). On a server, `scope.set()` on that singleton mutates process-global state shared across all requests. Nothing in the API or docs distinguishes "safe as singleton" (read paths) from "request-scoped only" (patch paths). i18next has the same trap and it is a recurring production incident for its users; a library designed in 2026 should make the request-scoped path the documented default for SSR and say so loudly.

**2.3 — Cloning costs are quadratic-ish with usage.**
The constructor `structuredClone`s the full dictionary; `getAll()` and `serialize()` do `structuredClone` + recursive `Object.freeze` of everything. In the demo, every SSR request pays: clone at construction + clone-and-freeze at `serialize()`. For a large dictionary this is real per-request CPU. Freezing a snapshot the caller will immediately `JSON.stringify` is pure waste.
_Fix:_ `serialize()` should return the internal reference or a shallow copy (it is consumed immediately); deep-freeze belongs behind `NODE_ENV !== "production"` if kept at all.

**2.4 — Type lie at the cold-start boundary.**
`this.dictionary = structuredClone(dictionary) as Schema` — a lazy cold start passes `{}`, but the field (and `getAll()`'s return type) claims the full `Schema`. Every downstream signature inherits this lie. Honest typing (`Partial`-shaped internal state) would ripple, which is exactly why the lie exists — a sign the eager/lazy distinction sits at the wrong layer.

**2.5 — Empty-string sentinels leak across layers.**
Generated canonical-lazy bindings call `instance.builder.withLocale!("")` and use `partition: ""` / `LOCALE_DELIVERY_AREA[locale]` sentinels. `""` means "no partition" in the registry (`partition === "" ? undefined : partition` in `seed()`). Magic values crossing three layers (codegen output → React coordinator → core registry) is exactly how hydration key mismatches happen; the partition should be a typed union (`{kind:"locale",v} | {kind:"area",v} | {kind:"none"}`), or better, the partition concept should be collapsed (see §5).

---

## 3. React integration

This is the weakest layer, and the problems are architectural, not cosmetic.

**3.1 — The headline feature does not work in React.**
`scope.set()` mutates the engine. The load coordinator's `revision` only increments when a _load_ settles (`bumpAndNotify` is called exclusively from `request()`'s promise handlers). A confirmed grep of the core shows no subscription mechanism at all. Consequently: a component rendered through `withI18n`/`<I18n>` shows **stale text after any runtime patch** until something unrelated forces a re-render. The CMS-override scenario the README opens with — fetch, validate, `set()` — silently does nothing on screen in the React integration. This alone caps the React score.

**3.2 — Side effects during render.**
`useNamespaceLoad` calls `coordinator.request()` in the render body. `request()` mutates the coordinator's map and — for a cache miss — invokes `input.load()`, which performs dynamic `import()`/fetch and then **mutates the shared engine** (`applyLoadMergeNamespace`). Under concurrent rendering, a render React throws away still fires loads and mutates shared state. It is dedup-guarded, so it is _mostly_ idempotent, but it is precisely the pattern React's concurrent-rendering rules prohibit; the sanctioned designs are `use(promise)` with a cache, or kicking off work in effects/events.

**3.3 — Ref writes during render.**
`renderLoadGateOuter` calls `options.onResolved?.(value)` during render, and `setDisplaySnapshot` writes `snapshotRef.current`. Writing a ref during render is explicitly disallowed (React 18+ documented rule) and can tear: two concurrently-rendered subtrees can observe different snapshots for the same committed state.

**3.4 — Manual re-implementation of Suspense, minus its guarantees.**
The gate deliberately never suspends ("Never calls `use(promise)`") and instead hand-rolls: pending/resolved/error entries, a `keepPreviousOnPartitionChange` display-snapshot mechanism, and `pendingLocale`. That is `useTransition` + `Suspense` + `use()` re-implemented in userland, with three subtle behaviors (snapshot in a ref, revision counter, error entries that render fallback forever) instead of the framework's tested ones. Avoiding Suspense is a defensible _option_; making non-Suspense the _only_ mode in 2026, on a package that requires **React ≥ 19** (where `use()` is stable), is architecture fighting the platform.

**3.5 — Error states are a dead end.**
When a load fails, the entry becomes `{status:"error"}` and the gate renders `fallback ?? null` — forever. Children cannot distinguish "loading" from "failed"; there is no retry API (the coordinator never evicts entries) and no error propagation (no re-throw into the tree for an error boundary). A failed chunk load requires a full remount of the shell to retry.

**3.6 — Context and provider sprawl.**
The lazy tree nests four contexts: `I18nRootContext`, `I18nInstanceContext`, generated `I18nLocaleContext`, generated `I18nCoordinatorContext`. The eager tree uses a _different_ pair (`I18nRootContext` + `I18nContext`). Two disjoint provider families with different invariants and different hook error messages ("must be used within I18nLazyRoot" vs "within I18nEagerRoot"). One context holding `{engine, coordinator, locale}` would serve both.

**3.7 — HOC + render-prop as the primary API; no hooks.**
The generated bindings export `withI18n` (a `forwardRef` HOC) and `<I18n>` (render prop). There is no `useT()` / `useTranslations(ns)` hook, even though the runtime contains `bindNamespaceTranslate` whose doc comment says "Used by generated per-namespace hooks" — the emitter never generates them. HOCs are a pre-2019 mental model; hooks compose with modern React (memoization, effects, custom hooks) in ways render props do not. The absence of hooks is the single most surprising thing a React developer will hit.

**3.8 — Identity bug in the coordinator cache key.**
`cacheKey` builds `` `${String(engineRef)}\0...` `` — `String(anyObject)` is `"[object Object]"`, so the engine does not actually participate in the key despite being named `engineRef`. It works today only because each coordinator is created per `I18nLazyShell` and each shell sits under exactly one engine. The moment a coordinator is shared (the file's own doc comment advertises "parallel per-namespace gates can share one coordinator"), two engines collide. Fix: `WeakMap<object, number>` id.

**3.9 — Allocation churn.**
`getEntry` allocates a fresh object every call; `bindLoadGateValue`/`buildI18nContextValue` build a fresh `t` closure on every render of a resolved gate. Any memoized child receiving `t` as a prop re-renders on every parent render. The eager provider gets this right (`useMemo`); the gate path does not.

**3.10 — What is right.**
The RSC split is correct: server components use the core package directly (no React dependency server-side), all generated bindings are `"use client"`, and `serialize()`/`state` gives a working no-flash hydration path (`tryLoadSync` resolving synchronously on first client render is genuinely clever). `useSyncExternalStore` is the right primitive for the subscription that exists. The capability model (namespace allow-list checked at runtime in `createScopedT`) is a nice defense-in-depth — though note the _core_ `toScope({namespaces})` accepts a namespaces argument and ignores it at runtime; enforcement exists only in the React layer, which is an inconsistency.

---

## 4. TypeScript design

### Strengths

- **Leaf inference is top-tier.** Exact param shapes, `never`-params keys rejecting a third argument, `const` generics preserving tuple literals for namespace lists, delivery areas narrowing the locale union (`LocalesForDeliveryAreaOrAll`).
- **Generated types are explicit literal types**, not `typeof import(json)` — readable, stable, reviewable in diffs, and decoupled from delivery layout. This is the right call and better than what several established tools do.
- Escape hatches are deliberate and documented (`*Core` untyped helpers, provider classes usable without codegen).

### Weaknesses

- **Internal generic complexity is extreme.** Builders and scopes carry 5–7 type parameters (`Schema, Params, RequestLocales, ActiveLocales, NsList, DeliveryArea, DeliveryArtifacts`). Adding any new axis multiplies signatures across ~10 interfaces. This is a direct tax of the typestate design (§1.3); maintainers will pay it on every change.
- **The React layer erases everything and asserts it back.** `ScopedScopeLike { t: (...args: unknown[]) => string }`, `builder.withNamespaces!(...)` non-null assertions, `render as never`, `props as never`, `ctx.t as ScopedT<Ns>`. The type safety users see at call sites passes through an untyped waist where nothing is checked — the generated file is the only thing keeping the casts honest, and the emitter is string concatenation (see §Maintainability below).
- **Packaging bug:** `@xndrjs/i18n-react@0.7.0` declares peer `"@xndrjs/i18n": "^0.8.0"` while the core is `0.7.0`. Outside this workspace, installation fails or warns on every install. This is the kind of error that makes early adopters bounce.
- **Deprecated aliases at 0.7** (`I18nBuilderMulti`, `I18nBuilderMultiImpl`) — carrying deprecation shims before 1.0 signals churn without offering stability. Pre-1.0, delete them.

### Maintainability of generated code

The emitters (`react-bindings-file.ts` is ~620 lines of template-string concatenation producing TSX, with escaped backticks and conditional fragments) are the most fragile part of the codebase. There are snapshot tests, which helps, but string-built TSX with six boolean/enum switches (`isSingle × hasLazy × delivery`) is combinatorially hard to verify — dead artifacts like `const appNamespaceDecl = isSingle ? "" : "";` already show drift. Shrinking the _variability_ of the generated file (one mode, fixed names) matters more than changing the emission technique.

---

## 5. Extensibility

**Adding a new delivery strategy today** requires touching: the config schema enum, codegen validation, the types emitter, the dictionary emitter, the namespace-loaders emitter, the instance emitter, the React bindings emitter (three branches in `formatLazyBindings`), the builder typestate (a new partition branch), and the README. That is not an extension point; it is a cross-cutting rewrite.

The irony is that the actual runtime extension point is already right: **a loader is just `(partition?) => Promise<KeyDictionary>`**. Everything above it — `delivery` enum, `withDeliveryArea` typestate, `DELIVERY_ARTIFACTS`/`LOCALE_DELIVERY_AREA` constants, per-mode emitter branches — is machinery to _generate_ loader implementations. If the public contract were "codegen always emits per-namespace-per-locale loaders; how they fetch is a pluggable function," then:

- `canonical` = loaders that import one shared file,
- `split-by-locale` = loaders that import per-locale files,
- `custom`/areas = a user-supplied `locale → bundle` mapping function feeding the same loaders.

Delivery areas in particular do not earn their place in the _type system_. They are a CDN packaging concern; encoding them as a builder typestate branch and a generated locale-narrowing type couples runtime types to deployment topology. As data (a map the app consults before calling `load`), the same capability costs ~20 lines.

New runtime features (message syntax other than ICU, rich-text/component interpolation — a notable functional gap vs every comparison library) are hard-wired: `resolveAndFormat` constructs `IntlMessageFormat` directly and returns `string` only. Returning `string` is a real limitation for React (no `<b>bold</b>` chunk interpolation, which react-intl/next-intl/Lingui all support).

---

## 6. Performance

- **Bundle:** core dist ~33 KB + `intl-messageformat` + `@formatjs/icu-messageformat-parser` (these dominate; the parser ships to the client because messages compile at runtime). React layer ~12 KB. This is the same weight class as react-intl/i18next+icu — and categorically heavier than Paraglide (~zero runtime) or Lingui (precompiled catalogs, no parser in the client). The runtime parser is the _price of the patch feature_: you cannot patch a precompiled function, but you must ship a compiler to patch a string. The trade is coherent but should be stated as such.
- **Tree shaking:** fine — ESM, no import-time side effects, generated instance imports the concrete provider class directly (the unused mode's class is shaken).
- **Code splitting:** genuinely good — per-namespace-per-locale chunks via generated `import()` switches is finer-grained than i18next's default backends and on par with next-intl's per-locale messages.
- **Caching:** compiled-message cache with precise invalidation on patch is correct and well-placed.
- **Allocations:** the concerns are §2.3 (deep clone+freeze per construction/serialize) and §3.9 (per-render closures and entry objects). Also `applyLoadMergeNamespace` rebuilds the top-level dictionary object per namespace load — O(namespaces), acceptable.
- **Hydration payload:** in canonical mode `serialize()` ships the _full multilocale_ dictionary to the client (all locales of every loaded namespace). Split-by-locale avoids this; canonical users get silent payload bloat with no warning.

---

## 7. Error handling

The best-executed area of the library.

- Codegen is fail-fast with contextual errors (key + locale + parse position) and non-zero exit for CI.
- Config validation is strict with helpful issue formatting and an allowed-keys epilogue.
- Runtime errors are prefixed, specific, and include the fallback chain (`[i18n] Missing key or locale: ... (fallback chain: de-CH → de-DE → en)`).
- Circular fallback detection at construction _and_ defensive re-detection at resolution.
- `scope.set()` validation is exceptional: ICU-parses the patch _and_ cross-checks extracted variables against every other locale's template for that key, so a CMS payload cannot silently change a key's parameter contract at runtime. No comparison library does this.
- `onMissing: "throw" | "key" | fn` is the right shape for a missing-key policy.

Two criticisms:

- **`onMissing` defaults to `"throw"`,** so one missing key in production takes down a React subtree (and with no error-boundary guidance in the React layer, likely a whole page). Fail-fast is right for dev; most mature libraries default production to render-the-key + report. At minimum the React docs need an error-boundary story.
- **Load errors in the React gate are swallowed into an eternal fallback** (§3.5) — the strong error-handling culture of the core does not extend to the React layer.

---

## 8. Mental model

Is there one clear conceptual model? **No — there are at least four**, and which one you live in depends on JSON config:

1. Eager: `createI18n({dictionary})` → scope → `t(ns, key, locale, params)`.
2. Lazy canonical: builder + `loadOnInit` seed + `""` partitions.
3. Lazy split-by-locale: builder + `withLocale` partitions, locale-bound `t`.
4. Custom areas: builder + `withDeliveryArea`, area-narrowed locales.

Hidden rules a senior engineer could not predict without reading the implementation:

- `set()` requires the key×locale to be "preloaded" (an internal `Set` of `ns:key:locale` strings); you cannot patch a locale a key never had, even if the locale is in the project.
- `withLocale` silently cancels a previous `withDeliveryArea` and vice versa.
- Repeat `load()` for the same resource is skipped _specifically to preserve patches_ — correct, but invisible.
- `toScope({namespaces})` narrows types but enforces nothing at runtime in the core; the equivalent React path _does_ throw. Same concept, two behaviors.
- The generated `createI18n`'s return kind depends on config (§1.1).
- Canonical `serialize()` ships all locales; split ships one.

The README needs ~950 lines to explain the core package. That number is itself the review: the concept count, not the documentation, is the problem. The underlying model that _wants_ to exist is simple and good — **"a typed dictionary store; load slices into it; read with `t`; patch with `set`"** — but it is buried under delivery modes, typestates, and mode duality.

---

## 9. Comparison with existing libraries (architecture, not features)

**i18next.** Runtime-everything: string keys, runtime interpolation, plugin ecosystem, event-emitter store. xndrjs is objectively stronger on: compile-time key/param safety, fail-fast CI integration, payload validation. Objectively weaker on: reactivity (i18next's emitter drives react-i18next re-renders — exactly what xndrjs lacks, §3.1), ecosystem, battle-testing. Trade-off: xndrjs bets everything on codegen; i18next bets on runtime flexibility. Note that i18next _with_ TypeScript resource augmentation now gets decent key typing, narrowing xndrjs's headline advantage.

**Paraglide (inlang).** The closest philosophical cousin — compiler-first, per-message typed functions, ~zero runtime, no ICU parser shipped. Marketing claims around tree-shaking overstate the win: unused _keys_ may be shaken, but **locales are not** — an app with 30 locales still pays for them unless a separate build-time locale-split plugin is used (landed years after the issue; it multiplies build time rather than shipping smaller runtime chunks the way xndrjs’s per-locale `import()`/`fetch` loaders do). xndrjs is stronger on delivery partitioning and CMS content updates without rebuild (`regenerateNamespaces` + fetch loaders). Paraglide remains lighter when you truly want compiled message functions and no runtime ICU.

**next-intl.** One mental model (provider + `useTranslations` + server helpers), first-class App Router/RSC integration, clear hydration contract, ICU under the hood. Objectively stronger on: React integration correctness, API predictability, rich-text chunk interpolation. xndrjs objectively stronger on: framework independence, generated exact param types (next-intl's checking is good but less precise), audit tooling, per-namespace code splitting granularity. xndrjs's RSC story (core on the server, `"use client"` bindings) is structurally similar but requires the user to hand-carry `serialize()` state where next-intl automates it.

**react-intl / FormatJS.** xndrjs literally builds on FormatJS's parser/formatter, so the message-layer architecture is identical. Differences: react-intl uses extraction from source + context-driven re-render; its precompiled-AST pipeline (`@formatjs/cli compile`) removes the parser from the client bundle — an option xndrjs's architecture forecloses because patching needs the parser. xndrjs's codegen typing is stronger than FormatJS extraction typing. react-intl handles rich-text chunks; xndrjs returns `string` only.

**Lingui.** Macro-based compile step, precompiled catalogs, small runtime, `i18n.activate()` with event-driven reactivity, hooks-first React API. Architecturally, Lingui occupies the sane middle that xndrjs should study: a real compile step _and_ a reactive runtime store _and_ a small React surface (one provider, one hook, one component). Lingui is weaker on param-type exactness (xndrjs wins clearly) and has no payload-validation story.

**Summary of position:** xndrjs's unique, defensible territory is **typed, validated, key-level runtime patching + audit tooling + delivery-partition codegen**. Its weaknesses are exactly where it diverged from everyone else's hard-won patterns: no reactive store (all six comparisons have one), no hooks-first React API (all React-oriented comparisons have one), string-only output (all have rich-text), and a configuration matrix none of them ask users to hold in their heads.

---

## 10. Prioritized criticism and recommendations

Ordered by severity; each follows "why → consequence → alternative → is it actually better?"

| #   | Finding                                                                                                             | Severity                             |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1   | `scope.set()` invisible to React — headline feature inert in the React layer (§3.1)                                 | Critical                             |
| 2   | Render-phase side effects + ref writes in the gate (§3.2, §3.3) — concurrent-rendering correctness                  | Critical                             |
| 3   | Peer range `@xndrjs/i18n@^0.8.0` vs actual `0.7.0` — installs fail outside the monorepo                             | Critical (trivial fix)               |
| 4   | `createI18n` return kind depends on config (§1.1)                                                                   | High                                 |
| 5   | Single/multi full-stack duplication (§1.2)                                                                          | High                                 |
| 6   | Load-error dead end in gates: eternal fallback, no retry, no propagation (§3.5)                                     | High                                 |
| 7   | Builder typestate: ~500 lines of generics for 2 parameters; silent `withLocale`/`withDeliveryArea` exclusion (§1.3) | Medium                               |
| 8   | `String(engineRef)` cache key — identity doesn't work (§3.8)                                                        | Medium (latent)                      |
| 9   | Four contexts + HOC/render-prop, no hooks (§3.6, §3.7)                                                              | Medium                               |
| 10  | Per-request `structuredClone` + deep-freeze in `serialize()`/`getAll()` (§2.3)                                      | Medium                               |
| 11  | Delivery areas as typestate instead of data (§5)                                                                    | Medium                               |
| 12  | Canonical `serialize()` ships all locales to the client (§6)                                                        | Medium                               |
| 13  | Sentinel `""` partitions; `toScope({namespaces})` runtime no-op; `Schema` cast on `{}` (§2.4, §2.5)                 | Low each, pattern-revealing together |
| 14  | Cosmetic name configurability; deprecated aliases pre-1.0 (§1.5, §4)                                                | Low                                  |

**The single highest-leverage change** is adding a subscription to the engine (a `Set<() => void>` notified from `applyLoadMerge*` and `patchKey*`). It fixes #1 directly, and lets you _delete_ the coordinator's snapshot/revision machinery (#2 partially, #9 partially) by driving everything through one `useSyncExternalStore` on the engine. That is an addition that pays for itself in deletions — the only kind worth making here.

**The single highest-leverage deletion** is single mode (#5). It removes two classes, two scope hierarchies, one builder, the `mode` branching and half the casts in the React layer, and one axis of the codegen matrix, in exchange for a five-line typed curry.

A plausible 0.8 shape: one engine (multi-only, with `subscribe`), one `load({namespaces, locale})`, one scope type, one React provider + `useT(namespaces)` hook (Suspense-compatible via `use()`, with the manual gate kept as the non-Suspense escape hatch), delivery as loader data. The current feature set survives intact; roughly half the concepts do not — which is the point.

---

## Scores (1–10)

| Criterion                | Score | One-line justification                                                                                                                                                                          |
| ------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API design**           | **5** | Best-in-class `t()` inference sitting on a config-dependent, duplicated, typestate-heavy surface with hidden rules.                                                                             |
| **Architecture**         | **6** | Excellent compile/runtime split, dedup, and SSR serialize model; undermined by a mutation-based core with no observation mechanism and sentinel-value plumbing.                                 |
| **React integration**    | **3** | Not reactive to the library's own mutation feature; render-phase side effects and ref writes; no hooks; error dead ends; the working hydration path is the redeeming feature.                   |
| **Maintainability**      | **5** | Thorough tests and clean module boundaries, but ~6.5k lines of core for this feature set, extreme generic arity, and string-concatenated TSX emitters with a combinatorial mode matrix.         |
| **Extensibility**        | **4** | The loader function is a good extension point; everything above it (delivery enum, typestates, emitter branches) makes any new strategy a cross-cutting rewrite.                                |
| **Production readiness** | **4** | Broken peer range, pre-1.0 churn with deprecations, React reactivity gap, and no error-boundary/retry story — against genuinely production-grade error handling, validation, and audit tooling. |

**Overall:** a strong compiler and a strong validator wrapped around a mid-tier runtime and a weak React layer. The differentiated ideas (typed runtime patching with cross-locale ICU validation, audit CLI, partition-aware codegen) are worth keeping; most of the surrounding structure is worth deleting.
