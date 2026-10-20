# @xndrjs/struttura-demo

**Not published** — private workshop app for `@xndrjs/struttura`.

Miniature replica of the [xndrjs-monorepo](https://github.com/xndrjs) clean-architecture layout, driven by struttura constructs instead of Plop. ESLint import policies / boundaries are **wave 2** and are not demonstrated here.

## Layout

```text
src/
  architecture/          # definition + generated populate API + population
    architecture.ts
    populate-api.generated.ts      # generated (pnpm codegen)
    population.ts
    .struttura/          # success manifest (outside materialization root)
  project/               # materialization root = simulated monorepo
    apps/
    packages/
    specs/
    package.json
    pnpm-workspace.yaml
```

`src/project/{apps,packages}/*` are **members of the toolkit root pnpm workspace** so `@xndrjs/*` and cross-package `workspace:*` deps resolve with a single root `pnpm i`. The nested `pnpm-workspace.yaml` mirrors a real monorepo layout but is not used for install.

## Commands

```bash
pnpm --filter @xndrjs/struttura-demo codegen      # emit typed populate API
pnpm --filter @xndrjs/struttura-demo apply        # reconcile src/project
pnpm --filter @xndrjs/struttura-demo inspect      # plan without write
pnpm --filter @xndrjs/struttura-demo materialize  # codegen + apply
pnpm --filter @xndrjs/struttura-demo test
pnpm --filter @xndrjs/struttura-demo typecheck
```

Requires `@xndrjs/struttura` to be built (`pnpm --filter @xndrjs/struttura build`) so the `struttura` bin is available. After changing project `package.json` deps, re-run root `pnpm i`.

## Constructs ↔ monorepo elements

| Construct                                           | Monorepo element                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| `WorkspaceRoot`                                     | Root `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`              |
| `FeatureSpec`                                       | `specs/<feature>/SPEC.md` + `DESIGN.md`                                  |
| `CorePackage`                                       | `packages/core-<feature>/` shell (`package.json`, README)                |
| `ModelsModule` / `OperationsModule` / …             | Layer folder + sync barrel under the core package                        |
| `Shape` / `Primitive` / `Proof`                     | Domain kits under `models/` (via `ModelsModule`)                         |
| `Capabilities` / `DomainService`                    | `operations/*.capabilities.ts` / `*.service.ts` (via `OperationsModule`) |
| `DomainError`                                       | `errors/*.error.ts` (via `ErrorsModule`)                                 |
| `Port` / `UseCase`                                  | via `PortsModule` / `UseCasesModule`                                     |
| `InfrastructurePackage`                             | `packages/infrastructure-<name>/`                                        |
| `InfrastructureLoader` / `InfrastructureRepository` | loaders + repositories + mappers                                         |
| `UiPackage`                                         | `packages/ui-<name>/` (apps-only import rule is ESLint wave 2)           |
| `App` / `CompositionRoot`                           | `apps/<app>/` + `composition/*.composition.ts`                           |

## Population slice

`population.ts` registers one coherent **pagebuilder** vertical slice that exercises every construct once (core kits, port, use case, Contentful infra loader/repository, UI package, web-next composition root).
