# 01 — filesIn on Sync render

**Status:** done

**Blocked by:** none

## Delivers

- Extend `FileRenderContext` with `directory: DirRef` and `filesIn(dir, options?)`
- Wire `DesiredInventory` into `resolveContent` in `packages/struttura/src/apply/render-contents.ts` (inventory currently unused)
- Resolve `directory` from the file Artifact being rendered
- Listing rules: only `kind: file`; DirRef identity match (non-recursive); path subtree when `recursive: true`; `includeSelf` default false (exclude self by `instanceId` + `artifactKey`); `exclude` as string or RegExp on path relative to the DirRef
- Export types from package index
- Vertical tests: siblings, `includeSelf`, recursive, exclude, root DirRef

## Done when

Sync content functions can list managed file Artifacts under a DirRef from Desired inventory at render time; behavioral tests cover the match/exclude rules above.

## Refs

- `../spec.md`
- `packages/struttura/docs/adr/0014-inventory-listing-at-render.md`
- `packages/struttura/GLOSSARY.md`
