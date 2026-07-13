# @xndrjs/i18n

A **compiler-first, type-safe i18n system** based on the [ICU MessageFormat](https://formatjs.github.io/docs/core-concepts/icu-syntax/) standard, with **runtime dictionary overrides from external sources** (no rebuild required).

The core idea: your ICU strings live in local JSON files that act as **type-safe fallbacks**. A build-time codegen step parses the ICU AST and generates exact TypeScript types for every translation key and its parameters. At runtime, a centralized provider caches compiled messages and lets you replace the whole dictionary (or a single namespace) on the fly from any source (i.e. a CMS).

## Key features

- **Type-safe `t()`** — the compiler knows exactly which parameters each key requires (`string`, `number`, or none).
- **ICU MessageFormat** — full support for interpolation, plurals, and select.
- **Runtime override** — patch individual translation keys from an external source via `scope.set()` on locale-bound scopes (after `load()`), without rebuilding.
- **Single-file or multi-namespace** — one flat dictionary, or multiple JSON files each bound to a namespace.
- **Lazy namespace loading** — optional code-splitting via `loadOnInit` and generated `namespaceLoaders` (multi mode).
- **Hot compilation cache** — compiled `IntlMessageFormat` instances are cached and invalidated on override.
- **Explicit runtime errors** — malformed ICU (e.g. a corrupt remote payload) or missing parameters throw descriptive errors.
- **Translation audit** — `xndrjs-i18n-audit` reports missing locales per key (direct vs effective after fallback); optional CI gate via `--fail-on`.
- **Publishable library** — the runtime and codegen live in a standalone package (`@xndrjs/i18n`) that carries no project-specific types.

## Getting started

### Install

```bash
npm install @xndrjs/i18n zod
npm install -D tsx
```

`tsx` and `zod` are **peer dependencies** of `@xndrjs/i18n`:

- **`tsx`** — required by `xndrjs-i18n-codegen` and `xndrjs-i18n-audit` (CLIs run TypeScript directly). Install as a **devDependency** — only needed at build/CI time.
- **`zod`** — required by codegen/audit config validation (`i18n.codegen.json`) and by `@xndrjs/i18n/validation` when using `dictionarySchemaOutput` and `validateExternalDictionary()`. Use a **devDependency** if validation runs only at build time; a regular **dependency** if you validate CMS payloads in production.

### Quick setup (single file)

**1. Translation JSON** (`i18n/translations/translations.json`):

```json
{
  "login_button": { "en": "Login", "it": "Accedi" },
  "welcome": { "en": "Welcome {name}!" }
}
```

**2. Codegen config** (`i18n/i18n.codegen.json`):

```json
{
  "dictionary": "translations/translations.json",
  "typesOutput": "generated/i18n-types.generated.ts",
  "dictionaryOutput": "generated/dictionary.generated.ts",
  "instanceOutput": "generated/instance.generated.ts",
  "paramsTypeName": "MyProjectParams",
  "schemaTypeName": "MyProjectSchema"
}
```

**3. npm script** (`package.json`):

```json
{
  "scripts": {
    "i18n:codegen": "xndrjs-i18n-codegen --config i18n/i18n.codegen.json",
    "i18n:audit": "xndrjs-i18n-audit --config i18n/i18n.codegen.json"
  }
}
```

**4. Generate and audit:**

```bash
npm run i18n:codegen
npm run i18n:audit
```

```ts
// i18n/index.ts
import { createI18n } from "./generated/instance.generated.js";
import { defaultDictionary } from "./generated/dictionary.generated.js";

export * from "./generated/instance.generated.js";
export * from "./generated/dictionary.generated.js";
export * from "./generated/i18n-types.generated.js";

export const i18n = createI18n(defaultDictionary);
```

```ts
import { i18n } from "./i18n";

i18n.t("login_button", "it"); // "Accedi"
i18n.t("welcome", "en", { name: "Ada" }); // "Welcome Ada!"
```

Run codegen after every change to your JSON files (or wire it into your build).

Or scaffold the starter files with the setup CLI:

```bash
xndrjs-i18n-setup single . --project MyApp
xndrjs-i18n-setup multi apps/myapp --project MyApp
```

This creates `i18n/i18n.codegen.json`, starter translation JSON, and `i18n/index.ts` under the target directory. Pass `src` as the target directory if your project uses a `src/` layout (`src/i18n/`). Edit the config for lazy loading, validation, locale fallback, and extra namespaces, then run codegen.

### Quick setup (multi namespace)

Use `namespaces` instead of `dictionary` in `i18n/i18n.codegen.json`. See [Configuration](#configuration-i18ncodegenjson) and the [multi-namespace example](#multi-namespace-example) below.

For lazy loading, add `loadOnInit` and `namespaceLoadersOutput` — see [Lazy namespace loading](#lazy-namespace-loading-multi-mode). Add `dictionarySchemaOutput` only when you validate external CMS/API payloads.

## Repository layout

This package lives in the xndrjs-toolkit pnpm monorepo.

```
xndrjs-toolkit/
├── packages/
│   └── i18n/                       # @xndrjs/i18n — the publishable library
│       ├── bin/
│       │   ├── codegen.mjs         # CLI entry: xndrjs-i18n-codegen
│       │   └── audit.mjs           # CLI entry: xndrjs-i18n-audit
│       └── src/
│           ├── index.ts            # public exports
│           ├── types.ts            # generic dictionary/cache types
│           ├── IcuTranslationProviderSingle.ts
│           ├── IcuTranslationProviderMulti.ts
│           └── codegen/
│               └── generate-i18n-types.ts
└── apps/
    └── i18n-demo/                  # @xndrjs/i18n-demo — workshop app
        ├── single/                 # single-file example (config at sub-project root)
        │   ├── i18n.codegen.json
        │   └── src/i18n/
        └── multi/                  # multi-namespace example
            ├── i18n.codegen.json
            └── src/i18n/
```

A typical consumer app scaffolded with `xndrjs-i18n-setup single .` colocates everything under `i18n/`:

```
my-app/
└── i18n/
    ├── i18n.codegen.json
    ├── index.ts
    ├── generated/
    └── translations/
```

For a `src/` layout, run `xndrjs-i18n-setup single src` instead:

```
my-app/
└── src/
    └── i18n/
        ├── i18n.codegen.json
        ├── index.ts
        ├── generated/
        └── translations/
```

### Library vs. consumer

`@xndrjs/i18n` is **generic** and never imports project-specific types. It exposes two provider classes parametrized by `Schema` and `Params` generics, plus the codegen CLI.

The consumer app owns its ICU JSON, its codegen config, and the generated files that bind the generic providers to concrete types.

### 1. Source JSON

Each translation key maps locale codes to ICU strings. Structure is identical in both modes: `key -> locale -> ICU string`.

```json
{
  "login_button": { "it": "Accedi", "en": "Login" },
  "welcome": { "it": "Benvenuto {name}!", "en": "Welcome {name}!" },
  "dashboard_status": {
    "it": "Hai {msgCount, plural, one {1 messaggio} other {{msgCount} messaggi}} in {chatCount, plural, one {una chat} other {{chatCount} chat}}",
    "en": "You have {msgCount, plural, one {1 message} other {{msgCount} messages}} in {chatCount, plural, one {one chat} other {{chatCount} chats}}"
  }
}
```

### 2. Codegen (build-time)

`xndrjs-i18n-codegen` reads `i18n.codegen.json` (by default `i18n/i18n.codegen.json`), parses every ICU string with `@formatjs/icu-messageformat-parser`, and infers parameter types:

| ICU construct                             | Inferred type |
| ----------------------------------------- | ------------- |
| Simple argument `{name}`                  | `string`      |
| `plural` argument `{count, plural, ...}`  | `number`      |
| `select` argument `{gender, select, ...}` | `string`      |
| No variables                              | `never`       |

Variables found across **all locales** of the same key are merged. If parsing fails for any key/locale, codegen prints a contextual error and exits with a non-zero code (so it blocks CI/builds).

### 3. Generated files

- **`i18n-types.generated.ts`** — `I18N_MODE`, `MyProjectParams`, `MyProjectSchema`. With `delivery: "custom"`, also `MyProjectDeliveryArea`, `DELIVERY_ARTIFACTS`, `LOCALE_DELIVERY_AREA`, and `MyProjectDeliveryArtifacts`.
- **`dictionary.generated.ts`** — imports the JSON files and exports `defaultDictionary` (canonical delivery) or `defaultDictionaryFor(locale)` / `defaultDictionaryFor(area)` when eager namespaces exist in split/custom delivery. Omitted when every namespace is lazy in split/custom delivery.
- **`instance.generated.ts`** — exports `createI18n(dictionary)` (required argument; no default import of the fallback dictionary), typed `projectDictionaryLocales()` (full schema), and in multi mode `projectNamespaceLocales()` (single namespace); with `delivery: "custom"`, also `projectDictionaryForDeliveryArea()` and `projectNamespaceForDeliveryArea()`; `LOCALE_FALLBACK` wired in when configured.
- **`i18n.ts`** (optional, hand-written) — app-owned singleton if desired.

Example generated types (multi-namespace):

```ts
export const I18N_MODE = "multi" as const;

export type MyProjectParams = {
  default: {
    login_button: never;
    welcome: { name: string };
    dashboard_status: { msgCount: number; chatCount: number };
  };
  user: {
    profile_title: never;
    greeting: { name: string };
  };
  billing: {
    invoice_summary: { count: number };
  };
};

export type MyProjectSchema = {
  default: {
    login_button: Partial<Record<MyProjectLocale, string>>;
    welcome: Partial<Record<MyProjectLocale, string>>;
    dashboard_status: Partial<Record<MyProjectLocale, string>>;
  };
  user: {
    profile_title: Partial<Record<MyProjectLocale, string>>;
    greeting: Partial<Record<MyProjectLocale, string>>;
  };
  billing: {
    invoice_summary: Partial<Record<MyProjectLocale, string>>;
  };
};
```

### 4. Runtime provider

Create a provider with the generated factory (no side effects at import time). Pass the dictionary explicitly — from codegen’s `dictionary.generated.ts`, from lazy loaders, or from an external source — so the factory module does not pull fallback JSON into your bundle:

```ts
import { createI18n } from "./i18n";
import { defaultDictionary } from "./i18n/generated/dictionary.generated.js";

const i18n = createI18n(defaultDictionary);
// or with an external dictionary at init:
const i18n = createI18n(externalDictionary);
```

Optionally, wrap it in an app-owned singleton (`i18n.ts`):

```ts
import { createI18n } from "./instance.generated.js";
import { defaultDictionary } from "./dictionary.generated.js";
export const i18n = createI18n(defaultDictionary);
```

### Locale-bound provider (`forLocale`)

Bind a locale once and omit it on every `t()`:

```ts
const i18n = createI18n(defaultDictionary);
const i18nEn = i18n.forLocale("en");

i18nEn.t("login_button"); // single-file
i18nEn.t("welcome", { name: "Ada" });

const i18nIt = i18n.forLocale("it");
i18nIt.t("default", "login_button"); // multi-namespace
i18nIt.t("billing", "invoice_summary", { count: 3 });
```

The bound scope shares the parent dictionary, cache, and fallback rules. It exposes `locale` and a narrower `t()` signature.

Because `Params[K]` (or `Params[NS][K]`) is used in a conditional rest parameter, TypeScript enforces the exact argument shape:

```ts
...params: Params[NS][K] extends never ? [] : [params: Params[NS][K]]
```

### 5. Locale fallback

When a translation is missing for the requested locale (`undefined` in the dictionary), the provider can walk a fallback chain before throwing. An empty string `""` is treated as a valid template and does **not** trigger fallback.

```json
"localeFallback": {
  "en": null,
  "de-DE": "en",
  "de-CH": "de-DE",
  "it": "en"
}
```

- `null` marks a terminal locale (no further fallback).
- Any other value is the next locale to try, recursively.
- If the chain ends without finding a template, `t()` throws and includes the full chain in the error message.

Codegen emits `LOCALE_FALLBACK` and extends `MyProjectLocale` with the fallback locales. The generated factory wires the map into the provider automatically.

When `localeFallback` is present in config, codegen **enriches** the generated map: every locale in `MyProjectLocale` that is missing from your config is added with `null` (explicit terminal — no fallback chain). Runtime behavior is unchanged; the map is simply complete. If `localeFallback` is omitted from config, no `LOCALE_FALLBACK` is emitted (current behavior).

You can also pass a fallback map manually when constructing a provider:

```ts
import { IcuTranslationProviderMulti, type LocaleFallbackMap } from "@xndrjs/i18n";

const localeFallback = {
  en: null,
  "de-CH": "en",
} satisfies LocaleFallbackMap;

const i18n = new IcuTranslationProviderMulti(schema, { localeFallback });
```

#### `projectDictionaryLocales` / `projectNamespaceLocales`

Namespaces split the dictionary by domain; locale projection splits it by **locale**. Use with `load()` + `scope.set()` when ingesting external payloads for a single locale (or a small regional group) in memory.

```ts
import { createI18n } from "./i18n/generated/instance.generated.js";
import { validateExternalKey } from "./i18n/generated/dictionary-schema.generated.js";
import {
  projectDictionaryLocales,
  projectNamespaceLocales,
} from "./i18n/generated/instance.generated.js";
import billingDictionary from "./i18n/translations/billing.json";

const scope = await createI18n({}).withNamespaces(["billing"]).withLocale(activeLocale).load();

// Optional: validate a projected slice, then patch one key
const billingEn = projectNamespaceLocales(billingDictionary, [activeLocale]);
const result = validateExternalKey("billing", "invoice_summary", billingEn.invoice_summary);
if (result.ok) {
  scope.set("billing", "invoice_summary", result.data.invoice_summary[activeLocale]!);
}
```

Codegen emits typed wrappers in `instance.generated.ts` (`projectDictionaryLocales` for the full schema; `projectNamespaceLocales` in multi mode for one namespace). With `delivery: "custom"`, it also emits `projectDictionaryForDeliveryArea` and `projectNamespaceForDeliveryArea`. The low-level `@xndrjs/i18n` exports are `*Core` helpers for tooling without codegen.

### 6. Translation audit (`xndrjs-i18n-audit`)

Report missing translations as JSON — useful for translator backlogs and optional CI gates.

```bash
xndrjs-i18n-audit --config i18n/i18n.codegen.json
xndrjs-i18n-audit --config i18n/i18n.codegen.json --out audit.json
xndrjs-i18n-audit --config i18n/i18n.codegen.json --fail-on effective
```

**`requiredLocales`** in the report match generated `MyProjectLocale` (dictionary locales ∪ fallback keys and targets).

| Field                      | Meaning                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `missingDirectByLocale`    | No template for that locale on the key (or empty string when `--allow-empty` is not set) |
| `missingEffectiveByLocale` | Runtime would fail after walking `LOCALE_FALLBACK` — real coverage gaps                  |

By default the CLI **does not fail** (exit `0`) — report-only. Pass `--fail-on effective`, `direct`, or `any` to exit `1` when gaps exist (for CI).

Locales such as `de-CH` that exist only in `localeFallback` (not in source files) typically show high `missingDirect` but low `missingEffective` when `en` covers the chain — that is expected.

## Configuration (`i18n/i18n.codegen.json`)

Specify **exactly one** of `dictionary` (single-file) or `namespaces` (multi-file). Paths in the config are relative to the directory containing `i18n.codegen.json` (the `i18n/` folder created by setup).

### Multi-namespace

```json
{
  "namespaces": {
    "default": "translations/default.json",
    "user": "translations/user.json",
    "billing": "translations/billing.yaml"
  },
  "typesOutput": "generated/i18n-types.generated.ts",
  "dictionaryOutput": "generated/dictionary.generated.ts",
  "instanceOutput": "generated/instance.generated.ts",
  "paramsTypeName": "MyProjectParams",
  "schemaTypeName": "MyProjectSchema",
  "localeTypeName": "MyProjectLocale",
  "factoryName": "createI18n",
  "localeFallback": {
    "en": null,
    "de-DE": "en",
    "de-CH": "de-DE",
    "it": "en"
  }
}
```

### Single-file

```json
{
  "dictionary": "translations/translations.json",
  "defaultNamespace": "default",
  "typesOutput": "generated/i18n-types.generated.ts",
  "dictionaryOutput": "generated/dictionary.generated.ts",
  "instanceOutput": "generated/instance.generated.ts",
  "paramsTypeName": "MyProjectParams",
  "schemaTypeName": "MyProjectSchema",
  "localeTypeName": "MyProjectLocale",
  "factoryName": "createI18n",
  "localeFallback": {
    "en": null,
    "de-DE": "en",
    "de-CH": "de-DE",
    "it": "en"
  }
}
```

| Field                               | Description                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `dictionary`                        | Path to a single dictionary file (`.json`, `.yaml`, or `.yml`) for the flat API. Mutually exclusive with `namespaces`.                                                                                                                                                                                                                                                                                      |
| `namespaces`                        | Map of `namespace -> dictionary path` (`.json`, `.yaml`, or `.yml`) for the namespaced API. Mutually exclusive with `dictionary`.                                                                                                                                                                                                                                                                           |
| `defaultNamespace`                  | Optional. Namespace label used internally in single-file mode (default `"default"`). Not exposed in the flat API.                                                                                                                                                                                                                                                                                           |
| `typesOutput`                       | Output path for the generated types.                                                                                                                                                                                                                                                                                                                                                                        |
| `dictionaryOutput`                  | Optional. Output path for `dictionary.generated.ts` when codegen emits it (canonical delivery, or split/custom with eager namespaces). Omit in split/custom when every namespace is lazy — codegen does not write the file; if a stale manifest exists at the default `{dirname(typesOutput)}/dictionary.generated.ts`, it is removed. Explicit `dictionaryOutput` still controls which path is cleaned up. |
| `instanceOutput`                    | Output path for the generated factory (`createI18n`).                                                                                                                                                                                                                                                                                                                                                       |
| `importExtension`                   | Optional. Relative import suffix between generated `.ts` modules: `"none"` (default, extensionless), `".ts"`, or `".js"`.                                                                                                                                                                                                                                                                                   |
| `factoryName`                       | Name of the exported factory function (default `createI18n`).                                                                                                                                                                                                                                                                                                                                               |
| `paramsTypeName` / `schemaTypeName` | Names of the exported types (customizable per project).                                                                                                                                                                                                                                                                                                                                                     |
| `localeTypeName`                    | Name of the exported locale union type (default `MyProjectLocale`).                                                                                                                                                                                                                                                                                                                                         |
| `localeFallback`                    | Optional map of `locale -> next locale                                                                                                                                                                                                                                                                                                                                                                      | null` for runtime fallback resolution. |
| `localeFallbackConstName`           | Name of the generated fallback constant (default `LOCALE_FALLBACK`).                                                                                                                                                                                                                                                                                                                                        |
| `dictionarySchemaOutput`            | Optional path for generated external dictionary validation (`dictionary-schema.generated.ts`). Requires `zod` in the consumer app.                                                                                                                                                                                                                                                                          |
| `loadOnInit`                        | Multi mode only; **canonical delivery only**. Namespaces to include in the initial bundle via static imports. When omitted, all namespaces are eager (default). Not allowed with `split-by-locale` or `custom` — those modes load every namespace through `namespaceLoaders`.                                                                                                                               |
| `namespaceLoadersOutput`            | Output path for generated `namespaceLoaders` (dynamic `import()` per lazy namespace). Defaults to `{dirname(instanceOutput)}/namespace-loaders.generated.ts`. Required when lazy namespaces exist.                                                                                                                                                                                                          |
| `delivery`                          | Optional. `"canonical"` (default) — one multilocale JSON per namespace. `"split-by-locale"` — emits `{basename}.{locale}.json` under `{deliveryOutput}/translations/` and per-locale loaders. `"custom"` — named delivery areas via `deliveryArtifacts`; emits `{basename}.{area}.json`, area-scoped loaders, and typed `DELIVERY_ARTIFACTS` / `LOCALE_DELIVERY_AREA` in `i18n-types.generated.ts`.         |
| `deliveryArtifacts`                 | Required when `delivery` is `"custom"`. Map of delivery area → locale list (e.g. `{ "eu": ["en", "it"], "amer": ["en-US"] }`). Codegen validates structure and that locales partition the project locale set. Emitted as `DELIVERY_ARTIFACTS` (area → locales) and `LOCALE_DELIVERY_AREA` (locale → area).                                                                                                  |
| `deliveryOutput`                    | Optional. Directory for compiled and split delivery JSON (files land in `{deliveryOutput}/translations/`). Defaults to `dirname(typesOutput)`. Use e.g. `public/i18n` to ship per-locale JSON from a static host while keeping generated TypeScript under `generated/`.                                                                                                                                     |

> Paths are resolved relative to the directory containing `i18n.codegen.json` (e.g. `i18n/` when using `xndrjs-i18n-setup .`).

### YAML authoring

Dictionary paths may use `.yaml` or `.yml` instead of `.json`. **YAML is an authoring format, not a runtime format** — codegen compiles YAML to JSON under the delivery output directory (for example `translations/billing.yaml` → `{deliveryOutput}/translations/billing.json`; default `{deliveryOutput}` is `dirname(typesOutput)`); generated TypeScript imports the compiled JSON at runtime. Edit only the YAML source — the compiled JSON is overwritten on each codegen run.

Use YAML when ICU is hard to read on one line: multiple parameters, or plural/select branches. It is not aimed at long legal copy or styled pages — those usually belong in a separate content template with localized fragments inside.

YAML block scalars keep complex ICU readable in source while preserving (or intentionally folding) line breaks.

```yaml
# translations/billing.yaml
appointment_summary:
  en: |
    Due {dueDate, date, short}
    at {startTime, time, short}
  it: "Scade il {dueDate, date, short} alle {startTime, time, short}"
```

Workflow:

1. Edit the `.yaml` / `.yml` source file under `translations/`.
2. Run `xndrjs-i18n-codegen`.
3. Commit the YAML source; the compiled JSON lives under `generated/translations/` and is safe to commit or gitignore if CI regenerates it before build.

Mixed namespaces are supported: some namespaces can stay `.json` while others use YAML.

### Split-by-locale delivery

By default (`delivery: "canonical"`), codegen keeps one multilocale JSON per namespace — either your source file in place (`.json`) or a compiled YAML → JSON under `{deliveryOutput}/translations/` (default: `generated/translations/`).

Set `"delivery": "split-by-locale"` to emit **one JSON file per locale** instead. All namespaces are lazy in this mode — register them with `namespaceLoaders` before rendering:

```json
{
  "delivery": "split-by-locale",
  "namespaces": {
    "default": "translations/default.json",
    "billing": "translations/billing.yaml"
  },
  "namespaceLoadersOutput": "generated/namespace-loaders.generated.ts"
}
```

Codegen writes `{deliveryOutput}/translations/{basename}.{locale}.json` (for example `user.it.json`, `billing.en.json`). Each file contains the same shape as `projectNamespaceLocalesCore(dict, [locale])` — keys map to a single locale entry. With `localeFallback`, locales such as `de-CH` are resolved at codegen time (for example from `de-DE`).

**Authoring is unchanged** — edit the canonical source JSON/YAML. Types (`MyProjectSchema`) are generated explicitly from ICU analysis (keys + `Partial<Record<MyProjectLocale, string>>` per key), not from `typeof import` of JSON files. Audit still reads the config paths.

**Generated API changes (opt-in):**

| Canonical                        | Split-by-locale / custom (all lazy)                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| `export const defaultDictionary` | `dictionary.generated.ts` is not generated                                                         |
| `namespaceLoaders.billing()`     | `namespaceLoaders.billing(locale)` or `namespaceLoaders.billing(area)`                             |
| —                                | `createI18n({}).withNamespaces([...]).withLocale(locale).load()` / `withDeliveryArea(area).load()` |
| —                                | `DELIVERY_ARTIFACTS`, `LOCALE_DELIVERY_AREA` in `i18n-types.generated.ts` (`custom` only)          |

When `loadOnInit` lists eager namespaces in **canonical** delivery only, `dictionary.generated.ts` still exports `defaultDictionary` with static imports. In split/custom delivery, eager slices use `defaultDictionaryFor(locale)` or `defaultDictionaryFor(area)` when configured.

Example init (multi, split-by-locale, all namespaces lazy):

```ts
import { createI18n } from "./generated/instance.generated.js";

const view = await createI18n({})
  .withNamespaces(["default", "billing"])
  .withLocale(activeLocale)
  .load();
```

Example init (multi, custom delivery, all namespaces lazy):

```ts
import { createI18n } from "./generated/instance.generated.js";

const view = await createI18n({})
  .withNamespaces(["default", "billing"])
  .withDeliveryArea(activeArea)
  .load();
```

Custom delivery config and typed artifacts (no need to read `deliveryArtifacts` from JSON at runtime):

```json
{
  "delivery": "custom",
  "deliveryArtifacts": {
    "eu": ["en", "it", "fr"],
    "amer": ["en-US", "es-AR"]
  },
  "namespaces": {
    "default": "translations/default.json",
    "billing": "translations/billing.yaml"
  },
  "namespaceLoadersOutput": "generated/namespace-loaders.generated.ts"
}
```

Codegen emits the partition in `i18n-types.generated.ts`:

```ts
export type MyProjectDeliveryArea = "amer" | "eu";

export const DELIVERY_ARTIFACTS = {
  amer: ["en-US", "es-AR"] as const,
  eu: ["en", "fr", "it"] as const,
} as const satisfies Record<MyProjectDeliveryArea, readonly MyProjectLocale[]>;

export type MyProjectDeliveryArtifacts = typeof DELIVERY_ARTIFACTS;

export const LOCALE_DELIVERY_AREA = {
  "en-US": "amer",
  "es-AR": "amer",
  en: "eu",
  fr: "eu",
  it: "eu",
} as const satisfies Record<MyProjectLocale, MyProjectDeliveryArea>;
```

```ts
import {
  DELIVERY_ARTIFACTS,
  LOCALE_DELIVERY_AREA,
  type MyProjectDeliveryArea,
} from "./generated/i18n-types.generated.js";

const euLocales = DELIVERY_ARTIFACTS.eu; // readonly ["en", "fr", "it"]
const areaForEnUs: MyProjectDeliveryArea = LOCALE_DELIVERY_AREA["en-US"]; // "amer"
```

Example `dictionary.generated.ts` (multi, canonical delivery, `loadOnInit: ["default"]`):

```ts
import defaultEn from "./translations/default.en.json";
import defaultIt from "./translations/default.it.json";

const defaultByLocale = {
  en: defaultEn,
  it: defaultIt,
} as const satisfies Record<MyProjectLocale, MyProjectSchema["default"]>;

export function defaultDictionaryFor(locale: MyProjectLocale): InitialSchema {
  return { default: defaultByLocale[locale] };
}
```

Example `namespace-loaders.generated.ts`:

```ts
export const namespaceLoaders = {
  billing: (locale: MyProjectLocale) => {
    switch (locale) {
      case "en":
        return import("./translations/billing.en.json").then((m) => m.default);
      case "it":
        return import("./translations/billing.it.json").then((m) => m.default);
      case "de-CH":
        return import("./translations/billing.de-CH.json").then((m) => m.default);
      default:
        throw new Error(
          `[i18n] No translation artifact for namespace "billing" and locale "${String(locale)}".`
        );
    }
  },
};
export const defaultLazyNamespaces = ["billing", "default"] as const;
```

Load only the namespaces you need:

```ts
import { createI18n } from "./generated/instance.generated.js";

const view = await createI18n({}).withNamespaces(["billing"]).withLocale(activeLocale).load();
```

Use split delivery when you want smaller lazy chunks (one locale per dynamic import) or when serving per-locale JSON from `public/` without runtime `projectNamespaceLocales`. Runtime `projectDictionaryLocales` / `projectNamespaceLocales` remain available for external CMS/API payloads.

## Usage

### Single vs. multi-namespace API

|             | Single-file                                      | Multi-namespace                                      |
| ----------- | ------------------------------------------------ | ---------------------------------------------------- |
| `I18N_MODE` | `'single'`                                       | `'multi'`                                            |
| Provider    | `IcuTranslationProviderSingle`                   | `IcuTranslationProviderMulti`                        |
| `t()`       | `t(key, locale, params?)`                        | `t(namespace, key, locale, params?)`                 |
| Patch       | `scope.set(key, template)` on locale-bound scope | `scope.set(ns, key, template)` on locale-bound scope |

### Multi-namespace example

```ts
import { i18n } from "./i18n"; // app singleton from i18n.ts
// or: import { createI18n, defaultDictionary } from './i18n'; const i18n = createI18n(defaultDictionary);

scope.t("default", "login_button", "it"); // "Accedi"
scope.t("default", "welcome", "en", { name: "Ada" }); // "Welcome Ada!"
scope.t("default", "dashboard_status", "it", { msgCount: 3, chatCount: 2 });
scope.t("billing", "invoice_summary", "en", { count: 12 });

// Compile-time errors:
scope.t("default", "welcome", "it"); // ✗ missing { name }
scope.t("billing", "login_button", "it"); // ✗ key not in namespace
```

### Single-file example

```ts
import { i18n } from "./i18n"; // app singleton from i18n.ts
// or: import { createI18n, defaultDictionary } from './i18n'; const i18n = createI18n(defaultDictionary);

i18n.t("login_button", "it");
i18n.t("welcome", "en", { name: "Ada" });
```

### Runtime override (key-level patch)

Runtime patches go through **`scope.set()`** on a locale-bound scope returned from `load()`. The key (and locale) must already be preloaded — typically via a prior `load()` call or the canonical eager dictionary.

```ts
// Multi — locale-bound scope from load()
const scope = await createI18n({}).withNamespaces(["billing"]).withLocale("en").load();
scope.set(
  "billing",
  "invoice_summary",
  "You have {count, plural, one {1 invoice} other {# invoices}}"
);
scope.t("billing", "invoice_summary", { count: 2 });

// Single — same pattern
const singleScope = await createI18n(defaultDictionary).withLocale("en").load();
singleScope.set("welcome", "Welcome {name}!");
```

Unbound scopes (without `withLocale` / `withDeliveryArea` before `load()`) are read-only; call `.forLocale(locale)` before patching.

### Lazy namespace loading (multi mode)

The pattern depends on `delivery`:

| Delivery                     | Loading pattern                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `canonical`                  | `loadOnInit` for eager namespaces; manual `namespaceLoaders.ns()` for lazy ones.                                                                 |
| `split-by-locale` / `custom` | Every namespace is lazy. Prefer the builder: `createI18n({}).withNamespaces([...]).withLocale(locale).load()` / `withDeliveryArea(area).load()`. |

#### Canonical delivery — `loadOnInit` and manual loaders

Split namespaces across chunks with `loadOnInit` in **canonical** delivery only. Codegen emits typed `namespaceLoaders` with one dynamic `import()` per lazy namespace.

```json
{
  "delivery": "canonical",
  "namespaces": {
    "default": "translations/default.json",
    "billing": "translations/billing.yaml"
  },
  "loadOnInit": ["default"],
  "namespaceLoadersOutput": "generated/namespace-loaders.generated.ts"
}
```

Codegen also emits `LoadOnInitNamespace`, `LazyNamespace`, and `InitialSchema` types. The generated factory accepts a partial `InitialSchema` at init time.

Canonical delivery: eager namespaces load via `loadOnInit`. For lazy ones, use the builder or call generated `namespaceLoaders` inside a custom loader wired into `createI18n`.

```ts
import { createI18n, namespaceLoaders, type LazyNamespace } from "./i18n";

// Eager namespace available immediately on the canonical singleton scope
const scope = createI18n(defaultDictionary).toScope();
scope.t("default", "login_button", "en");

// Lazy namespace — load via builder
const billingScope = await createI18n(defaultDictionary)
  .withNamespaces(["billing"])
  .withLocale("en")
  .load();
billingScope.t("billing", "invoice_summary", { count: 12 });

// batch preload several lazy namespaces for one locale
await Promise.all(
  (["user", "billing"] as const satisfies readonly LazyNamespace[]).map(async (namespace) => {
    await namespaceLoaders[namespace]();
  })
);
```

#### Split-by-locale / custom — builder loading

With `split-by-locale` or `custom`, codegen wires `namespaceLoaders` into `createI18n({})` and returns a builder. Use `load()` to get a ready scope:

```ts
import { createI18n } from "./generated/instance.generated.js";

const scope = await createI18n({})
  .withNamespaces(["billing"])
  .withLocale(activeLocale) // split-by-locale
  // .withDeliveryArea(activeArea) // custom delivery
  .load();

scope.t("billing", "invoice_summary", { count: 3 });
```

Repeated `load()` calls on the same builder deep-merge locale entries on the shared engine — load `"it"`, then `"en"`, and both remain available:

```ts
const builder = createI18n({}).withNamespaces(["billing"] as const);
const itScope = await builder.withLocale("it").load();
const enScope = await builder.withLocale("en").load();
// itScope and enScope share one engine; both locales are preloaded for billing keys.
```

Generated loaders throw if locale/area does not match a known artifact (no silent empty payloads into `load()`).

Optional locale projection before validating external slices:

```ts
import { projectNamespaceLocales } from "./i18n/generated/instance.generated.js";

const billing = await namespaceLoaders.billing();
const billingSlice = projectNamespaceLocales(billing, [userLocale]);
const result = validateExternalKey("billing", "invoice_summary", billingSlice.invoice_summary);
if (result.ok) {
  scope.set("billing", "invoice_summary", result.data.invoice_summary[userLocale]!);
}
```

When a namespace key was never loaded, `t()` resolves through `onMissing` (default: throw).

Fetch/CMS hydration is app-owned: fetch → validate (`validateExternalKey` / `validateExternalNamespacePartial`) → `load()` → `scope.set()` per key.

### External dictionary validation

When translations arrive from an external source (i.e. a CMS), validate the `unknown` input before calling `scope.set()`. Keys must be preloaded via `load()` first.

Enable validation by adding `dictionarySchemaOutput` to `i18n/i18n.codegen.json`:

```json
{
  "dictionarySchemaOutput": "generated/dictionary-schema.generated.ts"
}
```

Add `zod` as a dependency in the consumer app (required peer of `@xndrjs/i18n`).

Codegen emits `DICTIONARY_SPEC`, `validateExternalDictionary()`, `validateExternalDictionaryPartial()`, `validateExternalNamespacePartial()`, and `validateExternalKey()`. Validation runs in two phases:

1. **Normalize** — parse ICU templates, extract variables, check required keys (missing keys fail; extra keys are ignored; partial locales are OK).
2. **Validate** — compare extracted arguments against the static `Params` schema via Zod.

```ts
import { formatIssues } from "@xndrjs/i18n/validation";
import {
  validateExternalDictionaryPartial,
  validateExternalKey,
} from "./i18n/generated/dictionary-schema.generated.js";
import { createI18n } from "./i18n";

const raw: unknown = await loadTranslations();

const scope = await createI18n({}).withNamespaces(["default", "billing"]).withLocale("en").load();

const result = validateExternalDictionaryPartial(raw);
if (!result.ok) {
  console.error(formatIssues(result.issues));
  return;
}

for (const [namespace, nsData] of Object.entries(result.data)) {
  if (!nsData) continue;
  for (const [key, locales] of Object.entries(nsData)) {
    const keyResult = validateExternalKey(namespace as "default", key, locales);
    if (keyResult.ok) {
      const template = keyResult.data[key as keyof typeof keyResult.data]?.en;
      if (template) scope.set(namespace as "billing", key as "invoice_summary", template);
    }
  }
}
```

For a single key patch (multi mode):

```ts
import { validateExternalKey } from "./i18n/generated/dictionary-schema.generated.js";

const scope = await createI18n({}).withNamespaces(["billing"]).withLocale("it").load();

const result = validateExternalKey("billing", "invoice_summary", rawLocales);
if (result.ok) {
  scope.set("billing", "invoice_summary", result.data.invoice_summary.it!);
}
```

Low-level API is also available from `@xndrjs/i18n/validation` for custom wiring.

## Provider API

Both providers share this behavior:

- **Compilation cache** — compiled `IntlMessageFormat` instances are cached per locale (and per namespace in multi mode). Invalidated on `scope.set()` for the affected key/locale.
- **`getAll()`** — returns a deep-frozen snapshot of the current dictionary (not a live reference).
- **No public merge/replace** — `setAll`, `mergeAll`, `setNamespace`, and `mergeNamespace` were removed in 0.7.0. Deep merge is internal to `load()`; patches go through `scope.set()`.
- **Missing key/locale** — by default throws an error if the template is `undefined` (configurable via `onMissing`, see below). An empty string (`""`) is treated as a valid template.
- **ICU syntax error** — throws `[i18n ICU Syntax Error] ...`.
- **Formatting error** (missing/invalid params) — throws `[i18n Formatting Error] ...`.

### Missing-translation strategy (`onMissing`)

Both providers accept an `onMissing` option controlling what happens when no template resolves for a key/locale (after walking the full fallback chain):

```ts
onMissing?: "throw" | "key" | ((context: MissingTranslationContext) => string);
// MissingTranslationContext = { namespace?: string; key: string; locale: string; fallbackChain: string }
```

- **`"throw"`** (default) — throws `[i18n] Missing key or locale: ...` including the fallback chain.
- **`"key"`** — returns the key itself: `key` in single mode, `namespace.key` in multi mode.
- **Function** — receives the missing-translation context (`namespace` is only set in multi mode) and returns the string to display.

```ts
const i18n = new IcuTranslationProviderMulti(schema, {
  localeFallback,
  onMissing: ({ namespace, key }) => `[missing: ${namespace}.${key}]`,
});
```

`onMissing` only applies to missing-template resolution. ICU syntax errors, formatting errors, and (in multi mode) unloaded namespaces still throw.

The generated factory accepts `onMissing` as a pass-through option, merged with the codegen-wired `localeFallback`:

```ts
import { createI18n } from "./i18n/generated/instance.generated.js";

const i18n = createI18n(dictionary, { onMissing: "key" });
```

## Commands

Run from the repo root:

```bash
# Install workspaces
pnpm install

# Build the library
pnpm --filter @xndrjs/i18n build

# Generate i18n types/dictionary/instance for the demo app
pnpm --filter @xndrjs/i18n-demo i18n:codegen

# Type-check the i18n package
pnpm --filter @xndrjs/i18n typecheck

# Run the demo app (single + multi)
pnpm --filter @xndrjs/i18n-demo demo

# Run library tests
pnpm --filter @xndrjs/i18n test
```

From inside `apps/i18n-demo/`:

```bash
pnpm run i18n:codegen:single   # xndrjs-i18n-codegen --config single/src/i18n/i18n.codegen.json
pnpm run i18n:codegen:multi    # xndrjs-i18n-codegen --config multi/src/i18n/i18n.codegen.json
pnpm run i18n:audit:single     # xndrjs-i18n-audit --config single/src/i18n/i18n.codegen.json
pnpm run i18n:audit:multi      # xndrjs-i18n-audit --config multi/src/i18n/i18n.codegen.json
pnpm run demo:single           # tsx single/src/index.ts
pnpm run demo:multi            # tsx multi/src/index.ts
```

## Adding a translation key

1. Add the key with its ICU strings to the relevant JSON file under `translations/`.
2. Run `pnpm --filter @xndrjs/i18n-demo i18n:codegen:multi` (or `i18n:codegen:single`).
3. The generated `MyProjectParams` updates; TypeScript will flag any `t()` call sites that now need (or no longer need) parameters.

## Adding a namespace

1. Create a new dictionary file (`.json`, `.yaml`, or `.yml`, any path).
2. Add it to `namespaces` in `i18n/i18n.codegen.json`.
3. Re-run codegen. `dictionary.generated.ts` wires the import automatically.

## Migrating single-file to multi-namespace

1. Split the flat JSON into per-domain files.
2. Change `dictionary` to `namespaces` in the config.
3. Re-run codegen — types and API switch from flat to namespaced.
4. Update call sites: `t(key, locale)` → `t(namespace, key, locale)` on scopes (or use locale-bound scopes from `load()`).

## Tech stack

- **TypeScript 6** (`strict`, `resolveJsonModule`, `moduleResolution: "bundler"`)
- **[intl-messageformat](https://www.npmjs.com/package/intl-messageformat)** — runtime ICU formatting
- **[@formatjs/icu-messageformat-parser](https://www.npmjs.com/package/@formatjs/icu-messageformat-parser)** — build-time AST parsing
- **[zod](https://www.npmjs.com/package/zod)** — peer dependency (config validation, external dictionary validation)
- **[tsx](https://www.npmjs.com/package/tsx)** — runs TypeScript scripts directly
