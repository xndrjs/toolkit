# @xndrjs/i18n-demo

Workshop app for `@xndrjs/i18n` with three consumer setups in one package:

- **`single/`** — single-file dictionary mode (`single/src/i18n/i18n.codegen.json`)
- **`multi/`** — multi-namespace mode with `delivery: "split-by-locale"` (`multi/src/i18n/i18n.codegen.json`)
- **`areas/`** — multi-namespace mode with `delivery: "custom"`, delivery areas `eu` / `amer`, and delivery JSON under `areas/src/public/translations/` (`deliveryOutput: "../public"` in `areas/src/i18n/i18n.codegen.json`)
- **`programmatic/`** — writes `i18n.codegen.json` via `@xndrjs/i18n/codegen` before running codegen (`programmatic/src/i18n/write-config.ts`)

## Split-by-locale (`multi/`)

All namespaces are lazy. Bootstrap with `createI18n({})` and use the builder to load what you need for a locale.

```ts
import { createI18nForLocale } from "./i18n";

const view = await createI18nForLocale(activeLocale, ["default", "billing"]);
view.t("billing", "invoice_summary", { count: 2 });
```

For manual patches after validation, prefer `mergeNamespace` / `mergeAll` over `setNamespace` / `setAll` when you keep prior locales in memory:

```ts
i18n.mergeNamespace("billing", validatedBilling);
i18n.mergeAll(validatedDictionary);
```

`createI18nForLocale(locale, namespaces?)` in `multi/src/i18n/index.ts` wraps the same pattern for per-request instances.

Run: `pnpm run demo:multi`

## Custom delivery areas (`areas/`)

Delivery JSON is grouped by area (`eu`, `amer`). Use `createI18nForArea`:

```ts
import { createI18nForArea } from "./i18n";

const view = await createI18nForArea("eu", ["default", "billing"]);
view.t("default", "some_key", "it");
```

`createI18nForArea(area, namespaces?)` in `areas/src/i18n/index.ts` returns a ready instance. Generated helpers use `mergeNamespace`; manual hydration should use `mergeNamespace` / `mergeAll` when accumulating locales on a shared provider.

Run: `pnpm run demo:areas`

## Commands

From the repo root:

```bash
pnpm --filter @xndrjs/i18n-demo i18n:codegen
pnpm --filter @xndrjs/i18n-demo i18n:audit
pnpm --filter @xndrjs/i18n-demo demo
pnpm --filter @xndrjs/i18n-demo typecheck
```

Or from `apps/i18n-demo/`:

```bash
pnpm run i18n:codegen:single
pnpm run i18n:codegen:multi
pnpm run i18n:codegen:areas
pnpm run i18n:write-config:programmatic
pnpm run i18n:codegen:programmatic
pnpm run i18n:audit:single
pnpm run i18n:audit:multi
pnpm run i18n:audit:areas
pnpm run demo:single
pnpm run demo:multi
pnpm run demo:areas
pnpm run demo:programmatic
```

Build `@xndrjs/i18n` before running demos if the package has not been built yet:

```bash
pnpm --filter @xndrjs/i18n build
```
