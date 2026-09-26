---
"@xndrjs/resource-graph-resolver": major
"@xndrjs/naviql": minor
---

Breaking: `DataSource.load` is positional — return `(payload | undefined)[]` with the same length and order as `batch` (`undefined` = miss; `null` remains a legal payload). Remove `ResourceRedirectRecord` / rematerialize-via-`resolves` from load; identity hops use strategy `.resolve` only.
