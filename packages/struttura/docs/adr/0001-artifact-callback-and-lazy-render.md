# Tree construct placement and lazy file render

Constructs are authored with `A.construct(name, dependencies, build)` where `build` returns `A.in(destination, root)`. The root is `A.dir(...)`, `A.file(...)`, or a peer-root sibling map. Flattening produces the desired inventory (artifact keys, paths, modes); scaffold templates and sync content attached via `A.file(..., content, { mode })` run only after the full desired inventory exists (phase 5).

`dependencies` is always required (`{}` ok). Dependents see navigable children on the sealed instance (e.g. `adapter.repositories`), not a flat `.artifacts` map. Reserved top-level keys are `name`, `id`, `construct`, `dependencies`, `path`; Destination is a private symbol exposed via `A.destination`.

Content functions receive `FileRenderContext` (`name`, `id`, bound artifacts, dependency instances). Inventory query / dynamic barrel helpers are not part of the public authoring surface.
