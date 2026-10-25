# Forma PoC — tickets

Vertical slices for `@xndrjs/forma`. Work **one issue file at a time**; do not start a ticket whose blockers are open.

| #   | File                                                                                         | Blocked by     |
| --- | -------------------------------------------------------------------------------------------- | -------------- |
| 01  | [issues/01-intent-primitives.md](issues/01-intent-primitives.md)                             | —              |
| 02  | [issues/02-provider-builder.md](issues/02-provider-builder.md)                               | 01             |
| 03  | [issues/03-surface-hello.md](issues/03-surface-hello.md)                                     | 02             |
| 04  | [issues/04-implicit-using-graph.md](issues/04-implicit-using-graph.md)                       | 03             |
| 05  | [issues/05-explicit-cross-boundary-binding.md](issues/05-explicit-cross-boundary-binding.md) | 03             |
| 06  | [issues/06-lifecycle-and-disposal.md](issues/06-lifecycle-and-disposal.md)                   | 03             |
| 07  | [issues/07-composition-safety.md](issues/07-composition-safety.md)                           | 04, 05         |
| 08  | [issues/08-forma-demo.md](issues/08-forma-demo.md)                                           | 04, 05, 06, 07 |

**Frontier now:** `06` (01–05 done; then `07` → `08`)

In Cursor: open that file and ask the agent to implement it (or `@` the path). The plan UI is only the overview — these files are the build units.
