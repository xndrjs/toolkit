# Wave 1 CLI: codegen, apply, inspect, migrate-id

Wave 1 ships four commands: `codegen` (emit typed populate API), `apply` (reconcile filesystem), `inspect` (plan/diagnostics without write), and `migrate-id` (explicit `oldId → newId` updates in the manifest). Population TypeScript is updated by the author alongside migration; the tool does not rewrite arbitrary populate sources. Architectural ESLint boundaries are demonstrated in the demo via a sync-rendered config fragment (ADR 0013), not as CLI. Untracked-file reports remain later work.
