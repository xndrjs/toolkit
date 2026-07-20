# @xndrjs/i18n-react

## 0.8.1

### Patch Changes

- Fix load-gate error handling: failed namespace loads no longer appear as an endless `fallback` UI. When `renderError` is omitted, the gate throws so a React error boundary can handle the failure; the load coordinator logs rejections instead of swallowing them.

  SSR `getServerSnapshot` no longer kicks client `load()` / fetch — only sync hydrate from `state` (`ensureSync` / peek). Async namespace loads start on the client only.

- Updated dependencies
  - @xndrjs/i18n@0.8.1

## 0.8.0

### Minor Changes

- **Initial release** of `@xndrjs/i18n-react` (first publish on the `latest` dist-tag; alpha was `0.8.0-alpha.0`).

  React bindings for `@xndrjs/i18n@0.8.0`:
  - **`I18nRoot` / `I18nRootProvider`** — single root context `{ handle, coordinator, locale }`; hydrate via `state` from `serialize()`, pass `fetchImpl` when core uses `loaderStrategy: "fetch"`.
  - **Namespace readiness** — `createI18nLoadGate` / generated `I18n` + `withI18n` (gate / HOC). No Suspense and no hooks-first public API.
  - **Codegen** — `xndrjs-i18n-react-codegen` emits typed bindings against the core `createI18n` options bag.

  Peer: `@xndrjs/i18n` `^0.8.0`, React `>=19`.

  Install: `npm install @xndrjs/i18n @xndrjs/i18n-react`

### Patch Changes

- Updated dependencies
  - @xndrjs/i18n@0.8.0

## 0.8.0-alpha.0

### Minor Changes

- c25c0f6: **Initial release** of `@xndrjs/i18n-react` (first publish; no prior npm line).

  React bindings for `@xndrjs/i18n`:
  - **`I18nRoot` / `I18nRootProvider`** — single root context `{ handle, coordinator, locale }`; hydrate via `state` from `serialize()`, pass `fetchImpl` when core uses `loaderStrategy: "fetch"`.
  - **Namespace readiness** — `createI18nLoadGate` / generated `I18n` + `withI18n` (gate / HOC). No Suspense and no hooks-first public API.
  - **Codegen** — `xndrjs-i18n-react-codegen` emits typed bindings against the core `createI18n` options bag.

  Peer: `@xndrjs/i18n` matching the 0.8 line, React `>=19`.

  Install (alpha): `npm install @xndrjs/i18n@alpha @xndrjs/i18n-react@alpha`

### Patch Changes

- Updated dependencies
  - @xndrjs/i18n@0.8.0-alpha.0
