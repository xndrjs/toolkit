---
title: Codegen
description: ICU type inference, generated files, and single-file vs multi-namespace modes.
---

`xndrjs-i18n-codegen` parses every ICU string with `@formatjs/icu-messageformat-parser` and infers parameter types:

| ICU construct                             | Inferred type |
| ----------------------------------------- | ------------- |
| Simple argument `{name}`                  | `string`      |
| `plural` argument `{count, plural, ...}`  | `number`      |
| `select` argument `{gender, select, ...}` | `string`      |
| No variables                              | `never`       |

Variables found across **all locales** of the same key are merged. If parsing fails for any key/locale, codegen prints a contextual error and exits non-zero (CI/build blocker).

## Generated files

| File                             | Contents                                                                                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `i18n-types.generated.ts`        | `I18N_MODE`, `MyProjectParams`, `MyProjectSchema`, locale union                                                                                                               |
| `dictionary.generated.ts`        | Imports JSON and exports `defaultDictionary` (canonical) or `defaultDictionaryFor` when eager namespaces exist in split/custom delivery; omitted when every namespace is lazy |
| `instance.generated.ts`          | Exports `createI18n(dictionary)` — typed factory; dictionary is a required argument (not bundled by default)                                                                  |
| `dictionary-schema.generated.ts` | Optional — `DICTIONARY_SPEC`, `validateExternalDictionary()`                                                                                                                  |
| `namespace-loaders.generated.ts` | Optional — typed `namespaceLoaders` map wired into the generated builder factory                                                                                              |

Example generated params (multi-namespace):

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

## Single file vs multi-namespace

Specify **exactly one** of `dictionary` (single) or `namespaces` (multi) in `i18n.codegen.json`.

|               | Single-file                                | Multi-namespace                                                               |
| ------------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| `I18N_MODE`   | `'single'`                                 | `'multi'`                                                                     |
| Engine        | `IcuTranslationProviderSingle`             | `IcuTranslationProviderMulti`                                                 |
| Scope `t()`   | `t(key, locale, params?)`                  | `t(namespace, key, locale, params?)` on unbound scope; omit locale when bound |
| Runtime patch | `set(key, template)` on locale-bound scope | `set(ns, key, template)` on locale-bound scope                                |
| Lazy loading  | Builder + `dictionaryLoader`               | Builder + `namespaceLoaders` via `withNamespaces().withLocale().load()`       |

**Single-file** — one JSON, flat API, simplest integration:

```ts
import { i18n } from "./i18n";

const { t } = i18n;

t("login_button", "it");
t("welcome", "en", { name: "Ada" });
```

**Multi-namespace** — split by domain, builder loading, code-splitting:

```ts
const { t } = await createI18n({}).withNamespaces(["default", "billing"]).withLocale("en").load();

t("default", "login_button");
t("billing", "invoice_summary", { count: 12 });

// compile-time errors:
t("default", "welcome"); // missing { name }
t("billing", "login_button"); // key not in namespace
```

To migrate: split JSON, change `dictionary` → `namespaces`, re-run codegen, update call sites.

See [Configuration](/v0/infrastructure/i18n/configuration/) for every `i18n.codegen.json` field.
