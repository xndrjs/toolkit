# plop-os — implementation tickets

Ordered backlog for the real package (not the `spike/` PoC). Glossary: [`../../GLOSSARY.md`](../../GLOSSARY.md). Spike lessons: [`../../spike/notes.md`](../../spike/notes.md).

| ID                                | Title                                               | Depends on |
| --------------------------------- | --------------------------------------------------- | ---------- |
| [001](./001-discovery.md)         | Discovery: Candidates, rules, roots, subdir sandbox | —          |
| [002](./002-sync.md)              | Sync: markers, fail-closed pass, ctx                | 001        |
| [003](./003-runtime.md)           | `createPlopOs` runtime + registration API           | 001, 002   |
| [004](./004-run-scaffold.md)      | Non-interactive scaffold via node-plop              | 003        |
| [005](./005-cli.md)               | CLI: generators / candidates / run / sync           | 003, 004   |
| [006](./006-integration-tests.md) | Integration tests replacing the spike proof         | 001–005    |
| [007](./007-docs-example.md)      | README + minimal plopfile example                   | 005, 006   |
| [008](./008-remove-spike.md)      | Delete `spike/`                                     | 006, 007   |

Suggested order: **001 → 002 → 003**, then **004** in parallel with late 002 if needed, then **005 → 006 → 007 → 008**.
