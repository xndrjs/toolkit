# 12: Forma — split fisico dei moduli profondi

**What to build:** Layout screaming under `packages/forma/src` + tests under `test/`; `compose` as thin facade over `compileComposition` → `createCompositionRoot`; deep `ProviderScope`.

**Status:** in progress

## Checklist

- [x] Fase 0 — Test in `test/{provider,composition,execution,safety}/`, import da `@xndrjs/forma`, vitest/tsconfig aggiornati
- [ ] Fase 1 — `compileComposition()`
- [ ] Fase 2 — Root + contesti in `execution/`
- [ ] Fase 3 — `ProviderScope` (modulo profondo)
- [ ] Fase 4 — Provider modello vs builder
- [ ] Fase 5 — Type-level compiler sotto `composition/typechecks/`

**Verify:** `pnpm --filter @xndrjs/forma test` and `typecheck`

**Refs:** plan `forma_module_split_263fb301`
