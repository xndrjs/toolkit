# 04 — Cross-construct DirRef + barrel via `filesIn`

**Status:** done  
**Blocked by:** 02, 03

## Delivers

Model files land in `core.artifacts.models`; sync barrel uses `query.filesIn(dirRef, includeSelf?)` (default exclude self); add/remove model updates barrel; provenance stays with producing instance.

## Done when

Pagebuilder models + `index.ts` behave as in the guide case.

## Refs

ADRs 0004, 0012
