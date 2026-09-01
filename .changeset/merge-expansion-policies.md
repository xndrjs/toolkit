---
"@xndrjs/resource-graph-resolver": minor
---

`createExpansionPolicyChain` now merges every matching expansion policy instead of stopping at the first match. Children are concatenated in policy order and deduplicated by `resource.toString()`.
