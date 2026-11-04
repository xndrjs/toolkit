---
"@xndrjs/forma": minor
---

Let `out.unexpectedFailure()` create and wrap an opaque failure token directly. Add an awaitable
reporter overload that always returns a Promise, preserves the same failure id, accepts synchronous
or asynchronous observability, ignores reporter results, and isolates reporter throw/rejection.
