---
"@xndrjs/forma": minor
---

Add cold streaming Intents with cancellation, ownership, transactional startup, deterministic
cleanup, and `AsyncDisposable` surface streams. Require explicit Entry Boundaries, expose graph
provenance through `describePlan()`, and harden runtime protocol branding so ordinary spread clones
and raw Intent-alias tuples are rejected during composition.
