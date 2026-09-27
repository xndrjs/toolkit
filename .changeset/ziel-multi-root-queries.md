---
"@xndrjs/ziel": minor
---

Support multi-root queries via `roots { alias: Construction }` alongside singular `root`. IR uses `roots: QueryRoot[]`; codegen emits alias-keyed `*Result` / `project*` / `resolve*` façades while preserving single-root ergonomics. Requires `@xndrjs/resource-graph-resolver` `roots[]` resolve input.
