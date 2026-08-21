---
"@xndrjs/resource-graph-resolver": minor
---

Replace `DataResolutionPort.resolve(list)` with pull-based `process(pull)` using `take(accept, limit?)` so the engine collaborator can saturate per-source batches and leave deferred frontier work for later rounds. The port is intended only as the engine↔gateway boundary — not a general ARI loading API.
