---
"@xndrjs/resource-graph-resolver": major
---

Require Node.js 24 or 25 (`>=24 <26`).

### Breaking

- `ResolveResourceGraphInput.root` is now `roots: readonly ApplicationResourceIdentifier[]` (non-empty). Pass a single seed as `roots: [root]`. `ResolutionStartEvent.root` is likewise `roots`.
- `DataSource.load` is positional — return `(payload | undefined)[]` with the same length and order as `batch` (`undefined` = miss; `null` remains a legal payload). Remove `ResourceRedirectRecord` / rematerialize-via-`resolves` from load; identity hops use strategy `.resolve` only.

### Redirects and resolve strategy

- Add strategy-driven post-decode redirects via `createGraphResolutionStrategy().resolve.on(…).when(…).to(…)`. The engine registers redirects then enqueues the target without expanding the locator.
- Centralize redirect graph semantics with canonical chains, cycle detection, reverse alias propagation, backing-resource parity, and alias-aware failure lookup.
- Expose `redirects` (locator → canonical ARI) on `ResolveResourceGraphOutput` so projectors can rematerialize settle targets before reading identity keys.

### Budgets and docs

- Bound every graph resolution with configurable node, edge, batch, and duration budgets. Add finite defaults, typed budget errors, observer telemetry, and deadline cancellation.
- Document first-match datasource and redirect routing (one owner per ARI family). Clarify that loaders must validate untrusted payloads at the boundary.
- Document operational adoption guidance alongside Ziel (resolver-bench orchestration modes naive / batched).
