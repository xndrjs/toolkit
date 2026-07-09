---
title: "Type-safe i18n with runtime overrides: why I built @xndrjs/i18n"
description: The real needs behind a modern i18n library — type-safe keys and parameters, CMS-friendly runtime updates, ICU MessageFormat, and lazy namespace loading.
date: 2026-07-05
author: Fabio Fognani
tags:
  - i18n
  - typescript
  - icu
---

Every frontend project eventually needs translations. The first integration is usually quick: pick a library, drop JSON files in a folder, wire up a hook or a helper, ship.

Then the product grows. Editorial teams want to change copy without waiting for a deploy. Pluralization rules get weird. Someone typos a key in a component and nothing fails until QA. A mega-site starts shipping every locale in the initial bundle because nobody planned for lazy loading.

Those are not exotic edge cases. They are the normal lifecycle of i18n in a TypeScript codebase tied to a CMS.

I built [`@xndrjs/i18n`](https://github.com/xndrjs/toolkit/tree/main/packages/i18n) to address them directly — compiler-first, ICU-native, and designed for runtime dictionary overrides without giving up type safety.

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

### 3. Runtime updates — editorial copy should not require a full rebuild

In a CMS-driven product, labels change constantly. A marketing team tweaks a CTA. Legal updates a disclaimer. Product renames a feature.

If translations live only inside static JSON bundled at build time, every label change flows through the same pipeline as a code change: commit, CI, deploy. On a large editorial site that is expensive noise.

What you want instead:

- **Local JSON as typed fallbacks** — the app still works offline, in tests, and on first paint.
- **Runtime hydration** — fetch updated strings from a CMS or API and swap them in without rebuilding.
- **Validation at the boundary** — external payloads are `unknown` until you prove they match the expected shape.

The build-time dictionary defines the contract. The runtime dictionary can override the values.

### 4. Lazy loading — when "all translations upfront" does not scale

A small app can afford to ship every locale in the initial bundle. A product with dozens of namespaces — onboarding, billing, admin, marketing, error pages — cannot.

Lazy loading translations by route or feature reduces:

- initial JavaScript bundle size
- time-to-interactive on first visit
- wasted fetch for locales and domains the user may never open

The catch: lazy loading must be **explicit**. Silent fallbacks to missing keys hide integration bugs. You want a clear signal when a namespace was not loaded yet, not a blank label in production.

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

At runtime, `.get()` is typed against that schema:

```ts
i18n.get("default", "welcome", "en", { name: "Ada" }); // ✓
i18n.get("default", "welcome", "en"); // ✗ compile error — missing { name }
i18n.get("billing", "login_button", "it"); // ✗ compile error — key not in namespace
```

Add a key to a dictionary file, re-run codegen, and TypeScript flags every call site that needs updating. That is the loop that keeps UI code and dictionary in sync.

### Single file vs multi-namespace

Codegen runs in one of two modes — you pick at config time, and the
generated API follows. Small project? **Single file** — one dictionary, two-argument `.get(key, locale)`.

Large project? **Multi-namespace** — split by domain (`default`, `billing`, …), three-argument `.get(namespace, key, locale)`, plus `setNamespace()` and `loadOnInit` for lazy loading.

Same runtime, different generated API:

```ts
i18n.get("welcome", "en", { name: "Ada" }); // single
i18n.get("default", "welcome", "en", { name: "Ada" }); // multi
```

### Dynamic access when you need it

`getAll()` exposes the current dictionary for tooling and administrative use cases:

```ts
const snapshot = i18n.getAll();
const label = snapshot.default.login_button.en;
```

Codegen gives you precise types for the happy path. `getAll()` keeps
escape hatches open for tooling that genuinely needs to iterate.

### Build-time values are defaults, not prisons

Local JSON files are **typed fallbacks**, not the only source of truth forever.

At runtime you can replace the entire dictionary or patch a single namespace:

```ts
// Full override — replaces everything, clears the compilation cache
i18n.setAll(externalPayload);

// Partial patch — updates one namespace, invalidates only its cache entries
i18n.setNamespace("billing", externalBillingPayload);
```

Compiled `IntlMessageFormat` instances are cached per locale (and per namespace in multi mode). Overrides invalidate the relevant cache entries so the next `.get()` picks up fresh strings.

When translations arrive from a CMS, validate before hydrating:

```ts
import { formatIssues } from "@xndrjs/i18n/validation";
import { validateExternalDictionary } from "./i18n/generated/dictionary-schema.generated.js";

const raw: unknown = await loadTranslations();
const result = validateExternalDictionary(raw);

if (!result.ok) {
  console.error(formatIssues(result.issues));
  return;
}

i18n.setAll(result.data);
```

Codegen can emit Zod-backed validators that check both structure and ICU parameter compatibility against your static `Params` schema. Malformed remote payloads fail at the boundary — not inside a random component three layers deep.

### ICU MessageFormat — one key, many grammatical shapes

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

At the call site, one typed `.get()` with both counts:

```ts
i18n.get("default", "dashboard_status", "en", { msgCount: 3, chatCount: 2 });
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

### Lazy loading by namespace — with explicit errors

In multi-namespace mode, you can split dictionaries across chunks. List only the namespaces you need at startup in `loadOnInit`; everything else loads on demand:

```json
// i18n/i18n.codegen.json
{
  "namespaces": {
    "default": "translations/default.json",
    "billing": "translations/billing.yaml",
    "admin": "translations/admin.json"
  },
  "loadOnInit": ["default"],
  "namespaceLoadersOutput": "generated/namespace-loaders.generated.ts"
}
```

Codegen emits typed `namespaceLoaders` — dynamic `import()` per lazy namespace. Register with `setNamespace()` (optionally after `projectNamespaceLocales`). For CMS/API payloads, fetch and validate yourself, then `setNamespace()`.

```ts
import { i18n, namespaceLoaders } from "./i18n";

i18n.get("default", "login_button", "en"); // available immediately

if (!i18n.hasNamespace("billing")) {
  i18n.setNamespace("billing", await namespaceLoaders.billing());
}
i18n.get("billing", "invoice_summary", "en", { count: 12 });
```

Of course, `.get()` stays synchronous — preload _before_ rendering. If you forget, the library throws explicitly instead of returning an empty string.

Bundle size depends on how many namespaces and locales you choose to ship. Lazy namespaces and runtime projection (below) let you keep both under control.

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

Mixed namespaces (i.e. `default.json` + `billing.yaml`) work out of the box. Authoring details — block scalars, generated output layout, CMS validation — are in the [i18n docs](/v0/infrastructure/i18n/).

---

## Quick setup

```bash
pnpm --filter YourApp add @xndrjs/i18n
pnpm --filter YourApp add -D tsx
pnpm --filter YourApp exec xndrjs-i18n-setup multi . --project MyApp
```

Add ICU strings under `i18n/translations/`, wire codegen, run it:

```json
// package.json
{
  "scripts": {
    "i18n:codegen": "xndrjs-i18n-codegen --config i18n/i18n.codegen.json"
  }
}
```

```bash
pnpm --filter YourApp run i18n:codegen
```

Use the generated factory:

```ts
import { createI18n } from "./i18n/generated/instance.generated.js";
import { defaultDictionary } from "./i18n/generated/dictionary.generated.js";

export const i18n = createI18n(defaultDictionary);
i18n.get("default", "welcome", "en", { name: "Ada" });
```

For locale-bound call sites, bind once and drop the locale argument
on every `.get()`:

```ts
const i18nEn = i18n.forLocale("en");
i18nEn.get("default", "welcome", { name: "Ada" });
```

If you are not in a monorepo, drop the `--filter YourApp` part from the commands above. Full setup options are in the [i18n docs](/v0/infrastructure/i18n/).

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

Codegen emits `LOCALE_FALLBACK` and wires it into `createI18n(dictionary)`. If the chain cannot resolve a key, `.get()` throws with the path it tried.

### `projectLocales`

Lazy namespaces split the dictionary by **domain** — billing does not ship with the landing page. That helps, but each loaded namespace still carries **every locale** for every key. In production you usually render **one locale at a time** (sometimes a small regional group — i.e. APAC — not thirty languages at once).

Codegen emits typed helpers: **`projectLocales`** for the full schema (`setAll`), and in multi mode **`projectNamespaceLocales`** for one namespace (`setNamespace`). Both keep only the locales you pass in and resolve `LOCALE_FALLBACK` like `.get()`.

```ts
import {
  createI18n,
  projectNamespaceLocales,
  projectLocales,
} from "./i18n/generated/instance.generated.js";
import { defaultDictionary } from "./i18n/generated/dictionary.generated.js";

const i18n = createI18n(defaultDictionary);
i18n.setNamespace("billing", projectNamespaceLocales(billingDictionary, [userLocale]));
i18n.setAll(projectLocales(fullDictionary, [userLocale])); // multi: all namespaces
```

Typical ways to use it:

1. **On-demand API** — an endpoint receives `locale` (and namespace), loads the full dictionary from your CMS or storage, runs `projectNamespaceLocales` (or `projectLocales` for the full schema), returns JSON.

2. **Cache per locale** — at build or sync time, precompute with `projectNamespaceLocales` and store in Redis. Each request fetches a small blob instead of the full multilingual file.

3. **Static files in `public/`** — codegen compiles YAML/JSON; a build step writes `public/i18n/billing.de-CH.json`, `public/i18n/billing.it.json`, etc. The app fetches the file for the active locale and passes it to `setNamespace` after validation.

Same pattern everywhere: **full dictionary as source of truth**, **projected slice at the boundary**, typed hydration at runtime.

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

`@xndrjs/i18n` is a small, deliberate stack: ICU dictionaries (JSON or YAML at authoring time) as the source of truth, codegen that turns templates into TypeScript contracts, and a runtime provider that formats, caches, overrides, and fails loudly when something is wrong.

There are no React, Vue, or Next.js wrappers — on purpose. The vanilla API is a typed provider with `.get()`, `forLocale()`, and optional async preload: enough to wire into any framework with a thin hook or context of your own. `@xndrjs/i18n` does not barge into your stack with opinionated lifecycle or rendering assumptions. You import `createI18n(dictionary)`, call it where it fits, and keep your UI layer in charge.

Runtime overrides and optional Zod validation mean editorial workflows do not have to fight your deploy pipeline. Local JSON keeps tests and first paint predictable; a CMS payload can replace or patch the dictionary when it arrives. The same primitives stay flexible enough to match however your project splits and fetches translations — lazy namespaces, per-locale projection, API hydration — and scale with you as those policies evolve.

If i18n in your project has been "fine until it wasn't" — typos shipping silently, plural keys multiplying, every label change waiting on CI — this is the shape of tooling you wanted: strict where it helps, flexible where products actually live.

---

**Related Links**

- [Docs: i18n](/v0/infrastructure/i18n/)
- [GitHub: @xndrjs/i18n](https://github.com/xndrjs/toolkit/tree/main/packages/i18n)
- [Related: Generating Zod schemas from Contentful](/latest/blog/generating-zod-schemas-from-contentful/)
