---
title: Lazy loading
description: Generated namespace loaders and handle.load() for on-demand dictionaries.
---

Every namespace loads through generated `namespaceLoaders` under `codegenPath/namespace-loaders.generated.ts`. There is no eager `loadOnInit` / canonical bundle — call `load({ namespaces, locale })` for what the page needs.

```json
{
  "projectName": "MyProject",
  "delivery": "split-by-locale",
  "namespaces": {
    "default": "translations/default.json",
    "billing": "translations/billing.yaml"
  },
  "codegenPath": "generated"
}
```

```ts
import { createI18n } from "./i18n";

const { t } = await createI18n().load({
  namespaces: ["default", "billing"],
  locale: "en",
});
t("billing", "invoice_summary", { count: 12 });
```

With `delivery: "custom"`, loaders take a delivery area (mapped from locale via generated `LOCALE_DELIVERY_AREA`):

```ts
const { t } = await createI18n().load({
  namespaces: ["billing"],
  locale: "it",
});
```

`loaderStrategy: "fetch"` resolves JSON through an injectable `fetchImpl({ locale, namespace, area? })` so CMS content can update without rebuilding TypeScript. URL / storage mapping is app-owned:

```ts
const i18n = createI18n({ fetchImpl: myFetchArtifact });
const hydrated = createI18n({ fetchImpl: myFetchArtifact, state });
```

See [Delivery](/v0/infrastructure/i18n/delivery/) and [External validation](/v0/infrastructure/i18n/validation/).
