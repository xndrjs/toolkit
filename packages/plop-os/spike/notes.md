# Spike notes (throwaway)

Reference-only lessons from the disposable PoC under `spike/src/`. Real work is tracked in `docs/tickets/`.

## What the spike showed

- **Plop handles scaffold well** via `node-plop` + `runActions(answers)` without `runPrompts`.
- **Prompt `validate` does not run automatically** on `runActions`. Non-interactive runners must re-apply static prompt `validate` and missing-key checks before actions — required for parity with interactive use.
- **Discovery + Candidate resolution** can reject non-`models/` paths and accept subdirectory creation under a Candidate.
- **Sync** can refresh a handwritten barrel from filesystem contents using `plop-os-sync` markers; fail-closed prep then write works for the single-region case.
- **Custom Plop actions are optional** for sync: keep Sync as a `plop-os` API (`plopOs.sync`), not a Plop action type.

## Limits observed

- Dynamic Plop `prompts` functions need a policy (v1 tickets: reject; require static prompts array).
- Plop change paths in results may look root-absolute depending on dest base.
- Ignore matching in the PoC was name/segment based (not full micromatch) — decide properly in ticket 001.
- Nested regions unsupported (by design).
