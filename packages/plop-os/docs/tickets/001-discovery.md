# 001 — Discovery: Candidates, rules, roots, subdir sandbox

## Goal

Implement the Discovery read primitive as the shared filesystem foundation for Scaffold and Sync.

## Scope

- `DiscoveryOptions`: `roots` (default: workspace/cwd), `ignore` (sensible defaults: `node_modules`, `dist`, `.git`, …).
- `DiscoveryRule`: named rule with regex (named groups) and optional `label` mapper; v1 = glob/walk + regex/map only (no query DSL).
- `Candidate`: `{ path, label, data }`.
- `listCandidates(rule, baseDir?)` — optional `baseDir` must stay inside configured roots.
- `resolveCandidate(rule, inputPath, baseDir?)` — explicit path must equal a Candidate or throw (same rules as interactive selection).
- `resolveSubdir(candidate, relativeSubdir)` — relative only; containment check; may create later via scaffold, but resolution must not escape.

## Out of scope

- Standalone “external” Discovery productization beyond what Scaffold/Sync need (nice-to-have later).
- Persisted indexes / architecture metadata on packages.

## Acceptance

- [ ] Unit tests: match named groups → Candidate; ignore honored; baseDir outside roots throws; invalid path for rule throws; `..` subdir throws; valid nested subdir resolves.
- [ ] Public types exported from package entry (or clearly internal until 003 — prefer exporting once runtime exists; tests can import modules under test).
- [ ] No reliance on `spike/` code (rewrite cleanly; spike is reference only).

## References

- `GLOSSARY.md` — Discovery, Discovery rule, Candidate
- `spike/notes.md`, `spike/src/discovery.ts` (reference only)
