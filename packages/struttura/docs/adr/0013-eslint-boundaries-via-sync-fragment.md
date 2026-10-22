# ESLint architectural boundaries as unmanaged authored files

Architectural import rules are enforced with `eslint-plugin-boundaries`. Struttura does not model Policy or own ESLint tooling files. In the demo, `eslint.config.js`, `eslint.boundaries.mjs`, and `tsconfig.eslint.json` are hand-authored under the materialization root and are not struttura artifacts. We rejected scaffolding or sync-rendering them from Structure: they do not depend on the construct graph, so duplication through apply was useless indirection.
