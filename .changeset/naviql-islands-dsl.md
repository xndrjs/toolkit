---
"@xndrjs/naviql": minor
---

Emit island policies from DSL `islands { on Resource … }` blocks into open `create*Strategy` builders (`islands.on(…)[.when(…)].startIsland()`), so `resolve*` / `.build()` pick them up without hand-wiring. LSP hover, completion, and go-to-definition understand island bindings and `when` paths.
