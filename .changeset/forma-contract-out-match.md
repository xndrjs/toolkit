---
"@xndrjs/forma": minor
---

Add Contract-scoped `ctx.out.match` for translating dependency outcomes. Require exhaustive,
code-narrowed handlers for every declared source Expected Error while propagating Unexpected
Failure and Cancellation unchanged. Intent Expected Errors must now be `never` or object unions
with a finite string-literal `code`; undeclared runtime codes are totalized as Unexpected Failures
at the translating Provider or Adapter.
