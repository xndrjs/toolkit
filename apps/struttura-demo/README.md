# @xndrjs/struttura-demo

**Not published** — private workshop app for `@xndrjs/struttura`.

Miniature replica of the [xndrjs-monorepo](https://github.com/xndrjs) clean-architecture layout, driven by struttura navigable-tree constructs (`A.construct` + `A.in`) instead of Plop.

**Authoring notes:** layer barrels (`models/`, `operations/`, adapter `mappers/`, …) are **sync** via `tsBarrelIndex({ recursive: true })` — regenerated from Desired inventory on apply. Package-level adapter/infra `index.ts` files remain sync with static exports. Workspace root `tsconfig.json` stays **scaffold** (hand-maintained after first write).

**ESLint boundaries:** hand-authored `eslint.config.js`, `eslint.boundaries.mjs`, and `tsconfig.eslint.json` under `src` (not struttura artifacts). No Policy type in `@xndrjs/struttura` — see ADR 0013.

## Layout

```text
architecture/            # definition + generated populate API + population
  architecture.ts
  populate-api.generated.ts      # generated (pnpm codegen)
  population.ts
  .struttura/            # success manifest (outside materialization root)
src/                     # materialization root = simulated monorepo
  apps/
  packages/
  specs/
  package.json
  pnpm-workspace.yaml
  eslint.config.js         # hand-authored (unmanaged)
  eslint.boundaries.mjs    # hand-authored (unmanaged)
  tsconfig.eslint.json     # hand-authored (unmanaged)
```

`src/{apps,packages}/*` are **members of the toolkit root pnpm workspace** so `@xndrjs/*` and cross-package `workspace:*` deps resolve with a single root `pnpm i`. The nested `pnpm-workspace.yaml` mirrors a real monorepo layout but is not used for install.

## Commands

```bash
pnpm --filter @xndrjs/struttura-demo codegen      # emit typed populate API
pnpm --filter @xndrjs/struttura-demo apply        # reconcile src
pnpm --filter @xndrjs/struttura-demo inspect      # plan without write
pnpm --filter @xndrjs/struttura-demo materialize  # codegen + apply
pnpm --filter @xndrjs/struttura-demo test
pnpm --filter @xndrjs/struttura-demo typecheck
pnpm --filter struttura-demo-project lint   # boundaries under src
```

IDE: `.vscode/settings.json` sets `eslint.workingDirectories` for `src` so Cursor uses that folder’s `eslint.config.js` (boundaries), not the toolkit root config. Root `pnpm lint` also runs the project lint.

Requires `@xndrjs/struttura` to be built (`pnpm --filter @xndrjs/struttura build`) so the `struttura` bin is available. After changing project `package.json` deps, re-run root `pnpm i`.

## Constructs ↔ monorepo elements

| Construct                               | Monorepo element                                                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `WorkspaceRoot`                         | Root `package.json`, `pnpm-workspace.yaml`, scaffold `tsconfig.json` (references maintained by hand); ESLint entry + boundaries fragment are unmanaged |
| `FeatureSpec`                           | `specs/<feature>/SPEC.md` + `DESIGN.md`                                                                                                                |
| `CorePackage`                           | `packages/core-<feature>/` shell (`package.json`, README)                                                                                              |
| `ModelsModule` / `OperationsModule` / … | Layer folder + sync barrel (`tsBarrelIndex`) under the core package                                                                                    |
| `Shape` / `Primitive` / `Proof`         | Domain kits under `models/` (via `ModelsModule`)                                                                                                       |
| `Capabilities` / `DomainService`        | `operations/*.capabilities.ts` / `*.service.ts` (via `OperationsModule`)                                                                               |
| `DomainError`                           | `errors/*.error.ts` (via `ErrorsModule`)                                                                                                               |
| `Port` / `UseCase`                      | via `PortsModule` / `UseCasesModule`                                                                                                                   |
| `InfrastructurePackage`                 | `packages/infrastructure-<name>/` (`loaders/`, `schemas/`, sync layer barrels)                                                                         |
| `InfrastructureLoader`                  | `loaders/*.loader.ts` under the vendor package                                                                                                         |
| `AdapterPackage`                        | `packages/adapter-<name>/` shell + `mappers/` + `repositories/` (+ sync layer barrels)                                                                 |
| `Mapper` / `Repository`                 | kits under adapter `mappers/` / `repositories/`                                                                                                        |
| `UiPackage`                             | `packages/ui-<name>/` (apps-only import rule is ESLint wave 2)                                                                                         |
| `App` / `CompositionRoot`               | `apps/<app>/` + `composition/*.composition.ts`                                                                                                         |

## Population slice

`population.ts` registers one coherent **pagebuilder** vertical slice that exercises every construct once (core kits, port, use case, Contentful loader, `@adapter/contentful-pagebuilder`, UI package, web-next composition root).
