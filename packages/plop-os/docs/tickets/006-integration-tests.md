# 006 — Integration tests replacing the spike proof

## Goal

Encode the PoC scenarios as maintained Vitest (or similar) fixtures so the real package cannot regress the four proof points.

## Depends on

- 001–005

## Scope

Fixture workspace (temp or under `src/**/__fixtures__`) covering:

1. Scaffold a core-like package via Plop/`runScaffold`.
2. Discover valid `models/` Candidate; reject `operations/`; scaffold model in subdirectory.
3. Sync marked barrel from real filesystem (including handwritten + new model).
4. Missing/invalid inputs fail without prompts.

## Out of scope

- Keeping `spike/src/spike.ts` as a runner (superseded by this ticket; deletion in 008).

## Acceptance

- [ ] `pnpm --filter plop-os test` covers the four scenarios above.
- [ ] CI-friendly (no manual steps, no network).

## References

- `docs/initial-analysis.md` — “Primo passo richiesto”
- `spike/src/spike.ts`, `spike/notes.md`
