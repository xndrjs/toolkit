# 001 — Discovery: Candidates, rules, roots, subdir sandbox

## Goal

Implement the Discovery read primitive as the shared filesystem foundation for Scaffold and Sync.

## Scope

- `DiscoveryOptions`: `roots` (default: workspace/cwd), `ignore` (sensible defaults: `node_modules`, `dist`, `.git`, …). Segment-based ignore in v1 is fine (full micromatch not required).
- Walk/list under roots (glob helper such as `tinyglobby`/`fast-glob` is welcome for enumeration; not the expressive core).
- **Path → data (primary):** `path-to-regexp` patterns, e.g. `packages/core-:coreName/models` → `data: { coreName }`.
- **Escape hatches for bind/extract:**
  - `RegExp` with named groups;
  - optional custom function `(path) => data | null | false` — include in v1 **if** the shape stays trivial; otherwise drop without blocking the ticket.
- Optional `label` / `filter` mappers on top of extracted `data`.
- `DiscoveryRule`: named rule combining enumeration + bind mode above. No query DSL.
- `Candidate`: `{ path, label, data }`.
- `listCandidates(rule, baseDir?)` — optional `baseDir` must stay inside configured roots.
- `resolveCandidate(rule, inputPath, baseDir?)` — explicit path must equal a Candidate or throw (same rules as interactive selection).
- `resolveSubdir(candidate, relativeSubdir)` — relative only; containment check; may create later via scaffold, but resolution must not escape.
- Dependency: `path-to-regexp`.

## Out of scope

- Standalone “external” Discovery productization beyond what Scaffold/Sync need (nice-to-have later).
- Persisted indexes / architecture metadata on packages.
- Custom query language.

## Acceptance

- [ ] Unit tests: `path-to-regexp` pattern → Candidate.data; ignore honored; baseDir outside roots throws; invalid path for rule throws; `..` subdir throws; valid nested subdir resolves.
- [ ] At least one test for regex escape hatch (named groups).
- [ ] Custom function hatch: either covered by a test or explicitly documented as deferred in the PR notes.
- [ ] Public types exported from package entry (or clearly internal until 003 — prefer exporting once runtime exists; tests can import modules under test).
- [ ] No reliance on `spike/` code (rewrite cleanly; spike is reference only).

## References

- `GLOSSARY.md` — Discovery, Discovery rule, Candidate
- `spike/notes.md`, `spike/src/discovery.ts` (reference only; spike used regex-only)
