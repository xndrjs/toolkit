# 08 — Codegen, branded refs, staleness fail-closed

**Status:** pending  
**Blocked by:** 04

## Delivers

Emit typed populate factories; `instance.artifacts.<key>` as `DirRef` | `FileRef`; wrong construct/artifact is a TypeScript error; apply/inspect fail if definition stamp mismatches; no implicit codegen on apply.

## Done when

Generated API drives population; stale stamp fails closed.

## Refs

ADRs 0010, 0012
