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

## Interactive Scaffold (stock Plop)

Generators in `plopfile.mjs` are ordinary Plop generators (with Discovery `validate` where needed). Interactive prompts use stock `plop`; Sync stays on the `plop-os` CLI.

```bash
# from repo root (TTY required)
pnpm --filter @xndrjs/plop-os-demo plop

# or from this directory
pnpm plop
```

Then pick e.g. `core-package` / `model` / `app` / `catalog` / `note`. After scaffolding models, run Sync (all Sync IDs, or pass flags after `--`):

```bash
pnpm --filter @xndrjs/plop-os-demo sync
pnpm --filter @xndrjs/plop-os-demo sync -- --id models-barrel
pnpm --filter @xndrjs/plop-os-demo sync -- --id core-catalog --base packages/core-billing
```

## Layout (committed)

```
plopfile.mjs            # createPlopOs + Plop generators
templates/              # Handlebars for Scaffold
scripts/walkthrough.mjs # resets + drives the cases
```

After `start`, also present (gitignored): `packages/core-*`, `apps/demo-shell/`, `notes/`, `CATALOG.md`.

## Casistiche

| #   | Case                            | How                                          |
| --- | ------------------------------- | -------------------------------------------- |
| 1   | Inventory                       | `plop-os generators`                         |
| 2   | Discovery empty                 | `candidates --rule core-models` → `[]`       |
| 3   | Scaffold cores                  | `run core-package` for pagebuilder + billing |
| 4   | Discovery hits                  | candidates appear                            |
| 5   | Narrow `--base`                 | only billing                                 |
| 6   | Scaffold app + regex Discovery  | `run app` → `candidates --rule apps`         |
| 7   | Scaffold models                 | `list` core → `list` dest dir → name         |
| 7b  | Discovery file / dir Candidates | `model-files` + `models-dirs` (`kind`)       |
| 8   | Reject `operations/`            | not a Candidate                              |
| 9   | Missing / invalid inputs        | no stdin hang                                |
| 10  | Conflict `throw`                | same `note` twice                            |
| 11  | Scaffold catalog + Sync         | `run catalog` then `sync --id core-catalog`  |
| 12  | Sync barrels via Discovery      | `models-barrel` uses `listCandidates`        |
| 13  | Sync `--base`                   | limited pass                                 |

## Manual CLI (from this directory)

```bash
pnpm --filter @xndrjs/plop-os run build
pnpm --filter @xndrjs/plop-os-demo exec plop-os generators
pnpm --filter @xndrjs/plop-os-demo exec plop-os run core-package --input '{"name":"pagebuilder"}'
pnpm --filter @xndrjs/plop-os-demo exec plop-os candidates --rule core-models
pnpm --filter @xndrjs/plop-os-demo exec plop-os run model --input '{"modelsPath":"packages/core-pagebuilder/models","destPath":"packages/core-pagebuilder/models/strips","name":"hero"}'
pnpm --filter @xndrjs/plop-os-demo exec plop-os sync --id models-barrel
```

## Notes

- Scaffold generators are ordinary Plop generators; Discovery/Sync are `@xndrjs/plop-os`.
- Domain layout (`core-*`, `models/`, …) is **demo convention**, not a library ontology.
- Sync only rewrites Region interiors; markers come from Scaffold templates.
