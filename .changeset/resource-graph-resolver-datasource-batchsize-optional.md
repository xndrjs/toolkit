---
"@xndrjs/resource-graph-resolver": patch
---

Make `DataSource.batchSize` optional, matching `DataSourceDefinition`. Hand-written `DataSource` objects (bypassing `defineDataSourceFor`) no longer need to spell out `batchSize: undefined`.
