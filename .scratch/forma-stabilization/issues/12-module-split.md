# 12: Forma — split fisico dei moduli profondi

**What to build:** Layout screaming under `packages/forma/src` + tests under `test/`; `compose` as thin facade over `compileComposition` → `createCompositionRoot`; deep `ProviderScope`.

**Status:** done

## Checklist

- [x] Fase 0 — Test in `test/{provider,composition,execution,safety}/`, import da `@xndrjs/forma`, vitest/tsconfig aggiornati
- [x] Fase 1 — `compileComposition()`
- [x] Fase 2 — Root + contesti in `execution/`
- [x] Fase 3 — `ProviderScope` (modulo profondo)
- [x] Fase 4 — Provider modello vs builder
- [x] Fase 5 — Type-level compiler sotto `composition/typechecks/`

**Verify:** `pnpm --filter @xndrjs/forma test` and `typecheck`

**Refs:** plan `forma_module_split_263fb301`
