# Artifact map callback with lazy file renderers

Construct artifacts are declared in a single callback next to `defineConstruct`, returning a keyed map of `dir(...)` / `file({ ... })` descriptors. Scaffold templates and sync renderers are attached as `file({ content })` and run only after the full desired inventory exists (phase 5), so they may use queries without deciding presence or paths.

`file` takes a single options object — `filename`, `directory`, `mode`, and optional `content` — so call sites stay explicit when wrapping across lines. We rejected positional `file(filename, directory, mode, content?)` (easy to mis-order) and dual signatures (one style only).

We rejected sibling `artifacts` + `render` maps and fluent post-hoc builders: one readable place per construct beats split declarations, and lazy render keeps the required derive-then-query sequence.
