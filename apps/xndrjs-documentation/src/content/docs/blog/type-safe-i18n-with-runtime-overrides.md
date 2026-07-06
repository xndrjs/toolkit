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

At build time, `xndrjs-i18n-codegen` reads your ICU JSON, parses every string with `@formatjs/icu-messageformat-parser`, and generates exact TypeScript types for keys and parameters:

```ts
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

Add a key to JSON, re-run codegen, and TypeScript flags every call site that needs updating. That is the loop that keeps UI code and dictionary in sync.

### Single file vs multi-namespace

Codegen runs in one of two modes — you pick at config time, and the generated API follows.

**Single-file mode** is the flat setup: one JSON dictionary, one provider, a two-argument `.get()`:

```ts
i18n.get("login_button", "it");
i18n.get("welcome", "en", { name: "Ada" });
```

It fits smaller apps and early integrations — less structure to maintain, no namespace argument at every call site. Runtime override is `setAll()` only; there is no per-slice patching and no namespace-level lazy loading.

**Multi-namespace mode** splits the dictionary by domain — `default`, `billing`, `admin`, each in its own JSON file — and exposes a namespaced API:

```ts
i18n.get("default", "login_button", "it");
i18n.get("billing", "invoice_summary", "en", { count: 12 });
```

That is the mode you want when the dictionary outgrows a single file: clearer ownership per team or feature, `setNamespace()` for partial CMS updates, and `loadOnInit` for code-splitting. Codegen emits `I18N_MODE = 'multi'` and types keyed by namespace so a typo in `"billing"` vs `"default"` is still a compile error.

You can start single and migrate later — split the JSON, swap `dictionary` for `namespaces` in `i18n.codegen.json`, re-run codegen, and update call sites from `get(key, locale)` to `get(namespace, key, locale)`.

### Dynamic access when you need it

Type safety does not mean locking you into only `.get()`.

The provider exposes `getAll()` — a deep-frozen snapshot of the current dictionary. You can walk namespaces and keys with plain object access when building admin tools, translation diff views, or CMS preview panels:

```ts
const snapshot = i18n.getAll();
const label = snapshot.default.login_button.en;
```

Codegen gives you precise types for the happy path. `getAll()` keeps escape hatches open for tooling that genuinely needs to iterate.

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
{
  "namespaces": {
    "default": "translations/default.json",
    "billing": "translations/billing.json",
    "admin": "translations/admin.json"
  },
  "loadOnInit": ["default"],
  "namespaceLoadersOutput": "generated/namespace-loaders.generated.ts"
}
```

Codegen emits dynamic `import()` loaders and a typed `ensureNamespacesLoaded()` helper:

```ts
import { i18n, ensureNamespacesLoaded } from "./i18n";

i18n.get("default", "login_button", "en"); // available immediately

await ensureNamespacesLoaded(i18n, ["billing"]);
i18n.get("billing", "invoice_summary", "en", { count: 12 });
```

`.get()` stays synchronous — preload lazy namespaces before rendering the UI that needs them.

If you forget, the library throws explicitly:

```text
[i18n] Namespace not loaded: "billing". Call ensureNamespacesLoaded(i18n, ["billing"]) first.
```

No silent empty strings. No guessing whether the key is missing or the namespace was never fetched.

When `loadOnInit` is omitted, behavior stays simple: all namespaces are statically imported, same as a traditional setup.

### What actually affects bundle size

It helps to separate three layers:

**Runtime library** — `@xndrjs/i18n` plus `intl-messageformat`. Fixed cost on every page that calls `.get()`. The codegen CLI and generated TypeScript types are build-time artifacts; they do not ship to the browser.

**Bundled dictionary** — whatever JSON your generated `dictionary.generated.ts` statically imports. In single mode, that is the whole file. In multi mode without `loadOnInit`, every namespace. Each key typically carries **all locales** for that key in one object, so the JSON weight scales with `keys × locales`, not just the locale the user picked.

**On-demand and remote copy** — lazy namespaces (`loadOnInit` + `ensureNamespacesLoaded`) move whole namespace files into separate async chunks, so billing copy does not ride along with the landing page. Runtime overrides from a CMS push updated strings over the network instead of through a redeploy; the bundled JSON remains typed fallbacks for first paint, tests, and offline.

There is no magic shrink for "all locales, all keys, all upfront." The levers are: split by namespace, load namespaces when a route needs them, and hydrate editorial strings at runtime when you do not want every label change to pass through the JS bundle at all.

---

## Quick setup

Scaffold starter files by first installing `@xndrjs/i18n` in your project:

```bash
pnpm add @xndrjs/i18n
pnpm add -D tsx
```

Of course add `--filter` if you're using a monorepo and want to install `@xndrjs/i18n` in a specific app or package:

```bash
pnpm --filter YourAppOrPackageName add @xndrjs/i18n
pnpm --filter YourAppOrPackageName add -D tsx
```

Then run the setup:

```bash
pnpm exec xndrjs-i18n-setup multi . --project MyApp
```

or, if you're using a monorepo:

```bash
pnpm --filter YourAppOrPackageName exec xndrjs-i18n-setup multi . --project MyApp
```

Add your ICU strings under `i18n/translations/`, wire codegen into `package.json`

```json
{
  "scripts": {
    "i18n:codegen": "xndrjs-i18n-codegen --config i18n/i18n.codegen.json"
  }
}
```

then run it

```bash
pnpm run i18n:codegen
# or, in a monorepo
pnpm --filter YourAppOrPackageName i18n:codegen
```

Use the generated factory:

```ts
import { createI18n } from "./i18n/generated/instance.generated.js";

export const i18n = createI18n();

i18n.get("default", "login_button", "it"); // "Accedi"
i18n.get("default", "welcome", "en", { name: "Ada" }); // "Welcome Ada!"
```

For locale-bound call sites, bind once and drop the locale argument on every `.get()`:

```ts
const i18nEn = i18n.forLocale("en");
i18nEn.get("default", "login_button");
i18nEn.get("default", "welcome", { name: "Ada" });
```

---

## Locale fallback

Real products rarely ship every string in every locale, especially on day one. At the same time, falling back to one global default for everything is too blunt.

Some locales are **intentionally partial** — they define only the keys that differ from a sibling locale. Latin American Spanish can reuse almost all of `es-ES` and override a handful of labels. `en-US` can match `en` except for some spelling or legal copy. You do not need to duplicate the full dictionary for every regional variant; the fallback chain fills in whatever was left undefined.

Configure a **locale fallback map** in `i18n/i18n.codegen.json`. When `.get()` is called for a locale that has no template for that key (`undefined` in the dictionary), the provider walks the chain before throwing:

```json
"localeFallback": {
  "en": null,
  "de-DE": "en",
  "de-CH": "de-DE",
  "it": "en"
}
```

`null` marks a terminal locale — no further fallback. Any other value is the next locale to try, recursively. So `de-CH` can fall back to `de-DE`, then to `en`, while `en` stops at the end of the chain.

An empty string `""` is treated as a deliberate template and does **not** trigger fallback — useful when a locale intentionally renders blank.

Codegen emits `LOCALE_FALLBACK` and extends your locale union type to include fallback locales. The generated `createI18n()` factory wires the map in automatically. If the chain exhausts without finding a template, `.get()` throws and includes the full path it tried — same explicit-error philosophy as missing namespaces.

---

## Final words

`@xndrjs/i18n` is a small, deliberate stack: ICU JSON as the source of truth, codegen that turns templates into TypeScript contracts, and a runtime provider that formats, caches, overrides, and fails loudly when something is wrong.

There are no React, Vue, or Next.js wrappers — on purpose. The vanilla API is a typed provider with `.get()`, `forLocale()`, and optional async preload: enough to wire into any framework with a thin hook or context of your own. `@xndrjs/i18n` does not barge into your stack with opinionated lifecycle or rendering assumptions. You import `createI18n()`, call it where it fits, and keep your UI layer in charge.

Runtime overrides and optional Zod validation mean editorial workflows do not have to fight your deploy pipeline. Local JSON keeps tests and first paint predictable; a CMS payload can replace or patch the dictionary when it arrives.

If i18n in your project has been "fine until it wasn't" — typos shipping silently, plural keys multiplying, every label change waiting on CI — this is the shape of tooling you wanted: strict where it helps, flexible where products actually live.

---

**Related Links**

- [Docs: i18n](/v0/infrastructure/i18n/)
- [GitHub: @xndrjs/i18n](https://github.com/xndrjs/toolkit/tree/main/packages/i18n)
- [Related: Generating Zod schemas from Contentful](/latest/blog/generating-zod-schemas-from-contentful/)
