# 0009. `defineWiring` helpers and Provider-union rejection

## Status

Accepted

## Context

`compose` validates the closed graph with const-generic wiring tuples. An inline
`wiring: [A, B]` keeps Provider precision — this is the default, preferred call
shape. Extracting a plain array widens to `Provider[]`; type-level
`ProvidersFromWiring` then treats the list as empty and reports a false
“Missing provider.” Annotating a concrete bag as public `ComposeOptions` widens
Surface and Wiring the other way and can hide incomplete graphs. A Provider
union in one registration slot makes every branch’s Intent look registered while
runtime materializes only one.

## Decision

- **Default:** write `compose({ entryBoundaries: […], surface: { … }, wiring: […] })` inline. No
  helper required; examples and the demo prefer this form.
- Add `defineWiring(...entries)` with const generics so **extracted** wiring
  stays a precise tuple (equivalent intent to `as const` on a tuple literal).
  Use it only when the list lives in a variable or another module.
- Add `defineComposition({ entryBoundaries, surface, wiring? })` to preserve a precise options
  bag and apply the same compile-time asserts at the definition site — again
  only when the bag is extracted.
- Document that annotating configs as bare `ComposeOptions` is a footgun; prefer
  an inferred inline object, or `defineWiring` / `defineComposition` when
  extracting.
- PoC policy: reject Provider unions on surface aliases and in wiring Provider
  slots at compose types (no “every variant closes the graph” check).

## Consequences

- Call sites stay small: inline compose is enough for most compositions.
- Modular / shared wiring can still keep static completeness checks via
  `defineWiring` without inlining every Provider at the `compose` call.
- Dynamic Provider choice must resolve to one concrete Provider before compose
  (or use separate compositions). Intent aliases (`aliasIntent`) are unchanged.
