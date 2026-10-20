# 09 — CLI wave 1 + `migrate-id`

**Status:** done  
**Blocked by:** 05, 07, 08

## Delivers

Commands: `codegen`, `apply`, `inspect`, `migrate-id` (explicit oldId→newId on manifest; author updates population TS).

## Done when

Each command is runnable end-to-end on the guide layout.

## Refs

ADR 0011

## Notes

- Bin: `struttura` → `dist/cli.js`
- Library: `migrateId` / `rewriteManifestIds` (structured manifest rewrite, collision checks)
- `runCli` / `parseCliArgs` exported for tests; modules loaded via jiti with caches disabled
