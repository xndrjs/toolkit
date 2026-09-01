---
"@xndrjs/resource-graph-resolver": minor
---

Redesign the DataSource API around transport channels: `for` replaces per-family `families`, `batchSize` is a single channel limit, and `load(batch)` receives a flat heterogeneous batch instead of a per-family record. Resolver routing uses first-match source order; overlapping sources are not validated.
