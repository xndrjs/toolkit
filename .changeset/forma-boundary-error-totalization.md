---
"@xndrjs/forma": minor
---

Replace `Result` with the four-branch `InvocationOutcome` protocol across unary and streaming
Boundary Intents. Expected failures remain contract data, while implementation throws and
rejections are totalized at their origin as opaque unexpected failures; cancellation propagates as
its own branch, and compositions may observe automatic conversions through
`onUnexpectedFailure`.
