# `@xndrjs/plop-os-demo`

Runnable workspace for [`@xndrjs/plop-os`](../../packages/plop-os): Discovery, Scaffold, Sync, and intentional failure cases.

```bash
pnpm --filter @xndrjs/plop-os-demo start
```

That builds `plop-os` and runs [`scripts/walkthrough.mjs`](./scripts/walkthrough.mjs) **in place** here: Scaffold/Sync write into this app so you can open the resulting files. Re-runs skip artifacts that already exist and still exercise the failure cases.

## Layout

```
plopfile.mjs          # createPlopOs + Plop generators
templates/            # Handlebars for Scaffold
packages/core-*       # Fixture cores (models / operations / ports)
apps/demo-shell/      # Hit for the regex Discovery rule
CATALOG.md            # Region synced by Sync ID core-catalog
scripts/walkthrough.mjs
```

## Casistiche

| #   | Case                                           | How                                                    |
| --- | ---------------------------------------------- | ------------------------------------------------------ |
| 1   | Inventory of scaffold / sync / discovery       | `plop-os generators`                                   |
| 2   | List `core-models` Candidates                  | `plop-os candidates --rule core-models`                |
| 3   | Narrow Discovery with `--base`                 | `… --base packages/core-billing`                       |
| 4   | Regex Discovery hatch (`apps`)                 | `plop-os candidates --rule apps`                       |
| 5   | Scaffold a new core package                    | `plop-os run core-package --input '{"name":"orders"}'` |
| 6   | Scaffold model in subdir (Candidate-validated) | `run model` + `subdir: "strips"`                       |
| 7   | Reject `operations/` as models path            | same `run model`, expect error                         |
| 8   | Missing / invalid inputs (no stdin hang)       | empty / `NotKebab` name                                |
| 9   | Conflict policy `throw`                        | scaffold same `note` twice                             |
| 10  | Sync `models-barrel` (`//` markers in `.ts`)   | `plop-os sync --id models-barrel`                      |
| 11  | Sync catalog (`#` markers in `CATALOG.md`)     | `plop-os sync --id core-catalog`                       |
| 12  | Sync limited with `--base`                     | `sync --id models-barrel --base …`                     |

## Manual CLI (from this directory)

```bash
pnpm --filter @xndrjs/plop-os run build
pnpm --filter @xndrjs/plop-os-demo exec plop-os generators
pnpm --filter @xndrjs/plop-os-demo exec plop-os candidates --rule core-models
pnpm --filter @xndrjs/plop-os-demo exec plop-os run model --input '{"modelsPath":"packages/core-pagebuilder/models","subdir":"strips","name":"hero"}'
pnpm --filter @xndrjs/plop-os-demo exec plop-os sync --id models-barrel
```

Interactive Scaffold (stock Plop) still works if you have `plop` installed globally or via the workspace.

## What stays outside plop-os

- Scaffold generators are ordinary Plop generators.
- Domain layout (`core-*`, `models/`, …) is **demo convention**, not a library ontology.
- Sync only rewrites Region interiors; handwritten lines outside markers are preserved.
