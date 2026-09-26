---
"@xndrjs/resource-graph-resolver": minor
---

Add strategy-driven post-decode redirects via `createGraphResolutionStrategy().resolve.on(…).when(…).to(…)`. The engine registers redirects the same way as DataSource `ResourceRedirectRecord`, then enqueues the target without expanding the locator. DataSource redirect records remain supported.
