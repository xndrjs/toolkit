# @xndrjs/i18n

Compiler-first, type-safe ICU MessageFormat i18n for TypeScript apps.

- **Codegen** turns JSON/YAML dictionaries into exact TypeScript types and lazy loaders.
- **Runtime** is a single handle: `createI18n(options?).load({ namespaces, locale })`.
- **Content updates without rebuild** use authoring edits outside the library + `regenerateNamespaces([...])` + `loaderStrategy: "fetch"`.
- **React** lives in [`@xndrjs/i18n-react`](../i18n-react) (gate / HOC, no Suspense).

## Install

```bash
npm install @xndrjs/i18n zod
```

Peer dep: `zod` (config + validation).

## Quick start

**1. Config** (`i18n/i18n.codegen.json`):

```json
{
  "projectName": "App",
  "delivery": "split-by-locale",
  "namespaces": {
    "default": "translations/default.json",
    "billing": "translations/billing.yaml"
  },
  "codegenPath": "generated"
}
```

Generated under `codegenPath/`: `i18n-types.generated.ts`, `instance.generated.ts`, `namespace-loaders.generated.ts`, `dictionary-schema.generated.ts`. Delivery JSON goes to `artifactsPath` (defaults to `codegenPath`). Type names are inferred as `AppParams` / `AppSchema` / `AppLocale`.

**2. Generate:**

```bash
npx xndrjs-i18n-codegen --config i18n/i18n.codegen.json
# or from code:
# import { runCodegen } from "@xndrjs/i18n/codegen";
# runCodegen("i18n/i18n.codegen.json");
```

**3. Use:**

```ts
import { createI18n } from "./generated/instance.generated.js";

const i18n = createI18n();
const { t } = await i18n.load({
  namespaces: ["default", "billing"],
  locale: "en",
});

t("default", "welcome", { name: "Ada" });
t("billing", "invoice_summary", { count: 3 });
```

SSR → CSR hydrate:

```ts
const state = i18n.serialize();
// pass `state` into the React root; gates resolve via peek() without a flash
```

Scaffold:

```bash
npx xndrjs-i18n-setup multi .
```

## Delivery modes

| Mode                        | Artifacts                                | `load({ locale })` behavior                                                  |
| --------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| `split-by-locale` (default) | `{ns}.{locale}.json`                     | Loads that locale file                                                       |
| `custom`                    | `{ns}.{area}.json` + `deliveryArtifacts` | Maps locale → area via generated `LOCALE_DELIVERY_AREA`, then loads the area |

## Loader strategy

```json
{
  "loaderStrategy": "fetch"
}
```

- **`import`** (default) — dynamic `import()`; JSON is bundled. Content changes need a rebuild.
- **`fetch`** — generated loaders call `fetchImpl({ locale, namespace, area? })`. You **must** pass `fetchImpl` to `createI18n({ fetchImpl })` (or `I18nRoot`). Mapping the resource id to a URL, CDN path, or filesystem read is an application concern — codegen does not embed base URLs.

Hydrate from SSR:

```ts
const state = i18n.serialize();
const client = createI18n({ state }); // import strategy
// fetch strategy:
// const client = createI18n({ state, fetchImpl });
```

## Content updates without build (CMS)

Two APIs from `@xndrjs/i18n/codegen`:

| API                                       | When                                                 | Writes                                                            |
| ----------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- |
| `runCodegen(config)`                      | Contract changes (keys, params, namespaces, locales) | Types + instance + loaders + delivery JSON (then rebuild the app) |
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

If authoring changes a key’s ICU parameter contract (or adds/removes keys), regeneration fails — run `runCodegen` and ship a release instead.

End-to-end without rebuild requires `loaderStrategy: "fetch"`. Debounce/batch webhooks in the app; each call rewrites delivery JSON only, not app code.

## Validation

`@xndrjs/i18n/validation` (and generated `dictionary-schema.generated.ts`) validates external CMS payloads **before** writing authoring files. It is not a runtime patch API.

## Audit

```bash
npx xndrjs-i18n-audit --config i18n/i18n.codegen.json
npx xndrjs-i18n-audit --config i18n/i18n.codegen.json --fail-on effective
```

## Tech stack

- TypeScript (strict)
- [intl-messageformat](https://www.npmjs.com/package/intl-messageformat) + [@formatjs/icu-messageformat-parser](https://www.npmjs.com/package/@formatjs/icu-messageformat-parser)
- [zod](https://www.npmjs.com/package/zod) (peer)
