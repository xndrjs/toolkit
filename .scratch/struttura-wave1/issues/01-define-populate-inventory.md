# 01 — Define Architecture, Constructs, Population, desired inventory (in memory)

**Status:** done

**Blocked by:** none

## Delivers

- `defineArchitecture` / `defineConstruct` (deps + artifact callback)
- `dir` / `file` / `root`
- Typed Population collector
- Derive desired inventory (identity, paths, provenance)
- Pre-disk validations: effective IDs, filename regex, path/dir collisions, root not owned

## Done when

Guide population yields the expected path set as data; no filesystem writes.

## Refs

- `packages/struttura/analysis/initial.md` (§4–8, §11, §17)
- `packages/struttura/GLOSSARY.md`
- ADRs 0001, 0002, 0003, 0012
