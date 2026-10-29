# 0002. Unified wiring registration

## Status

Accepted

## Context

Composition accepted two parallel registration keys: `providers` (private Providers) and `bindings` (`bind()` alias pairs). Both feed the same closed graph — Providers into the registry, Bindings into the identity rewrite map — but callers had to split one mental list across two options.

ADR 0001 kept Binding as the same-shape escape hatch and Adapter for translation. That decision stands; only the _registration_ shape was awkward. Unifying registration must not turn Binding into a passthrough Provider or change rewrite semantics.

## Decision

Replace `providers` and `bindings` with a single optional `wiring` array on `compose`:

- Entries are Providers or `bind()` pairs (branded; raw Intent tuples stay rejected).
- Runtime partitions `wiring` into the existing `registry` (Providers) and `bindingMap` (aliases). Internal maps and resolve-by-identity rewrite are unchanged.
- Duplicate Binding for the same required Intent throws. Competing Provider + Binding for the same required Intent still throws.
- `surface` remains Providers only; `bind` is not assignable as a surface alias.
- Same-boundary `bind` remains type-legal when contracts match.

Binding is an alias registered via `bind()` inside `wiring` — not a separate compose key and not a Realization.

## Consequences

- One registration list for private providers and identity aliases; docs and demos show `compose({ surface, wiring })`.
- Glossary Binding wording tracks “alias in wiring,” not a dedicated `bindings` option.
- ADR 0001’s Binding-as-escape-hatch guidance remains; only how Binding is registered is superseded by this decision.
- Call sites in package tests and `forma-demo` migrate in one step (PoC blast radius; no expand–contract).
