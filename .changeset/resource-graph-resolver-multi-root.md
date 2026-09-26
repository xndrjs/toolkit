---
"@xndrjs/resource-graph-resolver": major
---

Breaking: `ResolveResourceGraphInput.root` is now `roots: readonly ApplicationResourceIdentifier[]` (non-empty). Pass a single seed as `roots: [root]`. `ResolutionStartEvent.root` is likewise `roots`.
