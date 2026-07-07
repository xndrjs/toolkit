# @xndrjs/i18n-demo

Workshop app for `@xndrjs/i18n` with two consumer setups in one package:

- **`single/`** — single-file dictionary mode (`single/src/i18n/i18n.codegen.json`)
- **`multi/`** — multi-namespace mode (`multi/src/i18n/i18n.codegen.json`)

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
pnpm run i18n:audit:single
pnpm run i18n:audit:multi
pnpm run demo:single
pnpm run demo:multi
```

Build `@xndrjs/i18n` before running demos if the package has not been built yet:

```bash
pnpm --filter @xndrjs/i18n build
```
