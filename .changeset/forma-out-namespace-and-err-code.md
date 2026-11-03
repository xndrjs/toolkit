---
"@xndrjs/forma": minor
---

Inject Contract-scoped `out` on Provider `.with` context (`success` / `expectedError` /
`unexpectedFailure` / `cancelled` typed to that Intent's `Success` / `Err`). Keep a module-level
`out` for open-generic construction, rename the unexpected-branch helper to `unexpectedFailure`,
and standardize Expected Error examples on a `code` discriminant so they do not collide with
`outcome.kind`.
