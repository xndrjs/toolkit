# 04: Surface hygiene — F5/F7/F8

**What to build:** Reserve lifecycle names on surface (`dispose`; Design C `surface` later); reject `__proto__` / non-string keys; restrict `using` / surface keys to `string`; `using` one-shot (no silent replace).

**Blocked by:** 01

**Status:** done

- [x] Runtime + type reject surface alias `dispose`
- [x] Reject `__proto__` and non-string keys on surface and `using`
- [x] `using` one-shot (type omits second call; runtime throws)
- [x] Null-prototype execution context object
- [x] Tests (surface + provider builder)
- [x] ADR 0005 + GLOSSARY / README touch

**Verify:** `pnpm --filter @xndrjs/forma test` and `typecheck`

**Refs:** `packages/forma/docs/architectural-review.md` (F5, F7, F8), `packages/forma/docs/adr/0005-surface-and-using-key-hygiene.md`
