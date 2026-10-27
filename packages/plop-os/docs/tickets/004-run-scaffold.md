# 004 — Non-interactive scaffold via node-plop

## Goal

Run Scaffold generators without prompts while applying the **same** missing-input and `validate` checks as the interactive path.

## Depends on

- 003 (plopfile exports `plopOs`; conflict helpers)

## Scope

- Dependency: `node-plop`.
- `runScaffold({ plopfile, generator, answers, destBasePath? })`:
  - Load plopfile; resolve generator; **do not** call `runPrompts`.
  - Require static `prompts` array (reject dynamic prompt functions in v1).
  - Fail if required answers missing (`undefined`/`null`; empty string allowed for optional fields).
  - Re-run each prompt’s `validate` when present (spike lesson: `runActions` alone does not).
  - Then `runActions(answers)`; surface structured failures; non-zero / throw on action failure.
- Document that prompt `validate` should call `plopOs.resolveCandidate` / shared helpers so interactive and non-interactive stay aligned.

## Out of scope

- Full CLI (005); wrapping the stock `plop` interactive binary beyond documenting coexistence.

## Acceptance

- [ ] Tests with a tiny fixture plopfile: happy path add; missing input throws; failing validate throws (e.g. wrong Candidate path); conflict `throw` fails when file exists.
- [ ] No hang waiting on inquirer in tests.

## References

- Grilling Q12, Q19
- `spike/notes.md` (validate not auto-run), `spike/src/run-scaffold.ts`
