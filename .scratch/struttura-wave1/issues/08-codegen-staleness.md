# 08 — Codegen, branded refs, staleness fail-closed

**Status:** done  
**Blocked by:** 04

## Delivers

Emit typed populate factories; `instance.artifacts.<key>` as `DirRef` | `FileRef`; wrong construct/artifact is a TypeScript error; apply/inspect fail if definition stamp mismatches; no implicit codegen on apply.

## Done when

Generated API drives population; stale stamp fails closed.

## Refs

ADRs 0010, 0012

## Notes

- `emitPopulateApi` / `computeDefinitionStamp` / `probeArtifactKinds` under `src/codegen/`
- Population carries optional `definitionStamp`; apply/inspect return `stale-generated-api`
- `file(...)` directory arg is `DirRef | DirDescriptor` (FileRef is a type error)
- CLI `codegen` command remains ticket 09
