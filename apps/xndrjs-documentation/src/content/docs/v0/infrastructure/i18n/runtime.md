---
title: Runtime
description: Handle API — createI18n, load, peek, serialize — for @xndrjs/i18n.
---

## Architecture

| Layer                                                | Role                                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Engine** (`IcuTranslationProviderMulti`)           | Mutable dictionary, compiled-message cache, loaded-resource registry                     |
| **Handle** (`I18nHandle` via generated `createI18n`) | `load` / `peek` / `serialize` — namespaces + locale; partition from `partitionForLocale` |
| **Scope** (`I18nScopeMultiForLocale`)                | Typed `t(namespace, key, params?)` for a bound locale                                    |

Generated `createI18n(options?)` builds the engine and returns a handle. Cold start: `createI18n()` or `createI18n({})`. Hydrate: `createI18n({ state })` where `state` is `{ dictionary, resources? }` from `serialize()`.

With `loaderStrategy: "fetch"`, options **must** include `fetchImpl`:

```ts
createI18n({ fetchImpl, state? });
```

### `load({ namespaces, locale })`

1. Requires a non-empty `namespaces` array.
2. Partition = `partitionForLocale(locale)` (identity for split-by-locale; `LOCALE_DELIVERY_AREA[locale]` for custom).
3. For each namespace, if `(namespace, partition)` is already marked loaded, skip.
4. Otherwise invoke `namespaceLoaders[ns](partition, { locale })`, merge into the engine, mark loaded.
5. Return a locale-bound scope `{ t, locale, … }`.

### `peek({ namespaces, locale })`

Sync counterpart of `load`: returns a scope when every requested resource is already loaded (e.g. after hydrate), otherwise `null`.

### `getLoadState()`

Returns a snapshot of builder resources this handle has attempted to load:

```ts
const state = i18n.getLoadState();
// { resources: [{ namespace: "billing", partition: "en", status: "loaded" }, ...] }
```

Each entry is `namespace` + `partition` (locale or delivery area) with `status: "pending" | "loaded" | "error"`. Failed loads include `error`. Resources never touched by `load()` do not appear.

### Serialize / hydrate

```ts
const i18n = createI18n();
const { t } = await i18n.load({ namespaces: ["billing"], locale: "en" });
const state = i18n.serialize();

// client (or another request)
const client = createI18n({ state });
client.peek({ namespaces: ["billing"], locale: "en" }); // scope without re-fetch
```

With fetch strategy: `createI18n({ state, fetchImpl })`.

## Usage

```ts
import { createI18n } from "./i18n/generated/instance.generated.js";

const i18n = createI18n();
const { t } = await i18n.load({
  namespaces: ["default", "billing"],
  locale: "en",
});

t("default", "welcome", { name: "Ada" });
t("billing", "invoice_summary", { count: 3 });
```

Pass `serialize()` output into React as `I18nRoot` `state` so client gates resolve via `peek` without reloading warm namespaces. See [React](/v0/infrastructure/i18n/react/), [Lazy loading](/v0/infrastructure/i18n/lazy-loading/), and [External validation](/v0/infrastructure/i18n/validation/).
