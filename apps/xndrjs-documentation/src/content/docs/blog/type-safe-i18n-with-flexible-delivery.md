---
title: "Type-safe i18n and flexible delivery: why I built @xndrjs/i18n"
description: The real needs behind a modern i18n library — type-safe keys and parameters, ICU MessageFormat, lazy namespace loading, and per-locale delivery.
date: 2026-07-14
author: Fabio Fognani
tags:
  - i18n
  - typescript
  - icu
---

Every frontend project eventually needs translations. The first integration is usually quick: pick a library, drop JSON files in a folder, wire up a hook or a helper, ship.

Then the product grows. Pluralization rules get weird. Someone typos a key in a component and nothing fails until QA. A mega-site starts shipping every locale in the initial bundle because nobody planned how translations should be split and loaded.

Those are not exotic edge cases. They are the normal lifecycle of i18n in a TypeScript codebase.

I built [`@xndrjs/i18n`](https://github.com/xndrjs/toolkit/tree/main/packages/i18n) to address them directly — compiler-first, ICU-native, and explicit about how dictionaries move from authoring to delivery and runtime.

Here is the problem map, and how the library maps back to it.

---

## What you actually need from an i18n library

### 1. Type-safe keys — or your UI navigates in the dark

Stringly-typed translation keys look fine in a demo:

```ts
t("login_button");
t("welcom"); // typo — runtime silence, compile-time silence
```

Without generated types, your components have no guardrails. Autocomplete does not know your dictionary. Refactors rename keys in JSON but miss call sites. New engineers grep for strings and hope.

Type-safe keys are not a luxury feature. They are how you keep UI code honest as the dictionary grows from twenty entries to two thousand.

### 2. Type-safe parameters — because keys alone are not enough

Some translations are static labels. Many are not.

```json
// translations/default.json
{
  "welcome": { "en": "Welcome {name}!" },
  "dashboard_status": {
    "en": "You have {msgCount, plural, one {1 message} other {{msgCount} messages}} in {chatCount, plural, one {one chat} other {{chatCount} chats}}"
  }
}
```

`welcome` needs a `name: string`. `dashboard_status` needs two numbers. Knowing the key exists is only half the contract — you also need to know **which parameters** the template expects, and with what types.

Miss `{ name }` on `welcome` and you get a broken string at runtime. Pass a string where a plural rule expects a number and ICU formatting fails. TypeScript can catch both — but only if something connects the JSON templates to your call sites.

### 3. Flexible delivery — author once, ship only what is needed

Authoring and delivery have different needs. Authors and translators benefit from one canonical multilocale dictionary per domain: they can see the full context, codegen can infer one contract, and audit can inspect one source of truth.

Users should not have to download that full matrix. A session usually needs one locale, or at most a small regional group. Delivery therefore needs to be able to materialize:

- one multilocale file per namespace for small applications
- one file per namespace and locale
- custom slices for regions or locale families

The source dictionary stays canonical. Codegen decides how to project it into artifacts for a JavaScript bundle, static host, or CDN.

### 4. Lazy loading — when "all translations upfront" does not scale

A small app can afford to ship every locale in the initial bundle. A product with dozens of namespaces — onboarding, billing, admin, marketing, error pages — cannot.

Lazy loading translations by route, feature, and locale reduces:

- initial JavaScript bundle size
- time-to-interactive on first visit
- wasted network transfers for locales and domains the user may never open

The catch: lazy loading must be **explicit**. Silent fallbacks to missing keys hide integration bugs.

---

## How @xndrjs/i18n is designed around those needs

### Compiler-first type safety

`@xndrjs/i18n` separates **codegen** from **runtime**.

At build time, `xndrjs-i18n-codegen` reads your ICU dictionaries (JSON or YAML), parses every string with `@formatjs/icu-messageformat-parser`, and generates exact TypeScript types for keys and parameters:

```ts
// i18n/generated/i18n-types.generated.ts
export type MyProjectParams = {
  default: {
    login_button: never;
    welcome: { name: string };
    dashboard_status: { msgCount: number; chatCount: number };
  };
  billing: {
    invoice_summary: { count: number };
  };
};
```

At runtime, `t()` is typed against that schema:

```ts
const { t } = i18n.forLocale("en");

t("default", "welcome", { name: "Ada" }); // ✓
t("default", "welcome"); // ✗ compile error — missing { name }
t("billing", "login_button"); // ✗ compile error — key not in namespace
```

Add a key to a dictionary file, re-run codegen, and TypeScript flags every call site that needs updating. That is the loop that keeps UI code and dictionary in sync.

### Single file vs multi-namespace

Codegen runs in one of two modes — you pick at config time, and the
generated API follows. Small project? **Single file** — one dictionary, `t(key, locale)` (typically `const { t } = scope`).

Large project? **Multi-namespace** — split by domain (`default`, `billing`, …), `t(namespace, key, locale)` on unbound scopes or `t(namespace, key)` when locale-bound, plus the builder and generated loaders for lazy loading.

Same runtime, different generated API (locale-bound via `forLocale`):

```ts
const { t } = i18n.forLocale("en");
t("welcome", { name: "Ada" }); // single
t("default", "welcome", { name: "Ada" }); // multi
```

### Dynamic access when you need it

The engine exposes a `getAll()` method when you need to walk the full dictionary — admin UIs, previews, diff tools. Most applications never need it: typed `t()` for one key at a time is enough.

```ts
const snapshot = i18n.getAll();
const label = snapshot.default.login_button.en;
```

### ICU MessageFormat — grammar lives in the template

Pluralization and gendered phrasing are where naive i18n approaches start to hurt.

The classic **i18next-style** pattern splits one conceptual message across multiple keys — suffixed (`message_one`, `message_other`) or nested under a parent key:

```json
{
  "message_one": "You have 1 message",
  "message_other": "You have {{count}} messages"
}
```

`i18next` picks the right variant automatically from `count`:

```ts
t("message", { count });
```

So the limitation is not manual branching at the call site. It is everything around that API:

- The **key suffix convention** (`_one`, `_other`, `_zero`, `_few`, …) encodes grammar rules in your naming scheme, not in the string itself. It is i18next-specific, not a portable standard like ICU.
- TypeScript sees `message_one` and `message_other` as unrelated keys (or an untyped nested object). Nothing ties them together as one translation with a single `{ count: number }` contract that codegen can enforce.
- A second dimension — gender, case, platform-specific wording — multiplies keys or nesting depth. Two plural branches and two select branches become four leaf strings to keep in sync.
- Translators work on fragmented keys instead of one sentence with inline grammatical branches they can read in context.

**ICU MessageFormat** is a standard designed exactly for this. One key, one template, inline grammatical branches — with `#` for the count inside plural branches:

```json
// translations/default.json
{
  "dashboard_status": {
    "en": "You have {msgCount, plural, one {1 message} other {# messages}} in {chatCount, plural, one {one chat} other {# chats}}",
    "it": "Hai {msgCount, plural, one {1 messaggio} other {# messaggi}} in {chatCount, plural, one {una chat} other {# chat}}"
  }
}
```

At the call site, one typed `t()` with both counts:

```ts
const { t } = i18n.forLocale("en");
t("default", "dashboard_status", { msgCount: 3, chatCount: 2 });
// "You have 3 messages in 2 chats"
```

The codegen step parses ICU syntax and infers parameter types:

| ICU construct                             | Inferred type |
| ----------------------------------------- | ------------- |
| Simple argument `{name}`                  | `string`      |
| `plural` argument `{count, plural, ...}`  | `number`      |
| `select` argument `{gender, select, ...}` | `string`      |
| No variables                              | `never`       |

One key. One parameter object. Grammar lives in the string where translators expect it.

### From canonical authoring to flexible delivery

Authoring is always the same: one multilocale JSON or YAML file per namespace, edited in the repository or synchronized from another system.

```json
{
  "welcome": { "en": "Welcome {name}!", "it": "Benvenuto {name}!" },
  "login_button": { "en": "Login", "it": "Accedi" }
}
```

Codegen reads those canonical files for types, parameter inference, fallback, and audit. The `delivery` option controls only the generated artifacts:

| `delivery`          | What is generated                     | Typical use                                     |
| ------------------- | ------------------------------------- | ----------------------------------------------- |
| `"canonical"`       | One multilocale file per namespace    | Small apps, few locales, simple bundles         |
| `"split-by-locale"` | One file per namespace and locale     | One language per session, CDN caching by locale |
| `"custom"`          | One file per namespace and named area | Regional bundles or grouped language variants   |

This separation matters: optimizing delivery does not create a second authoring format or a second source of truth.

### Split by locale with generated namespace loaders

In multi-namespace mode with `split-by-locale` or `custom` delivery, codegen emits one JSON artifact for every namespace and locale or area, plus typed `namespaceLoaders`. All namespaces are lazy in those modes — load them with the builder before the feature that needs them.

```json
// i18n/i18n.codegen.json
{
  "delivery": "split-by-locale",
  "namespaces": {
    "default": "translations/default.json",
    "billing": "translations/billing.yaml",
    "admin": "translations/admin.json"
  },
  "namespaceLoadersOutput": "generated/namespace-loaders.generated.ts"
}
```

The generated files look like this:

```text
generated/translations/
├── billing.en.json
├── billing.it.json
├── admin.en.json
└── admin.it.json
```

Each loader accepts only a known locale and resolves to the exact schema for its namespace. Load via the builder before rendering the feature that uses them:

```ts
import { createI18n } from "./i18n";

const { t } = await createI18n() // shared engine, initialized empty
  .withNamespaces(["billing", "default"]) // which namespaces to load
  .withLocale("en") // split-by-locale partition passed to loaders
  .load(); // dynamic import + merge; returns locale-bound scope

t("billing", "invoice_summary", { count: 12 });
```

`load()` is async; the returned scope is locale-bound and exposes a synchronous `t()`. If a key was never loaded, `t()` resolves through `onMissing` (default: throw; also `"key"` or a custom function) — not a silent empty label by default.

Reloading the same namespace + locale on a shared engine is skipped, so runtime patches via `scope.set()` (for example, taking fresh values from CMS) are not overwritten by a later default load.

The loader is generated as a finite switch of dynamic imports:

```ts
export const namespaceLoaders = {
  default: (locale: MyProjectLocale) => {
    switch (locale) {
      case "en":
        return import("./translations/default.en.json").then((m) => m.default);
      case "it":
        return import("./translations/default.it.json").then((m) => m.default);
    }
  },
  billing: (locale: MyProjectLocale) => {
    switch (locale) {
      case "en":
        return import("./translations/billing.en.json").then((m) => m.default);
      case "it":
        return import("./translations/billing.it.json").then((m) => m.default);
    }
  },
};
```

In practice:

- **Browser:** one chunk per namespace-locale pair; strings load on first `load()`, not in the initial bundle.
- **Server:** the import reads from disk or the server bundle — not a client fetch.
- **SSR:** a server `load()` does not automatically hydrate the client; the browser loads its own chunk — unless you call `serialize()` and bootstrap the client with `createI18n({ state })`.

Dynamic `import()` is the code-splitting boundary — and it keeps server-to-client handoff flexible when you need it (`serialize()` + `createI18n({ state })`), while still allowing runtime updates to individual namespaces (for example from a CMS) without a full deploy.

### Custom delivery areas

`"delivery": "custom"` uses the same loader model but groups locales into named artifacts that match product or infrastructure boundaries:

```json
{
  "delivery": "custom",
  "deliveryArtifacts": {
    "eu": ["it", "fr", "es", "en"],
    "amer": ["en-US", "es-AR"]
  },
  "namespaces": {
    "default": "translations/default.json",
    "billing": "translations/billing.yaml"
  }
}
```

Codegen produces `billing.eu.json`, `billing.amer.json`, and equivalent files for the other namespaces. Load for the active delivery area:

```ts
import { createI18n } from "./i18n";

const { t } = await createI18n()
  .withNamespaces(["default", "billing"])
  .withDeliveryArea("amer")
  .load();

t("default", "welcome", "en-US", { name: "Ada" });
// forLocale() on the unbound scope is typed to amer locales only
```

Areas can follow geography (`emea`, `amer`, `apac`) or group sibling locales (`es`, `es-MX`, `es-AR`). Fallback is resolved while codegen projects each artifact, so a regional slice can receive values inherited from a parent locale without carrying that parent as a separate runtime locale.

The practical rule is simple: use canonical delivery while dictionaries are modest, split by locale when a session needs one language, and use custom areas when your CDN, backend, or regional deployment naturally ships a small locale group.

### YAML authoring

JSON is fine for short labels. For complex ICU — plurals, multi-parameter templates — **YAML** keeps strings readable without changing the runtime: you author `.yaml` / `.yml`, codegen compiles to JSON, the provider still consumes JSON.

```yaml
# translations/billing.yaml
invoice_summary:
  en: |
    You have {count, plural,
      zero {no invoices}
      one {one invoice}
      other {# invoices}
    }
```

Mixed namespaces (i.e. `default.json` + `billing.yaml`) work out of the box. Authoring details — block scalars and generated output layout — are in the [i18n docs](/v0/infrastructure/i18n/).

---

## Installation

```bash
pnpm --filter YourApp add @xndrjs/i18n zod
pnpm --filter YourApp add -D tsx
pnpm --filter YourApp exec xndrjs-i18n-setup single . --project MyApp   # or: multi
```

Add ICU strings under `i18n/translations/`, wire codegen, run it after every dictionary change:

```json
{
  "scripts": {
    "i18n:codegen": "xndrjs-i18n-codegen --config i18n/i18n.codegen.json",
    "i18n:audit": "xndrjs-i18n-audit --config i18n/i18n.codegen.json"
  }
}
```

```bash
pnpm --filter YourApp run i18n:codegen
```

If you are not in a monorepo, drop the `--filter YourApp` prefix. Config fields, audit flags, and delivery options are in the [i18n docs](/v0/infrastructure/i18n/).

## Recipes

Minimal runtime shapes — pick the row that matches your `i18n.codegen.json`.

### Single vs multi (eager, canonical)

Codegen mode defines the `t()` signature. With `"delivery": "canonical"` and no lazy loaders, `createI18n({ dictionary: defaultDictionary })` returns a **scope** ready to use.

**Single file** — one flat dictionary:

```ts
import { createI18n, defaultDictionary } from "./i18n";

const { t } = createI18n({ dictionary: defaultDictionary });
t("welcome", "en", { name: "Ada" });
const { t: tEn } = createI18n({ dictionary: defaultDictionary }).forLocale("en");
tEn("welcome", { name: "Ada" });
```

**Multi-namespace** — keys grouped by domain (`default`, `billing`, …):

```ts
import { createI18n, defaultDictionary } from "./i18n";

const { t, forLocale } = createI18n({ dictionary: defaultDictionary });
t("default", "welcome", "en", { name: "Ada" });
forLocale("en").t("billing", "invoice_summary", { count: 12 });
```

### Eager vs lazy

|           | Init                                                    | Load translations                                                   |
| --------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| **Eager** | `createI18n({ dictionary: defaultDictionary })` → scope | Dictionary (or `loadOnInit` namespaces) bundled at startup          |
| **Lazy**  | `createI18n()` → builder                                | `await builder.withNamespaces([...]).….load()` → locale-bound scope |

With `split-by-locale` or `custom`, multi mode is always lazy — `createI18n()` returns a builder, not a ready scope.

**Lazy** (multi, when codegen emits `namespaceLoaders`). `t` and `set` can be destructured — scope methods are bound and do not rely on `this`:

```ts
import { createI18n } from "./i18n";

const { t } = await createI18n() // shared engine, empty until load
  .withNamespaces(["billing"]) // which namespaces to fetch
  .withLocale("en") // passed to generated loaders (split/custom)
  .load(); // dynamic import + merge; locale-bound scope

t("billing", "invoice_summary", { count: 12 });
```

Reloading the same namespace + partition on a shared engine is skipped — runtime `scope.set()` patches are not overwritten by a later default load.

**SSR hydrate** — after server `load()`, pass serialized state to the client:

```ts
const i18n = createI18n();
await i18n.load({ namespaces: ["billing"], locale: "en" });
const state = i18n.serialize();

// client
const client = createI18n({ state });
client.peek({ namespaces: ["billing"], locale: "en" }); // loaders skipped when already seeded
```

### Delivery modes

Authoring stays one multilocale file per namespace; `"delivery"` in config only changes generated artifacts and loader partitions. After `withLocale(...).load()`, omit the locale on `t()`; otherwise pass it on each call.

**Canonical** — one multilocale JSON per namespace (all locales in the same file). Eager: `createI18n({ dictionary: defaultDictionary })` (see above).

**Lazy**: the generated loader imports that whole file in one shot — **no locale or area argument**, because the artifact already contains every locale:

```ts
// generated: billing() → import("./translations/billing.json")
const { t } = await createI18n()
  .withNamespaces(["billing"]) // no withLocale / withDeliveryArea
  .load();
t("billing", "invoice_summary", "en", { count: 12 });
```

**Split-by-locale** — codegen emits one JSON per namespace **and** locale (`billing.en.json`, `billing.it.json`, …). The loader needs to know which file to import, so the builder passes the active locale via `withLocale(...)`:

```ts
const { t } = await createI18n().withNamespaces(["billing"]).withLocale("it").load();
t("billing", "invoice_summary", { count: 3 });
```

**Custom areas** — same idea as split-by-locale, but the partition is a **delivery area** (`eu`, `amer`, …) that groups several locales into one regional artifact. Use `withDeliveryArea(...)` instead of `withLocale(...)`:

```ts
const { t } = await createI18n()
  .withNamespaces(["default", "billing"])
  .withDeliveryArea("eu")
  .load();
t("default", "welcome", "it", { name: "Ada" });
```

---

## Locale fallback

Real products rarely ship every string in every locale on day one. **Partial locales become first-class citizens**: `de-CH` overrides only what differs from `de-DE`; the rest resolves through a configured chain.

```json
// i18n/i18n.codegen.json
"localeFallback": {
  "en": null,
  "de-DE": "en",
  "de-CH": "de-DE"
}
```

Codegen emits `LOCALE_FALLBACK` and wires it into the generated factory (`createI18n({ dictionary: defaultDictionary })` or `createI18n()`). If the chain cannot resolve a key, `t()` throws with the path it tried.

### Fallback inside delivery slices

Codegen applies fallback while materializing delivery JSON, in order to keep every delivery artifact self-sufficient. The rules differ by mode:

**Split-by-locale** — one locale per file (`billing.de-CH.json`). Codegen walks the full fallback chain for that locale and writes a **complete** slice: every key resolves to the string the runtime would use for `de-CH`, including values inherited from `de-DE` or `en` when `de-CH` is missing in the canonical source.

**Custom areas** — one file groups several locales (`billing.eu.json`). Locales whose fallback target is **outside** the area are resolved at codegen (same as split-by-locale). Locales whose fallback target is **inside** the same area stay **partial**: codegen copies only what is authored for that locale, because the area artifact is meant to load standalone and runtime fallback between co-located locales still applies via `LOCALE_FALLBACK`.

That keeps the runtime payload as small as possible without changing the canonical authoring files or weakening fallback guarantees.

### Translation audit

Partial locales and fallback chains make it easy to ship fast — but hard to see what is still missing. `xndrjs-i18n-audit` reads the same `i18n/i18n.codegen.json` as codegen and emits a JSON report of gaps per namespace and locale:

```bash
pnpm exec xndrjs-i18n-audit --config i18n/i18n.codegen.json
pnpm exec xndrjs-i18n-audit --config i18n/i18n.codegen.json --out audit.json
pnpm exec xndrjs-i18n-audit --config i18n/i18n.codegen.json --fail-on effective
```

Report-only by default; `--fail-on effective`, `direct`, or `any` gates CI. Field definitions (`missingDirect`, `missingEffective`) are in the [i18n docs](/v0/infrastructure/i18n/).

---

## Final words

`@xndrjs/i18n` is a small, deliberate stack: canonical ICU dictionaries (JSON or YAML at authoring time) as the source of truth, codegen that turns templates into TypeScript contracts and delivery artifacts, and a runtime provider that formats, caches, and fails loudly when something is wrong.

There are no React, Vue, or Next.js wrappers yet — for now, that is intentional. `@xndrjs/i18n` is still an experimental package, and the focus is on the core: a typed engine with scopes (`t()`, `forLocale()`), a fluent builder for lazy loading, and `scope.set()` for runtime patches — enough to wire into any framework with a thin hook or context of your own.

The delivery shape can evolve independently from authoring: start with canonical files, move to per-locale chunks as the language matrix grows, or introduce named regional areas when infrastructure demands it. Generated namespace loaders keep those boundaries typed and make the asynchronous part explicit.

If some of the problems in this article sound familiar — typos shipping silently, plural keys multiplying, every visitor downloading every locale — and the `@xndrjs/i18n` approach interests you, give it a try.

---

**Related Links**

- [Docs: i18n](/v0/infrastructure/i18n/)
- [GitHub: @xndrjs/i18n](https://github.com/xndrjs/toolkit/tree/main/packages/i18n)
- [Related: Generating Zod schemas from Contentful](/blog/generating-zod-schemas-from-contentful/)
