---
"@xndrjs/resource-graph-resolver": minor
---

Rename `ResolveContentGraphInput.context` to `executionContext`. Author expansion policies with `defineExpansionPolicy({ for, when?, expand })` — `TExecutionContext` is the first type parameter; `for` narrows the resource; optional `when` refines on the full narrowed context.
