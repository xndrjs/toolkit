# `@xndrjs/plop-os-demo`

Runnable workspace for [`@xndrjs/plop-os`](../../packages/plop-os). Starts empty; the walkthrough **populates everything** via Scaffold / Sync so you can watch the repo fill in place.

```bash
pnpm --filter @xndrjs/plop-os-demo start
```

Each run resets `packages/`, `apps/`, `notes/`, and `CATALOG.md`, then recreates them with `plop-os`.

To wipe generated output without re-running the demo:

```bash
pnpm --filter @xndrjs/plop-os-demo clear:demo
```

## Layout (committed)

```
plopfile.mjs            # createPlopOs + Plop generators
templates/              # Handlebars for Scaffold
scripts/walkthrough.mjs # resets + drives the cases
```

After `start`, also present (gitignored): `packages/core-*`, `apps/demo-shell/`, `notes/`, `CATALOG.md`.

## Casistiche

| #   | Case                           | How                                          |
| --- | ------------------------------ | -------------------------------------------- |
| 1   | Inventory                      | `plop-os generators`                         |
| 2   | Discovery empty                | `candidates --rule core-models` → `[]`       |
| 3   | Scaffold cores                 | `run core-package` for pagebuilder + billing |
| 4   | Discovery hits                 | candidates appear                            |
| 5   | Narrow `--base`                | only billing                                 |
| 6   | Scaffold app + regex Discovery | `run app` → `candidates --rule apps`         |
| 7   | Scaffold models                | invoice, existing, hero under `strips/`      |
| 8   | Reject `operations/`           | not a Candidate                              |
| 9   | Missing / invalid inputs       | no stdin hang                                |
| 10  | Conflict `throw`               | same `note` twice                            |
| 11  | Scaffold catalog + Sync        | `run catalog` then `sync --id core-catalog`  |
| 12  | Sync barrels                   | `sync --id models-barrel`                    |
| 13  | Sync `--base`                  | limited pass                                 |

## Manual CLI (from this directory)

```bash
pnpm --filter @xndrjs/plop-os run build
pnpm --filter @xndrjs/plop-os-demo exec plop-os generators
pnpm --filter @xndrjs/plop-os-demo exec plop-os run core-package --input '{"name":"pagebuilder"}'
pnpm --filter @xndrjs/plop-os-demo exec plop-os candidates --rule core-models
pnpm --filter @xndrjs/plop-os-demo exec plop-os run model --input '{"modelsPath":"packages/core-pagebuilder/models","subdir":"strips","name":"hero"}'
pnpm --filter @xndrjs/plop-os-demo exec plop-os sync --id models-barrel
```

## Notes

- Scaffold generators are ordinary Plop generators; Discovery/Sync are `@xndrjs/plop-os`.
- Domain layout (`core-*`, `models/`, …) is **demo convention**, not a library ontology.
- Sync only rewrites Region interiors; markers come from Scaffold templates.
