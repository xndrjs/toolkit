# 09: Intent alias + Adapter passthrough guidance

**What to build:** Docs/ADR: cross-boundary same-shape → Adapter passthrough; rename Binding/`bind` vocabulary to Intent alias / `aliasIntent`; glossary update; no `forward` helper. Alpha: no deprecated aliases.

**Blocked by:** 01, 02

**Status:** done

- [x] `aliasIntent(required, satisfier)` only; types `IntentAlias` / `IntentAliasPair`; `isIntentAlias`
- [x] ADR 0010 (Adapter passthrough default; Intent alias as rare rewrite)
- [x] GLOSSARY + README + demo guidance
- [x] Tests cover alias via `aliasIntent`
- [x] No rewrite-map semantic change; no `forward` helper
- [x] Changeset

**Verify:** `pnpm --filter @xndrjs/forma test` and `typecheck`

**Refs:** `packages/forma/docs/architectural-review.md` (Binding o Adapter passthrough), `packages/forma/docs/adr/0010-intent-alias.md`
