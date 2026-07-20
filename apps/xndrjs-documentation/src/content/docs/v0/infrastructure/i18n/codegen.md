---
title: Codegen
description: ICU type inference, generated files, and content-only regeneration.
---

`xndrjs-i18n-codegen` parses every ICU string with `@formatjs/icu-messageformat-parser` and infers parameter types:

| ICU construct                             | Inferred type |
| ----------------------------------------- | ------------- |
| Simple argument `{name}`                  | `string`      |
| `plural` argument `{count, plural, ...}`  | `number`      |
| `select` argument `{gender, select, ...}` | `string`      |
| No variables                              | `never`       |

Variables found across **all locales** of the same key are merged. If parsing fails for any key/locale, codegen prints a contextual error and exits non-zero (CI/build blocker).

Codegen is always **multi-namespace**: every key lives under a namespace, and typed `t()` is `t(namespace, key, params?)` on a locale-bound scope.

## Generated files

Under `codegenPath/`:

| File                             | Contents                                                                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `i18n-types.generated.ts`        | `I18N_MODE` (`'multi'`), `MyProjectParams`, `MyProjectSchema`, locale union                                                                              |
| `instance.generated.ts`          | Exports `createI18n(options?)` — cold start `createI18n()`, hydrate `createI18n({ state })`, fetch strategy requires `createI18n({ fetchImpl, state? })` |
| `dictionary-schema.generated.ts` | `DICTIONARY_SPEC`, `validateExternal*` helpers                                                                                                           |
| `namespace-loaders.generated.ts` | Typed `namespaceLoaders` (import) or `createNamespaceLoaders(fetchImpl)` (fetch)                                                                         |

Delivery JSON is written under `{artifactsPath}/translations/` (default `artifactsPath` = `codegenPath`). See [Delivery](/v0/infrastructure/i18n/delivery/).

`dictionary.generated.ts` is **not** emitted — every namespace loads through the handle.

Example generated params:

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

## Runtime shape after codegen

```ts
const { t } = await createI18n().load({
  namespaces: ["default", "billing"],
  locale: "en",
});

t("default", "login_button");
t("billing", "invoice_summary", { count: 12 });

// compile-time errors:
t("default", "welcome"); // missing { name }
t("billing", "login_button"); // key not in namespace
```

Configure namespaces in `i18n.codegen.json` (there is no single-file `dictionary` field). See [Configuration](/v0/infrastructure/i18n/configuration/).

## Full codegen vs content-only refresh

Two APIs from `@xndrjs/i18n/codegen`:

| API                                       | When                                                 | Writes                                                            |
| ----------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- |
| `runCodegen(config)` / CLI                | Contract changes (keys, params, namespaces, locales) | Types + instance + loaders + delivery JSON (then rebuild the app) |
| `regenerateNamespaces({ namespaces, … })` | Editorial label/copy changes (same ICU contract)     | **Only** delivery JSON for the listed namespaces                  |

Authoring files are updated **outside** this library (CMS export, editors, scripts). Then refresh delivery artifacts:

```ts
import { regenerateNamespaces } from "@xndrjs/i18n/codegen";

// after writing translations/billing.json (same keys + ICU params)
regenerateNamespaces({
  configPath: "i18n/i18n.codegen.json",
  namespaces: ["billing"],
});
```

If authoring changes a key’s ICU parameter contract (or adds/removes keys), regeneration fails — run full codegen and ship a release instead. End-to-end without an app rebuild requires `loaderStrategy: "fetch"`.

## React bindings

After core codegen, run `xndrjs-i18n-react-codegen` (same `--config`) to emit `react-bindings.generated.tsx`. See [React](/v0/infrastructure/i18n/react/).
