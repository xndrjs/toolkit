# @xndrjs/plop-os — implementation tickets

Ordered backlog for the package. Glossary: [`../../GLOSSARY.md`](../../GLOSSARY.md).

| ID                                | Title                                               | Depends on | Status |
| --------------------------------- | --------------------------------------------------- | ---------- | ------ |
| [001](./001-discovery.md)         | Discovery: Candidates, rules, roots, subdir sandbox | —          | done   |
| [002](./002-sync.md)              | Sync: markers, fail-closed pass, ctx                | 001        | done   |
| [003](./003-runtime.md)           | `createPlopOs` runtime + registration API           | 001, 002   | done   |
| [004](./004-run-scaffold.md)      | Non-interactive scaffold via node-plop              | 003        | done   |
| [005](./005-cli.md)               | CLI: generators / candidates / run / sync           | 003, 004   | done   |
| [006](./006-integration-tests.md) | Integration tests                                   | 001–005    | done   |
| [007](./007-docs-example.md)      | README + minimal plopfile example                   | 005, 006   | done   |
| [008](./008-remove-spike.md)      | Delete disposable PoC                               | 006, 007   | done   |

Suggested historical order: **001 → 002 → 003**, then **004**, then **005 → 006 → 007 → 008**.
