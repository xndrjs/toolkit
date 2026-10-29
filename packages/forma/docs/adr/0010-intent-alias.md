# 0010. Intent alias (`aliasIntent`); Adapter passthrough default

## Status

Accepted

## Context

ADR [0001](./0001-adapter-peer-of-boundary.md) kept a same-shape escape hatch (then called Binding /
`bind`) and Adapter for translation / multi-boundary orchestration. Call sites and docs leaned on
`bind(required, satisfier)` whenever contracts matched across boundaries. That erases Intent
identity distinctions that share a shape (authorization, side effects, observability) and makes
`bind` read like ordinary dependency binding rather than an identity rewrite.

Architectural review: cross-boundary same-shape wiring should default to an Adapter passthrough
Provider so origin, graph edges, lifetime, and future policy stay explicit. An identity rewrite
stays only for deliberate synonyms (rename / migration). A `forward` helper is deferred until
passthrough boilerplate appears repeatedly in real call sites. PoC is alpha — rename vocabulary in
place; no deprecated aliases.

## Decision

- **Default cross-boundary (including same shape):** realize the required Intent with an Adapter
  `.adapt(…).using(…).with(…)` passthrough (or a same-boundary Provider passthrough when both
  Intents live in one Boundary).
- **Vocabulary:** the branded wiring entry is an **Intent alias**, constructed only by
  **`aliasIntent`**. Types: `IntentAlias` / `IntentAliasPair`; guard `isIntentAlias`. The former
  names Binding / `bind` / `isBinding` are removed.
- An Intent alias is not a Realization and is not assignable as a surface Provider.
- **No `forward` helper** in this decision.

## Consequences

- README, demo, and Glossary steer callers to Adapter passthrough first; `aliasIntent` is documented
  as a rare escape hatch.
- Call sites, types, and diagnostics use alias vocabulary only.
- ADR 0001’s “prefer Adapter when shapes differ” guidance is narrowed: prefer Adapter (or
  Provider) passthrough for same-shape cross-boundary too; Intent alias only for true synonyms.
- Registration shape from [0002](./0002-unified-wiring-registration.md) is unchanged (`wiring`
  entries are still Providers or branded alias pairs).
