# 0003. Structured Intent identity `(boundaryId, intentName)`

## Status

Accepted (amended: exact Contract coherence for repeated identity)

## Context

Runtime Intent identity was a fresh `Symbol` per `intent(…).contract(…)` call, while composition type-checks keyed Intents by a concatenated `` `${boundaryId}.${name}` `` string. Those two notions diverged:

- TypeScript treated equal string pairs as one graph node.
- The resolver treated each declaration object as a distinct identity.

That broke same-logical-Intent resolution across homonymous `boundary(id)` instances or repeated `intent(name)` declarations, and made dotted ids collide under concat (`a.b`+`c` vs `a`+`b.c`). Same-boundary `using` and Adapter `adapt` already brand by `BoundaryId` string — consistent with label identity, not with fresh Symbols.

## Decision

Canonical Intent identity is the structured pair `(boundaryId, intentName)`:

- Runtime registry, intent-alias rewrite, and materialization caches key by that pair (unambiguous encoding; not string concat).
- Type-level compose graph keys use the same structured pair (tuple), so concat collisions cannot alias.
- Competing providers (or provider + Intent alias) for one key throw at `compose`.
- Homonymous Boundaries / repeated Intent declarations coalesce to one identity.
- Because repeated declarations coalesce, every resolved `using` edge must see an exactly
  equivalent Contract on the required Intent and the registered Provider: reciprocal
  assignability of Input, Success/Item, Err, and modality. The same equivalence utility governs
  `aliasIntent`.
- Contract data does not enter the key. TypeScript checks the full Contract; runtime can only
  compare reified data and therefore validates modality during `aliasIntent()` and `compose()`.
- Prefer literal `boundary` / `intent` names; widening either to `string` weakens type-level completeness (documented footgun).

Rejected: caller-supplied `unique symbol` tokens as the sole identity (Option B in the architectural review) — heavier for reload and duplicate-module cases this PoC wants to treat as the same Intent.

## Consequences

- Public Intent values no longer expose a runtime `identity` symbol; use `boundaryId` + `name` (or `intentIdentity()`).
- Two declarations with the same key but a different static Contract fail at `compose` on the
  affected dependency edge. A unary/stream mismatch also fails synchronously at runtime for
  JavaScript, cast, and widened callers.
- ADR 0001 / 0002 wording about “Intent identity” means this structured key.
- Follow-on graph-plan work (cycles at compose) builds on the same key.
