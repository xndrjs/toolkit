---
title: Lazy loading
description: loadOnInit, generated namespace loaders, and builder load() in multi mode.
---

With `delivery: "canonical"`, list namespaces needed at startup in `loadOnInit`. With `split-by-locale` or `custom`, all namespaces are lazy and `loadOnInit` is rejected. Codegen emits typed `namespaceLoaders` wired into the builder factory — one dynamic `import()` per lazy namespace. With `delivery: "split-by-locale"`, each loader is partitioned by locale.

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

```ts
import { createI18n, defaultDictionary } from "./i18n";

const i18n = createI18n(defaultDictionary);
i18n.t("default", "login_button", "en");

const billingScope = await createI18n(defaultDictionary)
  .withNamespaces(["billing"])
  .withLocale("en")
  .load();
billingScope.t("billing", "invoice_summary", { count: 12 });
```

With `delivery: "split-by-locale"`:

```ts
const scope = await createI18n({}).withNamespaces(["billing"]).withLocale("it").load();
scope.t("billing", "invoice_summary", { count: 3 });
```

With `delivery: "custom"`:

```ts
const scope = await createI18n({})
  .withNamespaces(["default", "billing"])
  .withDeliveryArea("eu")
  .load();
// forLocale() on the returned unbound scope accepts only eu locales (DELIVERY_ARTIFACTS.eu)
```

Optional locale projection before validating external slices:

```ts
import { projectNamespaceLocales } from "./i18n/generated/instance.generated.js";

const billing = await namespaceLoaders.billing(userLocale);
const billingSlice = projectNamespaceLocales(billing, [userLocale]);
const result = validateExternalKey("billing", "invoice_summary", billingSlice.invoice_summary);
if (result.ok) {
  scope.set("billing", "invoice_summary", result.data.invoice_summary[userLocale]!);
}
```

When a key was never preloaded, `t()` resolves through `onMissing` (default: throw).

When `loadOnInit` is omitted in canonical delivery, all namespaces are statically imported (default eager behavior). `loadOnInit` is **multi mode only** and **canonical delivery only** — codegen fails if used with single-file config or with `split-by-locale` / `custom`.

`dictionarySchemaOutput` is optional for lazy loading; use it when validating external CMS/API payloads before `scope.set()`. See [External validation](/v0/infrastructure/i18n/validation/).

See [Delivery](/v0/infrastructure/i18n/delivery/) for artifact layout and [Runtime](/v0/infrastructure/i18n/runtime/) for load deduplication on the shared engine.
