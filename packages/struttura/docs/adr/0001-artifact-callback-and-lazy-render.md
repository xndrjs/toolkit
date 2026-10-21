# Artifact map callback with lazy file renderers

Construct artifacts are declared in a single callback next to `defineConstruct`, returning a keyed map of `dir(...)` / `file({ ... })` descriptors. Scaffold templates and sync renderers are attached as `file({ content })` and run only after the full desired inventory exists (phase 5), so they may use queries without deciding presence or paths.

`file` takes a single options object — `filename`, `directory`, optional `mode` (default `"scaffold"`), and optional `content` — so call sites stay explicit when wrapping across lines. We rejected positional `file(filename, directory, mode, content?)` (easy to mis-order) and dual signatures (one style only). Layer `index.ts` barrels use `tsBarrelIndex({ directory })` (default sync); odd layouts stay as `file` + `renderTsBarrel`.

Dependency constructs use a curried form — `defineConstruct("X", { core })(({ core }) => …)` — so TypeScript can fix `TDeps` before typing the artifacts callback; a single three-argument call does not reliably infer dependency `.artifacts`. `ConstructDefinition` is generic over the descriptor map so dependents see precise `DirRef` / `FileRef` keys.

Values needed in an artifacts callback (feature name, vendor package, …) should come from **declared** dependency keys on that construct — not by walking `instance.dependencies` on another ref. That map stays erased at the type level; undeclared hops fail closed only at runtime (or silently via fallbacks). Prefer an explicit `core` / `infra` dep over `shape.dependencies.models?.dependencies.core`.

We rejected sibling `artifacts` + `render` maps and fluent post-hoc builders: one readable place per construct beats split declarations, and lazy render keeps the required derive-then-query sequence.
