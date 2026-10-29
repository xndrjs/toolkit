# 0002. Unified wiring registration

## Status

Accepted

## Context

Composition accepted two parallel registration keys: `providers` (private Providers) and
`bindings` (identity-alias pairs, then constructed with `bind()`). Both feed the same closed
graph — Providers into the registry, aliases into the identity rewrite map — but callers had to
split one mental list across two options.

ADR 0001 kept the same-shape escape hatch and Adapter for translation. That decision stands; only
the _registration_ shape was awkward. Unifying registration must not turn an Intent alias into a
passthrough Provider or change rewrite semantics.

## Decision

Replace `providers` and `bindings` with a single optional `wiring` array on `compose`:

- Entries are Providers or branded alias pairs from `aliasIntent` (raw Intent tuples stay rejected).
- Runtime partitions `wiring` into the existing `registry` (Providers) and `aliasMap` (rewrites).
  Internal maps and resolve-by-identity rewrite are unchanged.
- Duplicate Intent alias for the same required Intent throws. Competing Provider + Intent alias for
  the same required Intent still throws.
- `surface` remains Providers only; an alias pair is not assignable as a surface alias.
- Same-boundary `aliasIntent` remains type-legal when contracts match.

An Intent alias is registered via `aliasIntent()` inside `wiring` — not a separate compose key and
not a Realization. When to prefer Adapter passthrough over an Intent alias is decided in
[0010](./0010-intent-alias.md).

## Consequences

- One registration list for private providers and Intent aliases; docs and demos show
  `compose({ surface, wiring })`.
- Glossary tracks “Intent alias in wiring,” not a dedicated `bindings` option.
- How aliases are registered is settled here; Intent-alias-as-rare / Adapter-passthrough-default is
  [0010](./0010-intent-alias.md).
- Call sites in package tests and `forma-demo` migrate in one step (PoC blast radius; no
  expand–contract).
