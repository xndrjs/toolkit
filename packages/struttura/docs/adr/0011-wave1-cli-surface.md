# Wave 1 CLI: codegen, apply, inspect, migrate-id

Wave 1 ships four commands: `codegen` (emit typed populate API), `apply` (reconcile filesystem), `inspect` (plan/diagnostics without write), and `migrate-id` (explicit `oldId → newId` updates in the manifest). Population TypeScript is updated by the author alongside migration; the tool does not rewrite arbitrary populate sources. Import-policy tooling and untracked-file reports remain wave 2.
