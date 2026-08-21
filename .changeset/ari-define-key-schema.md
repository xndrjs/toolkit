---
"@xndrjs/application-resources": minor
---

Add a minimal ARI key-schema DSL (`s`) and `defineAri(type, ...keyPartSchemas)` with validated create + `matches` type predicates. Rest part schemas are auto-wrapped in a tuple. Field modifiers: `s.nullable` / `s.optional` (no bare `s.null`).
