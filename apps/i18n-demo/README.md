# @xndrjs/i18n-demo

Workshop app for `@xndrjs/i18n` with three consumer setups in one package:

- **`single/`** — single-file dictionary mode (`single/src/i18n/i18n.codegen.json`)
- **`multi/`** — multi-namespace mode with `delivery: "split-by-locale"` (`multi/src/i18n/i18n.codegen.json`)
- **`areas/`** — multi-namespace mode with `delivery: "custom"`, delivery areas `eu` / `amer`, and delivery JSON under `areas/src/public/translations/` (`deliveryOutput: "../public"` in `areas/src/i18n/i18n.codegen.json`)
- **`programmatic/`** — writes `i18n.codegen.json` via `@xndrjs/i18n/codegen` before running codegen (`programmatic/src/i18n/write-config.ts`)

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
